import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto, CreatePurchaseInvoiceDto } from './dto/purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async nextReference(prefix: string, model: 'purchaseOrder' | 'purchaseInvoice') {
    const year = new Date().getFullYear();
    const count = await (this.prisma[model] as any).count({
      where: { reference: { startsWith: `${prefix}-${year}-` } },
    });
    return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  // ---- Bons de commande fournisseur ----

  async createOrder(dto: CreatePurchaseOrderDto, actorId: string) {
    if (!dto.lines?.length) throw new BadRequestException('Le bon de commande doit contenir au moins une ligne.');

    const reference = await this.nextReference('BC', 'purchaseOrder');
    const order = await this.prisma.purchaseOrder.create({
      data: {
        siteId: dto.siteId,
        supplierId: dto.supplierId,
        reference,
        orderDate: new Date(dto.orderDate),
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        notes: dto.notes,
        attachmentUrl: dto.attachmentUrl,
        status: 'CONFIRMED',
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
      include: { lines: true, supplier: true },
    });

    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'PurchaseOrder', entityId: order.id, newValue: dto });
    return order;
  }

  findAllOrders(params: { siteId?: string; status?: string }) {
    return this.prisma.purchaseOrder.findMany({
      where: { ...(params.siteId ? { siteId: params.siteId } : {}), ...(params.status ? { status: params.status as any } : {}) },
      include: { supplier: true, lines: true },
      orderBy: { orderDate: 'desc' },
    });
  }

  async findOrder(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { supplier: true, lines: { include: { item: true } }, invoices: true },
    });
    if (!order) throw new NotFoundException('Bon de commande introuvable.');
    return order;
  }

  // ---- Réception de marchandises : met à jour le stock automatiquement ----

  async receive(orderId: string, dto: ReceivePurchaseOrderDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
      if (!order) throw new NotFoundException('Bon de commande introuvable.');

      for (const recv of dto.lines) {
        const line = order.lines.find((l) => l.id === recv.lineId);
        if (!line) throw new BadRequestException(`Ligne inconnue : ${recv.lineId}`);

        const remaining = Number(line.quantityOrdered) - Number(line.quantityReceived);
        if (recv.quantityReceived > remaining) {
          throw new BadRequestException(
            `Quantité reçue (${recv.quantityReceived}) supérieure à la quantité restant à recevoir (${remaining}) pour cette ligne.`,
          );
        }

        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { quantityReceived: { increment: recv.quantityReceived } },
        });

        // Entrée de stock automatique + mise à jour du prix d'achat de référence
        await tx.stockMovement.create({
          data: {
            itemId: line.itemId,
            siteId: order.siteId,
            movementType: 'IN',
            quantity: recv.quantityReceived,
            supplierId: order.supplierId,
            reference: order.reference,
            unitPrice: line.unitPrice,
            totalValue: Number((Number(line.unitPrice) * recv.quantityReceived).toFixed(2)),
            reason: 'Réception bon de commande',
            createdById: actorId,
          },
        });
        await tx.inventoryItem.update({
          where: { id: line.itemId },
          data: { currentQuantity: { increment: recv.quantityReceived }, unitPrice: line.unitPrice },
        });
      }

      const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: orderId } });
      const fullyReceived = updatedLines.every((l) => Number(l.quantityReceived) >= Number(l.quantityOrdered));
      const partiallyReceived = updatedLines.some((l) => Number(l.quantityReceived) > 0);

      const status = fullyReceived ? 'RECEIVED' : partiallyReceived ? 'PARTIALLY_RECEIVED' : order.status;
      const updatedOrder = await tx.purchaseOrder.update({ where: { id: orderId }, data: { status } });

      await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'PurchaseOrder', entityId: orderId, newValue: dto });
      return updatedOrder;
    });
  }

  // ---- Facturation fournisseur ----

  async createInvoiceFromOrder(orderId: string, dto: CreatePurchaseInvoiceDto, actorId: string) {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
    if (!order) throw new NotFoundException('Bon de commande introuvable.');

    const totalAmount = order.lines.reduce((sum, l) => sum + Number(l.lineTotal), 0);
    const reference = await this.nextReference('FA', 'purchaseInvoice');

    const invoice = await this.prisma.purchaseInvoice.create({
      data: {
        siteId: order.siteId,
        supplierId: order.supplierId,
        purchaseOrderId: order.id,
        reference,
        invoiceDate: new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        paymentTerm: dto.paymentTerm,
        totalAmount,
        status: 'UNPAID',
        createdById: actorId,
      },
    });

    await this.prisma.purchaseOrder.update({ where: { id: order.id }, data: { status: 'INVOICED' } });
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'PurchaseInvoice', entityId: invoice.id, newValue: dto });
    return invoice;
  }

  findAllInvoices(params: { siteId?: string; status?: string }) {
    return this.prisma.purchaseInvoice.findMany({
      where: { ...(params.siteId ? { siteId: params.siteId } : {}), ...(params.status ? { status: params.status as any } : {}) },
      include: { supplier: true, payments: true },
      orderBy: { invoiceDate: 'desc' },
    });
  }
}
