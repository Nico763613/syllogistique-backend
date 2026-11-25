import { randomUUID } from 'crypto';
import { nextDocNumber, maxSeqOf } from '../common/doc-numbers';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSalesOrderDto, DeliverSalesOrderDto, CreateSalesInvoiceDto } from './dto/sale.dto';
import { Actor, isCommercialManager, toNumber } from '../common/actor';
import { numericSettings } from '../common/settings-util';

// Plafonds de remise par rôle (en %, modifiables dans les réglages)
const DISCOUNT_CAPS = { CASHIER_DISCOUNT_CAP_PERCENT: 5, MANAGER_DISCOUNT_CAP_PERCENT: 15 };

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Numérotation centrale atomique (voir common/doc-numbers.ts) : jamais de doublon ni de numéro réutilisé.
  private async nextReference(prefix: string, model: 'salesOrder' | 'salesInvoice', by?: string) {
    return nextDocNumber(this.prisma as any, prefix, prefix, async (year) => {
      const rows = await (this.prisma[model] as any).findMany({ where: { reference: { startsWith: `${prefix}-${year}-` } }, select: { reference: true } });
      return maxSeqOf(rows.map((r: any) => r.reference));
    }, { by });
  }

  // ---- Devis / Bon de commande client ----

  async createOrder(dto: CreateSalesOrderDto, actor: Actor) {
    const actorId = actor.userId;
    if (!dto.lines?.length) throw new BadRequestException('La commande doit contenir au moins une ligne.');
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && dto.siteId !== actor.siteId) {
      throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
    }

    // Plafond de remise selon le rôle : le caissier est limité, le responsable commercial a un plafond plus haut
    const discount = dto.discountPercent ?? 0;
    if (discount > 0 && (actor.role === 'CAISSIER' || actor.role === 'RESPONSABLE_COMMERCIAL')) {
      const caps = await numericSettings(this.prisma, DISCOUNT_CAPS);
      const cap = actor.role === 'CAISSIER' ? caps.CASHIER_DISCOUNT_CAP_PERCENT : caps.MANAGER_DISCOUNT_CAP_PERCENT;
      if (discount > cap) throw new ForbiddenException(`Remise limitée à ${cap} % pour votre rôle.`);
    }

    const status = dto.status ?? 'QUOTE';
    const prefix = status === 'QUOTE' ? 'DEV' : 'BCC';
    const reference = await this.nextReference(prefix, 'salesOrder', actor.userId);

    const order = await this.prisma.salesOrder.create({
      data: {
        siteId: dto.siteId,
        customerId: dto.customerId,
        reference,
        orderDate: new Date(dto.orderDate),
        status,
        discountPercent: dto.discountPercent ?? 0,
        taxPercent: dto.taxPercent ?? 0,
        saleType: dto.saleType ?? 'CASH',
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

  async deliver(orderId: string, dto: DeliverSalesOrderDto, actorId: string, actorRole?: string) {
    // Livrer sans stock suffisant est réservé à la direction (et tracé) ; jamais décidé par le client seul.
    const forceNegative = !!dto.allowNegative && (actorRole === 'SUPER_ADMIN' || actorRole === 'ADMIN_LOGISTIQUE');
    const seen = new Set<string>();
    for (const d of dto.lines) {
      if (seen.has(d.lineId)) throw new BadRequestException('Une même ligne ne peut pas figurer deux fois dans la livraison.');
      seen.add(d.lineId);
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
      if (!order) throw new NotFoundException('Commande introuvable.');
      if (order.status === 'CANCELLED' || order.status === 'QUOTE') {
        throw new BadRequestException("Cette commande n'est pas livrable (devis, brouillon ou annulée).");
      }

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
        if (!forceNegative && Number(item.currentQuantity) < del.quantityDelivered) {
          throw new BadRequestException(
            `Stock insuffisant pour ${item.name} : disponible ${item.currentQuantity} ${item.unit}, demandé ${del.quantityDelivered}.`,
          );
        }

        // Garde atomique : deux livraisons simultanées ne peuvent pas dépasser la quantité commandée.
        const claimed = await tx.salesOrderLine.updateMany({
          where: { id: line.id, quantityDelivered: { lte: Number(line.quantityOrdered) - del.quantityDelivered } },
          data: { quantityDelivered: { increment: del.quantityDelivered } },
        });
        if (claimed.count !== 1) throw new BadRequestException('Cette ligne vient d\'être livrée par une autre opération.');

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

      // Bon de livraison numéroté (BL-AAAA-NNNN) : une trace par livraison, partielle ou totale
      const bl = await this.createDeliveryNote(tx, order, dto, updatedLines, actorId);
      await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'SalesOrder', entityId: orderId, newValue: { ...dto, deliveryNote: bl.number } });
      return { ...updatedOrder, deliveryNote: bl };
    });
  }

  private async createDeliveryNote(tx: any, order: any, dto: DeliverSalesOrderDto, updatedLines: any[], actorId: string) {
    const items = await tx.inventoryItem.findMany({ where: { id: { in: order.lines.map((l: any) => l.itemId) } }, select: { id: true, name: true } });
    const name = new Map<string, string>(items.map((i: any) => [i.id, i.name]));
    const lines = dto.lines.filter((d) => d.quantityDelivered > 0).map((d) => {
      const l = order.lines.find((x: any) => x.id === d.lineId); const u = updatedLines.find((x: any) => x.id === d.lineId);
      return { item: name.get(l.itemId) ?? '—', ordered: Number(l.quantityOrdered), deliveredNow: d.quantityDelivered, deliveredTotal: Number(u.quantityDelivered), remaining: Math.max(0, Number(l.quantityOrdered) - Number(u.quantityDelivered)) };
    });
    const number = await nextDocNumber(tx, 'BL', 'BL', async (year) => {
      const rows = (await tx.$queryRawUnsafe('SELECT "number" AS n FROM "delivery_notes" WHERE "number" LIKE $1', `BL-${year}-%`)) as any[];
      return maxSeqOf(rows.map((r) => r.n));
    }, { by: actorId });
    const id = randomUUID();
    await tx.$executeRawUnsafe('INSERT INTO "delivery_notes" ("id","number","order_id","delivered_by","receiver_name","place","driver_name","observations","lines") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)', id, number, order.id, actorId, dto.receiverName ?? null, dto.place ?? null, null, dto.observations ?? null, JSON.stringify(lines));
    return { id, number };
  }

  // ---- Facturation client ----

  async createInvoiceFromOrder(orderId: string, dto: CreateSalesInvoiceDto, actor: Actor) {
    const actorId = actor.userId;
    const order = await this.prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: { lines: { include: { item: { select: { unitPrice: true } } } } },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && order.siteId !== actor.siteId) {
      throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
    }

    // Le caissier ne peut facturer que caisse ouverte ; la facture est rattachée à sa session
    const session = await this.prisma.cashSession.findFirst({ where: { cashierId: actorId, closedAt: null } });
    if (actor.role === 'CAISSIER' && !session) {
      throw new BadRequestException('Ouvrez votre caisse avant de facturer.');
    }

    const subtotal = order.lines.reduce((sum, l) => sum + Number(l.lineTotal), 0);
    const discountAmount = Number((subtotal * (Number(order.discountPercent) / 100)).toFixed(2));
    const taxableBase = subtotal - discountAmount;
    const taxAmount = Number((taxableBase * (Number(order.taxPercent) / 100)).toFixed(2));
    const totalAmount = Number((taxableBase + taxAmount).toFixed(2));

    // Échéancier (vente échelonnée) : somme = total TTC
    const installments = dto.installments ?? [];
    if (installments.length) {
      const sum = installments.reduce((a, i) => a + i.amount, 0);
      if (Math.abs(sum - totalAmount) > 1) {
        throw new BadRequestException(`La somme des échéances (${sum}) doit égaler le total TTC (${Math.round(totalAmount)}).`);
      }
    }

    // Coût des marchandises vendues (marge) : renseigné seulement si tous les articles ont un coût connu
    const costed = order.lines.map((l) => ({
      qty: Number(l.quantityDelivered) > 0 ? Number(l.quantityDelivered) : Number(l.quantityOrdered),
      cost: l.item?.unitPrice === null || l.item?.unitPrice === undefined ? null : Number(l.item.unitPrice),
    }));
    const cogsAmount = costed.every((c) => c.cost !== null)
      ? Math.round(costed.reduce((a, c) => a + c.qty * (c.cost as number), 0))
      : undefined;

    const reference = await this.nextReference('FV', 'salesInvoice', actor.userId);
    const earliest = installments.length
      ? installments.map((i) => new Date(i.dueDate)).sort((a, b) => +a - +b)[0]
      : dto.dueDate ? new Date(dto.dueDate) : undefined;

    const invoice = await this.prisma.salesInvoice.create({
      data: {
        siteId: order.siteId,
        customerId: order.customerId,
        salesOrderId: order.id,
        reference,
        invoiceDate: new Date(),
        dueDate: earliest,
        paymentTerm: installments.length ? 'CREDIT' : dto.paymentTerm,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        cogsAmount,
        cashSessionId: session?.id,
        discountApprovedBy: discountAmount > 0 && isCommercialManager(actor) ? actorId : undefined,
        status: 'UNPAID',
        createdById: actorId,
        ...(installments.length
          ? { installments: { create: installments.map((i) => ({ dueDate: new Date(i.dueDate), amount: Math.round(i.amount) })) } }
          : {}),
      },
    });

    await this.prisma.salesOrder.update({ where: { id: order.id }, data: { status: 'INVOICED' } });
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'SalesInvoice', entityId: invoice.id, newValue: dto });
    return invoice;
  }

  // Annulation d'une facture non encaissée (direction commerciale). Pour une facture déjà payée : passer par un retour.
  async cancelInvoice(id: string, reason: string, actor: Actor) {
    if (!isCommercialManager(actor)) throw new ForbiddenException("Annulation réservée à la direction commerciale.");
    const invoice = await this.prisma.salesInvoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && invoice.siteId !== actor.siteId) {
      throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
    }
    if (invoice.status === 'CANCELLED') throw new BadRequestException('Facture déjà annulée.');
    if (toNumber(invoice.amountPaid) > 0) {
      throw new BadRequestException('Facture déjà encaissée : enregistrez un retour client pour la corriger.');
    }
    const updated = await this.prisma.salesInvoice.update({ where: { id }, data: { status: 'CANCELLED' } });
    if (invoice.salesOrderId) {
      const lines = await this.prisma.salesOrderLine.findMany({ where: { salesOrderId: invoice.salesOrderId } });
      const all = lines.every((l) => Number(l.quantityDelivered) >= Number(l.quantityOrdered));
      const some = lines.some((l) => Number(l.quantityDelivered) > 0);
      await this.prisma.salesOrder.update({
        where: { id: invoice.salesOrderId },
        data: { status: all ? 'DELIVERED' : some ? 'PARTIALLY_DELIVERED' : 'CONFIRMED' },
      });
    }
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'SalesInvoice', entityId: id, newValue: { event: 'CANCELLED' }, reason });
    return updated;
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
