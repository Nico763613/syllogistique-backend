import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor, isCommercialManager, toNumber } from '../common/actor';
import { CreateSalesReturnDto } from './dto/return.dto';

// Retours clients. Le retour sert d'avoir (référence AV-AAAA-NNNN) : une fois validé, il réduit la facture,
// rembourse l'éventuel trop-perçu (sortie d'espèces rattachée à la caisse) et remet les articles en stock.
@Injectable()
export class SalesReturnsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async nextReference() {
    const year = new Date().getFullYear();
    const count = await this.prisma.salesReturn.count({ where: { reference: { startsWith: `AV-${year}-` } } });
    return `AV-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private checkSite(actor: Actor, siteId: string) {
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && actor.siteId !== siteId) {
      throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
    }
  }

  async create(dto: CreateSalesReturnDto, actor: Actor) {
    if (!dto.lines?.length) throw new BadRequestException('Le retour doit contenir au moins une ligne.');
    const invoice = await this.prisma.salesInvoice.findUnique({
      where: { id: dto.salesInvoiceId },
      include: { salesOrder: { include: { lines: true } }, returns: { include: { lines: true } } },
    });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    this.checkSite(actor, invoice.siteId);
    if (invoice.status === 'DRAFT' || invoice.status === 'CANCELLED') {
      throw new BadRequestException("Cette facture n'est pas retournable.");
    }
    if (!invoice.salesOrder) throw new BadRequestException('Facture sans commande : retour impossible.');
    const order = invoice.salesOrder;
    const active = invoice.returns.filter((r) => r.status === 'PENDING' || r.status === 'VALIDATED');

    let total = 0;
    const lines: Array<{ itemId: string; quantity: number; amount: number }> = [];
    for (const l of dto.lines) {
      const orderLines = order.lines.filter((x) => x.itemId === l.itemId);
      if (!orderLines.length) throw new BadRequestException("Cet article ne figure pas sur la facture.");
      const delivered = orderLines.reduce((a, x) => a + toNumber(x.quantityDelivered), 0);
      const already = active.flatMap((r) => r.lines).filter((x) => x.itemId === l.itemId).reduce((a, x) => a + toNumber(x.quantity), 0);
      if (l.quantity > delivered - already + 1e-9) {
        throw new BadRequestException(`Quantité retournée trop élevée (livré ${delivered}, déjà retourné ${already}).`);
      }
      // Montant calculé côté serveur : prix net de remise, TVA comprise
      const unit = toNumber(orderLines[0].unitPrice);
      const net = unit * (1 - toNumber(order.discountPercent) / 100) * (1 + toNumber(order.taxPercent) / 100);
      const amount = Math.round(l.quantity * net);
      total += amount;
      lines.push({ itemId: l.itemId, quantity: l.quantity, amount });
    }
    // Les retours déjà validés ont réduit le total de la facture ; seuls les retours en attente restent à déduire
    const pendingAmount = active.filter((r) => r.status === 'PENDING').reduce((a, r) => a + toNumber(r.totalAmount), 0);
    if (total + pendingAmount > toNumber(invoice.totalAmount) + 1) {
      throw new BadRequestException('Le montant du retour dépasse le montant restant de la facture.');
    }

    const ret = await this.prisma.salesReturn.create({
      data: {
        siteId: invoice.siteId,
        salesInvoiceId: invoice.id,
        reference: await this.nextReference(),
        reason: dto.reason,
        totalAmount: total,
        restock: dto.restock ?? true,
        status: 'PENDING',
        createdBy: actor.userId,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'SalesReturn', entityId: ret.id, newValue: dto });

    // Les rôles de direction valident immédiatement ; le caissier soumet à validation
    return isCommercialManager(actor) ? this.validate(ret.id, actor) : ret;
  }

  async validate(id: string, actor: Actor) {
    if (!isCommercialManager(actor)) throw new ForbiddenException('Validation réservée à la direction commerciale.');
    const result = await this.prisma.$transaction(async (tx) => {
      const ret = await tx.salesReturn.findUnique({ where: { id }, include: { lines: true, salesInvoice: true } });
      if (!ret) throw new NotFoundException('Retour introuvable.');
      this.checkSite(actor, ret.siteId);
      if (ret.status !== 'PENDING') throw new BadRequestException('Ce retour a déjà été traité.');

      const inv = ret.salesInvoice;
      const total = toNumber(inv.totalAmount);
      const tax = toNumber(inv.taxAmount);
      const paid = toNumber(inv.amountPaid);
      const discount = toNumber(inv.discountAmount);
      const amount = toNumber(ret.totalAmount);

      // Nouveaux montants de la facture (GNF entiers)
      const newTotal = Math.max(total - amount, 0);
      const newTax = total > 0 ? Math.round((tax * newTotal) / total) : 0;
      const newDiscount = total > 0 ? Math.round((discount * newTotal) / total) : 0; // remise réduite au prorata
      const newSubtotal = newTotal - newTax + newDiscount;
      const newPaid = Math.min(paid, newTotal);
      const refund = Math.max(paid - newTotal, 0);
      const status = newTotal <= 0 ? 'CANCELLED' : newPaid >= newTotal ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';

      await tx.salesInvoice.update({
        where: { id: inv.id },
        data: { totalAmount: newTotal, taxAmount: newTax, subtotal: newSubtotal, discountAmount: newDiscount, amountPaid: newPaid, status },
      });

      if (refund > 0) {
        const session = await tx.cashSession.findFirst({ where: { cashierId: ret.createdBy ?? actor.userId, closedAt: null } });
        await tx.payment.create({
          data: {
            direction: 'OUT',
            method: 'CASH',
            amount: refund,
            paymentDate: new Date(),
            reference: `Remboursement ${ret.reference}`,
            salesInvoiceId: inv.id,
            cashSessionId: session?.id,
            createdById: actor.userId,
          },
        });
      }

      if (ret.restock) {
        for (const l of ret.lines) {
          const item = await tx.inventoryItem.findUnique({ where: { id: l.itemId } });
          if (!item) continue;
          const qty = toNumber(l.quantity);
          await tx.stockMovement.create({
            data: {
              itemId: l.itemId,
              siteId: ret.siteId,
              movementType: 'IN',
              quantity: qty,
              reference: ret.reference,
              unitPrice: item.unitPrice ?? undefined,
              totalValue: item.unitPrice ? Number((toNumber(item.unitPrice) * qty).toFixed(2)) : undefined,
              reason: `Retour client ${ret.reference}`,
              reasonCode: 'RETURN',
              createdById: actor.userId,
            },
          });
          await tx.inventoryItem.update({ where: { id: l.itemId }, data: { currentQuantity: { increment: qty } } });
        }
      }

      return tx.salesReturn.update({
        where: { id },
        data: { status: 'VALIDATED', validatedBy: actor.userId },
        include: { lines: true },
      });
    });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'SalesReturn', entityId: id, newValue: { event: 'VALIDATED' } });
    return result;
  }

  async reject(id: string, actor: Actor, note?: string) {
    if (!isCommercialManager(actor)) throw new ForbiddenException('Décision réservée à la direction commerciale.');
    const ret = await this.prisma.salesReturn.findUnique({ where: { id } });
    if (!ret) throw new NotFoundException('Retour introuvable.');
    this.checkSite(actor, ret.siteId);
    if (ret.status !== 'PENDING') throw new BadRequestException('Ce retour a déjà été traité.');
    const updated = await this.prisma.salesReturn.update({ where: { id }, data: { status: 'REJECTED', validatedBy: actor.userId } });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'SalesReturn', entityId: id, newValue: { event: 'REJECTED' }, reason: note });
    return updated;
  }

  list(actor: Actor, params: { siteId?: string; status?: string }) {
    const siteId = actor.role === 'SUPER_ADMIN' ? params.siteId : actor.siteId ?? params.siteId;
    return this.prisma.salesReturn.findMany({
      where: {
        ...(siteId ? { siteId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(actor.role === 'CAISSIER' ? { createdBy: actor.userId } : {}),
      },
      include: { lines: true, salesInvoice: { select: { reference: true, customer: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(id: string, actor: Actor) {
    const ret = await this.prisma.salesReturn.findUnique({
      where: { id },
      include: { lines: { include: { item: { select: { name: true, sku: true, unit: true } } } }, salesInvoice: { include: { customer: true } } },
    });
    if (!ret) throw new NotFoundException('Retour introuvable.');
    this.checkSite(actor, ret.siteId);
    if (actor.role === 'CAISSIER' && ret.createdBy !== actor.userId) throw new ForbiddenException('Retour créé par un autre utilisateur.');
    return ret;
  }
}
