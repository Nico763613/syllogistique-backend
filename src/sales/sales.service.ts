import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSalesOrderDto, DeliverSalesOrderDto, CreateSalesInvoiceDto } from './dto/sale.dto';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async nextReference(prefix: string, model: 'salesOrder' | 'salesInvoice') {
    const year = new Date().getFullYear();
    const count = await (this.prisma[model] as any).count({
      where: { reference: { startsWith: `${prefix}-${year}-` } },
    });
    return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  // ---- Devis / Bon de commande client ----

  async createOrder(dto: CreateSalesOrderDto, actorId: string) {
    if (!dto.lines?.length) throw new BadRequestException('La commande doit contenir au moins une ligne.');

    const status = dto.status ?? 'QUOTE';
    const prefix = status === 'QUOTE' ? 'DEV' : 'BCC';
    const reference = await this.nextReference(prefix, 'salesOrder');

    const order = await this.prisma.salesOrder.create({
      data: {
        siteId: dto.siteId,
        customerId: dto.customerId,
        reference,
        orderDate: new Date(dto.orderDate),
        status,
        discountPercent: dto.discountPercent ?? 0,
        taxPercent: dto.taxPercent ?? 0,
        notes: dto.notes,
        createdById: actorId,
        lines: {
          create: dto.lines.map((l) => ({
            itemId: l.itemId,
            quantityOrdered: l.quantityOrdered,
            unitPrice: l.unitPrice,
            lineTotal: Number((l.quantityOrdered * l.unitPrice).toFixed(2)),
          })),
        },
      },
      include: { lines: true, customer: true },
    });

    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'SalesOrder', entityId: order.id, newValue: dto });
    return order;
  }

  findAllOrders(params: { siteId?: string; status?: string }) {
    return this.prisma.salesOrder.findMany({
      where: { ...(params.siteId ? { siteId: params.siteId } : {}), ...(params.status ? { status: params.status as any } : {}) },
      include: { customer: true, lines: true },
      orderBy: { orderDate: 'desc' },
    });
  }

  async findOrder(id: string) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: { customer: true, lines: { include: { item: true } }, invoices: true },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    return order;
  }

  // Transforme un devis en commande confirmée
  async confirm(id: string, actorId: string) {
    const order = await this.prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Commande introuvable.');
    const updated = await this.prisma.salesOrder.update({ where: { id }, data: { status: 'CONFIRMED' } });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'SalesOrder', entityId: id, newValue: { event: 'CONFIRMED' } });
    return updated;
  }

  // ---- Livraison : sortie de stock automatique, bloquée si stock insuffisant ----

  async deliver(orderId: string, dto: DeliverSalesOrderDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
      if (!order) throw new NotFoundException('Commande introuvable.');

      for (const del of dto.lines) {
        const line = order.lines.find((l) => l.id === del.lineId);
        if (!line) throw new BadRequestException(`Ligne inconnue : ${del.lineId}`);

        const remaining = Number(line.quantityOrdered) - Number(line.quantityDelivered);
        if (del.quantityDelivered > remaining) {
          throw new BadRequestException(
            `Quantité livrée (${del.quantityDelivered}) supérieure à la quantité restant à livrer (${remaining}).`,
          );
        }

        const item = await tx.inventoryItem.findUnique({ where: { id: line.itemId } });
        if (!item) throw new NotFoundException('Article introuvable.');
        if (!dto.allowNegative && Number(item.currentQuantity) < del.quantityDelivered) {
          throw new BadRequestException(
            `Stock insuffisant pour ${item.name} : disponible ${item.currentQuantity} ${item.unit}, demandé ${del.quantityDelivered}.`,
          );
        }

        await tx.salesOrderLine.update({
          where: { id: line.id },
          data: { quantityDelivered: { increment: del.quantityDelivered } },
        });

        await tx.stockMovement.create({
          data: {
            itemId: line.itemId,
            siteId: order.siteId,
            movementType: 'OUT',
            quantity: del.quantityDelivered,
            reference: order.reference,
            unitPrice: item.unitPrice ?? undefined,
            totalValue: item.unitPrice ? Number((Number(item.unitPrice) * del.quantityDelivered).toFixed(2)) : undefined,
            reason: 'Livraison commande client',
            createdById: actorId,
          },
        });
        await tx.inventoryItem.update({
          where: { id: line.itemId },
          data: { currentQuantity: { decrement: del.quantityDelivered } },
        });
      }

      const updatedLines = await tx.salesOrderLine.findMany({ where: { salesOrderId: orderId } });
      const fullyDelivered = updatedLines.every((l) => Number(l.quantityDelivered) >= Number(l.quantityOrdered));
      const partiallyDelivered = updatedLines.some((l) => Number(l.quantityDelivered) > 0);

      const status = fullyDelivered ? 'DELIVERED' : partiallyDelivered ? 'PARTIALLY_DELIVERED' : order.status;
      const updatedOrder = await tx.salesOrder.update({ where: { id: orderId }, data: { status } });

      await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'SalesOrder', entityId: orderId, newValue: dto });
      return updatedOrder;
    });
  }

  // ---- Facturation client ----

  async createInvoiceFromOrder(orderId: string, dto: CreateSalesInvoiceDto, actorId: string) {
    const order = await this.prisma.salesOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
    if (!order) throw new NotFoundException('Commande introuvable.');

    const subtotal = order.lines.reduce((sum, l) => sum + Number(l.lineTotal), 0);
    const discountAmount = Number((subtotal * (Number(order.discountPercent) / 100)).toFixed(2));
    const taxableBase = subtotal - discountAmount;
    const taxAmount = Number((taxableBase * (Number(order.taxPercent) / 100)).toFixed(2));
    const totalAmount = Number((taxableBase + taxAmount).toFixed(2));

    const reference = await this.nextReference('FV', 'salesInvoice');

    const invoice = await this.prisma.salesInvoice.create({
      data: {
        siteId: order.siteId,
        customerId: order.customerId,
        salesOrderId: order.id,
        reference,
        invoiceDate: new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        paymentTerm: dto.paymentTerm,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        status: 'UNPAID',
        createdById: actorId,
      },
    });

    await this.prisma.salesOrder.update({ where: { id: order.id }, data: { status: 'INVOICED' } });
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'SalesInvoice', entityId: invoice.id, newValue: dto });
    return invoice;
  }

  findAllInvoices(params: { siteId?: string; status?: string }) {
    return this.prisma.salesInvoice.findMany({
      where: { ...(params.siteId ? { siteId: params.siteId } : {}), ...(params.status ? { status: params.status as any } : {}) },
      include: { customer: true, payments: true },
      orderBy: { invoiceDate: 'desc' },
    });
  }

  async findInvoice(id: string) {
    const invoice = await this.prisma.salesInvoice.findUnique({
      where: { id },
      include: { customer: true, payments: true, salesOrder: { include: { lines: { include: { item: true } } } } },
    });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    return invoice;
  }
}
