import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto, CreatePurchaseInvoiceDto, CreateReorderDraftsDto, CancelPurchaseOrderDto } from './dto/purchase.dto';
import { getIssuer } from '../common/issuer';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class PurchasesService {
  constructor(private prisma: PrismaService, private audit: AuditService, private inventory: InventoryService) {}

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
      if (order.status === 'DRAFT' || order.status === 'CANCELLED') {
        throw new BadRequestException("Ce bon de commande n'est pas réceptionnable (brouillon ou annulé).");
      }

      const receiptLines: Array<{
        purchaseOrderLineId: string; itemId: string; quantityReceived: number;
        quantityAccepted: number; quantityRejected: number; rejectReason?: string;
      }> = [];

      for (const recv of dto.lines) {
        const line = order.lines.find((l) => l.id === recv.lineId);
        if (!line) throw new BadRequestException(`Ligne inconnue : ${recv.lineId}`);

        const rejected = recv.quantityRejected ?? 0;
        if (rejected > recv.quantityReceived) {
          throw new BadRequestException('La quantité rejetée dépasse la quantité livrée.');
        }
        if (rejected > 0 && !recv.rejectReason?.trim()) {
          throw new BadRequestException('Indiquez le motif du rejet.');
        }
        const accepted = Number((recv.quantityReceived - rejected).toFixed(3));

        const remaining = Number(line.quantityOrdered) - Number(line.quantityReceived);
        if (accepted > remaining) {
          throw new BadRequestException(
            `Quantité acceptée (${accepted}) supérieure à la quantité restant à recevoir (${remaining}) pour cette ligne.`,
          );
        }

        receiptLines.push({
          purchaseOrderLineId: line.id,
          itemId: line.itemId,
          quantityReceived: recv.quantityReceived,
          quantityAccepted: accepted,
          quantityRejected: rejected,
          rejectReason: recv.rejectReason?.trim(),
        });
        if (accepted <= 0) continue; // tout refusé : aucune entrée de stock

        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { quantityReceived: { increment: accepted } },
        });

        // Entrée de stock automatique + mise à jour du prix d'achat de référence
        await tx.stockMovement.create({
          data: {
            itemId: line.itemId,
            siteId: order.siteId,
            movementType: 'IN',
            quantity: accepted,
            supplierId: order.supplierId,
            reference: order.reference,
            unitPrice: line.unitPrice,
            totalValue: Number((Number(line.unitPrice) * accepted).toFixed(2)),
            reason: 'Réception bon de commande',
            reasonCode: 'RECEIPT',
            createdById: actorId,
          },
        });
        await tx.inventoryItem.update({
          where: { id: line.itemId },
          data: { currentQuantity: { increment: accepted }, unitPrice: line.unitPrice },
        });
      }

      // Bon de réception (traçabilité : livré / accepté / rejeté, fret, bon de livraison)
      const receipt = await tx.goodsReceipt.create({
        data: {
          siteId: order.siteId,
          purchaseOrderId: orderId,
          reference: order.reference,
          deliveryNoteNo: dto.deliveryNoteNo,
          freightCost: Math.round(dto.freightCost ?? 0),
          notes: dto.notes,
          createdBy: actorId,
          lines: { create: receiptLines },
        },
      });

      const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: orderId } });
      const fullyReceived = updatedLines.every((l) => Number(l.quantityReceived) >= Number(l.quantityOrdered));
      const partiallyReceived = updatedLines.some((l) => Number(l.quantityReceived) > 0);

      const status = fullyReceived ? 'RECEIVED' : partiallyReceived ? 'PARTIALLY_RECEIVED' : order.status;
      const updatedOrder = await tx.purchaseOrder.update({
        where: { id: orderId },
        data: { status, ...(dto.freightCost ? { freightCost: { increment: Math.round(dto.freightCost) } } : {}) },
      });

      await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'PurchaseOrder', entityId: orderId, newValue: { ...dto, goodsReceiptId: receipt.id } });
      return updatedOrder;
    });
  }

  // ---- Réapprovisionnement automatique ----

  // Articles à commander, groupés par fournisseur. La quantité déjà commandée (bons ouverts) est déduite
  // pour ne pas commander deux fois la même chose.
  async reorderSuggestions(siteId: string, days = 30) {
    const rows = await this.inventory.analysis(siteId, days);
    const openLines = await this.prisma.purchaseOrderLine.findMany({
      where: { purchaseOrder: { siteId, status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] } } },
    });
    const onOrder = new Map<string, number>();
    for (const l of openLines) {
      onOrder.set(l.itemId, (onOrder.get(l.itemId) ?? 0) + Number(l.quantityOrdered) - Number(l.quantityReceived));
    }

    const suppliers = new Map<string, { supplierId: string; supplierName: string; lines: any[]; total: number }>();
    const withoutSupplier: any[] = [];
    for (const r of rows) {
      const pending = onOrder.get(r.itemId) ?? 0;
      const quantity = Math.max(0, r.suggestedQuantity - pending);
      if (quantity <= 0) continue;
      const line = {
        itemId: r.itemId,
        sku: r.sku,
        name: r.name,
        unit: r.unit,
        state: r.state,
        currentQuantity: r.currentQuantity,
        coverageDays: r.coverageDays,
        alreadyOnOrder: pending,
        quantity,
        unitPrice: r.unitPrice,
        lineTotal: Math.round(quantity * r.unitPrice),
      };
      if (!r.supplierId) {
        withoutSupplier.push(line);
        continue;
      }
      const group = suppliers.get(r.supplierId) ?? { supplierId: r.supplierId, supplierName: r.supplierName ?? '', lines: [], total: 0 };
      group.lines.push(line);
      group.total += line.lineTotal;
      suppliers.set(r.supplierId, group);
    }
    const groups = [...suppliers.values()];
    return {
      suppliers: groups,
      withoutSupplier,
      totalEstimated: groups.reduce((s, g) => s + g.total, 0),
    };
  }

  // Crée un bon de commande BROUILLON par fournisseur (à confirmer par un administrateur)
  async createDraftOrders(dto: CreateReorderDraftsDto, actorId: string) {
    const suggestions = await this.reorderSuggestions(dto.siteId, dto.days ?? 30);
    const created: Array<{ id: string; reference: string; supplier: string; lines: number; total: number }> = [];

    for (const group of suggestions.suppliers) {
      const lines = group.lines.filter((l) => !dto.itemIds || dto.itemIds.includes(l.itemId));
      if (lines.length === 0) continue;
      const reference = await this.nextReference('BC', 'purchaseOrder');
      const order = await this.prisma.purchaseOrder.create({
        data: {
          siteId: dto.siteId,
          supplierId: group.supplierId,
          reference,
          orderDate: new Date(),
          status: 'DRAFT',
          notes: 'Brouillon généré automatiquement (réapprovisionnement) — à vérifier et confirmer.',
          createdById: actorId,
          lines: {
            create: lines.map((l) => ({
              itemId: l.itemId,
              quantityOrdered: l.quantity,
              unitPrice: l.unitPrice,
              lineTotal: Number((l.quantity * l.unitPrice).toFixed(2)),
            })),
          },
        },
      });
      await this.audit.log({
        userId: actorId,
        action: 'CREATE',
        entity: 'PurchaseOrder',
        entityId: order.id,
        newValue: { reference, source: 'REORDER', supplier: group.supplierName, lignes: lines.length },
      });
      created.push({ id: order.id, reference, supplier: group.supplierName, lines: lines.length, total: lines.reduce((s, l) => s + l.lineTotal, 0) });
    }
    return { created, skippedWithoutSupplier: suggestions.withoutSupplier.length };
  }

  // Validation d'un brouillon (réservée aux administrateurs)
  async confirmOrder(id: string, actorId: string) {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Bon de commande introuvable.');
    if (order.status !== 'DRAFT') throw new BadRequestException('Seul un bon de commande en brouillon peut être confirmé.');
    const updated = await this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'CONFIRMED', approvedBy: actorId, approvedAt: new Date() } });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'PurchaseOrder', entityId: id, oldValue: { status: 'DRAFT' }, newValue: { status: 'CONFIRMED' } });
    return updated;
  }

  async cancelOrder(id: string, dto: CancelPurchaseOrderDto, actorId: string) {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
    if (!order) throw new NotFoundException('Bon de commande introuvable.');
    if (order.status !== 'DRAFT' && order.status !== 'CONFIRMED') {
      throw new BadRequestException('Seul un bon de commande brouillon ou confirmé (sans réception) peut être annulé.');
    }
    if (order.lines.some((l) => Number(l.quantityReceived) > 0)) {
      throw new BadRequestException('Des marchandises ont déjà été reçues : annulation impossible.');
    }
    const updated = await this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'PurchaseOrder',
      entityId: id,
      oldValue: { status: order.status },
      newValue: { status: 'CANCELLED' },
      reason: dto.reason.trim(),
    });
    return updated;
  }

  // ---- Bon de commande imprimable (PDF) ----

  async orderPdf(id: string, userId: string): Promise<Buffer> {
    const issuer = await getIssuer(this.prisma, userId);
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        site: { include: { organization: true } },
        lines: { include: { item: { select: { sku: true, name: true, unit: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Bon de commande introuvable.');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const navy = '#163A5F';
      const gold = '#E0A72E';
      const n = (v: number) => Math.round(v).toLocaleString('fr-FR');
      const d = new Date(order.orderDate).toLocaleDateString('fr-FR');

      doc.rect(0, 0, doc.page.width, 70).fill(navy);
      doc.fillColor('#FFFFFF').fontSize(18).text(order.site.organization?.name ?? 'SYLLOGISTIQUE', 50, 20);
      doc.fillColor(gold).fontSize(12).text('BON DE COMMANDE', 50, 44);
      doc.fillColor('#000000').fontSize(10);
      doc.text(`N° ${order.reference}   —   Date : ${d}   —   Statut : ${order.status}`, 50, 85);
      doc.text(`Site : ${order.site.name}`);
      doc.moveDown();

      doc.fillColor(navy).fontSize(12).text('Fournisseur', { underline: true });
      doc.fillColor('#000000').fontSize(10).text(order.supplier.name);
      if (order.supplier.contactName) doc.text(`Contact : ${order.supplier.contactName}`);
      if (order.supplier.phone) doc.text(`Tél. : ${order.supplier.phone}`);
      if (order.supplier.email) doc.text(`E-mail : ${order.supplier.email}`);
      if (order.supplier.address) doc.text(`Adresse : ${order.supplier.address}`);
      if (order.expectedDate) doc.text(`Livraison souhaitée : ${new Date(order.expectedDate).toLocaleDateString('fr-FR')}`);
      doc.moveDown();

      const x = [50, 130, 330, 400, 470];
      let y = doc.y;
      doc.fillColor(navy).fontSize(10);
      ['Code', 'Désignation', 'Qté', 'P.U. (GNF)', 'Total (GNF)'].forEach((h, i) => doc.text(h, x[i], y, { width: i === 1 ? 190 : 70 }));
      y += 16;
      doc.moveTo(50, y - 2).lineTo(545, y - 2).strokeColor(gold).stroke();
      doc.fillColor('#000000');
      let total = 0;
      for (const l of order.lines) {
        if (y > 720) { doc.addPage(); y = 50; }
        const lineTotal = Number(l.lineTotal);
        total += lineTotal;
        doc.text(l.item.sku, x[0], y, { width: 75 });
        doc.text(l.item.name, x[1], y, { width: 190 });
        doc.text(`${n(Number(l.quantityOrdered))} ${l.item.unit}`, x[2], y, { width: 70 });
        doc.text(n(Number(l.unitPrice)), x[3], y, { width: 70 });
        doc.text(n(lineTotal), x[4], y, { width: 75 });
        y += 18;
      }
      doc.moveTo(50, y).lineTo(545, y).strokeColor(gold).stroke();
      doc.fillColor(navy).fontSize(12).text(`TOTAL : ${n(total)} GNF`, 50, y + 8, { align: 'right', width: 495 });
      doc.fillColor('#000000').fontSize(10);
      if (order.notes) doc.text(`Notes : ${order.notes}`, 50, y + 34, { width: 495 });

      doc.moveDown(3);
      const sy = Math.min(doc.y + 20, 700);
      doc.fillColor(navy).text('Établi par', 50, sy, { underline: true });
      doc.fillColor('#000000').text(issuer.name, 50, sy + 14);
      if (issuer.service) doc.text(issuer.service);
      if (issuer.phone) doc.text(`Tél. : ${issuer.phone}`);
      doc.fillColor(navy).text('Approuvé par (signature et cachet)', 330, sy, { underline: true });
      doc.fillColor('#555555').fontSize(8).text(`Généré le ${new Date().toLocaleString('fr-FR')} — SYLLOGISTIQUE`, 50, 780);
      doc.end();
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
