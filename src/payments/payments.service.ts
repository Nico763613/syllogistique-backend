import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePaymentDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Enregistre un paiement (encaissement client / décaissement fournisseur)
  // et met automatiquement à jour le statut de la facture liée.
  // `actor` (optionnel) : un caissier doit avoir une caisse ouverte ; le paiement est alors rattaché à sa session.
  async create(dto: CreatePaymentDto, actorId: string, actor?: { role: string; siteId?: string }) {
    if (!dto.salesInvoiceId && !dto.purchaseInvoiceId) {
      throw new BadRequestException('Le paiement doit être rattaché à une facture client ou fournisseur.');
    }

    // Anti-doublon hors-ligne : la même opération rejouée renvoie le paiement déjà enregistré
    if (dto.clientOpId) {
      const existing = await this.prisma.payment.findUnique({ where: { clientOpId: dto.clientOpId } });
      if (existing) return existing;
    }

    return this.prisma.$transaction(async (tx) => {
      let cashSessionId = dto.cashSessionId;
      let siteId: string | undefined;

      if (dto.salesInvoiceId) {
        const invoice = await tx.salesInvoice.findUnique({ where: { id: dto.salesInvoiceId }, include: { installments: true } });
        if (!invoice) throw new NotFoundException('Facture client introuvable.');
        if (invoice.status === 'CANCELLED' || invoice.status === 'DRAFT') {
          throw new BadRequestException("Cette facture n'est pas encaissable.");
        }
        if (actor && actor.role !== 'SUPER_ADMIN' && actor.siteId && invoice.siteId !== actor.siteId) {
          throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
        }
        siteId = invoice.siteId;

        // Caissier : caisse ouverte obligatoire ; l'encaissement est rattaché à sa session
        if (actor?.role === 'CAISSIER') {
          const session = await tx.cashSession.findFirst({ where: { cashierId: actorId, closedAt: null } });
          if (!session) throw new BadRequestException("Ouvrez votre caisse avant d'encaisser.");
          cashSessionId = session.id;
        } else if (!cashSessionId) {
          const mine = await tx.cashSession.findFirst({ where: { cashierId: actorId, closedAt: null } });
          cashSessionId = mine?.id;
        }

        const newPaid = Number(invoice.amountPaid) + dto.amount;
        if (newPaid > Number(invoice.totalAmount) + 0.01) {
          throw new BadRequestException('Le montant payé dépasse le total de la facture.');
        }
        const status = newPaid >= Number(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';
        await tx.salesInvoice.update({ where: { id: invoice.id }, data: { amountPaid: newPaid, status } });

        // Ventes échelonnées : le règlement solde les échéances de la plus ancienne à la plus récente
        let left = dto.amount;
        for (const inst of [...invoice.installments].sort((a, b) => +a.dueDate - +b.dueDate)) {
          if (left <= 0) break;
          const open = Number(inst.amount) - Number(inst.amountPaid);
          if (open <= 0) continue;
          const part = Math.min(open, left);
          await tx.salesInstallment.update({ where: { id: inst.id }, data: { amountPaid: { increment: part } } });
          left -= part;
        }
      }

      if (dto.purchaseInvoiceId) {
        const invoice = await tx.purchaseInvoice.findUnique({ where: { id: dto.purchaseInvoiceId } });
        if (!invoice) throw new NotFoundException('Facture fournisseur introuvable.');
        const newPaid = Number(invoice.amountPaid) + dto.amount;
        if (newPaid > Number(invoice.totalAmount) + 0.01) {
          throw new BadRequestException('Le montant payé dépasse le total de la facture.');
        }
        const status = newPaid >= Number(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';
        await tx.purchaseInvoice.update({ where: { id: invoice.id }, data: { amountPaid: newPaid, status } });
      }

      const payment = await tx.payment.create({
        data: {
          direction: dto.direction,
          method: dto.method as any,
          amount: dto.amount,
          paymentDate: new Date(dto.paymentDate),
          reference: dto.reference,
          salesInvoiceId: dto.salesInvoiceId,
          purchaseInvoiceId: dto.purchaseInvoiceId,
          cashSessionId,
          siteId,
          externalRef: dto.externalRef,
          clientOpId: dto.clientOpId,
          createdById: actorId,
        },
      });

      await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Payment', entityId: payment.id, newValue: dto });
      return payment;
    });
  }

  findAll(params: { salesInvoiceId?: string; purchaseInvoiceId?: string }) {
    return this.prisma.payment.findMany({
      where: {
        ...(params.salesInvoiceId ? { salesInvoiceId: params.salesInvoiceId } : {}),
        ...(params.purchaseInvoiceId ? { purchaseInvoiceId: params.purchaseInvoiceId } : {}),
      },
      orderBy: { paymentDate: 'desc' },
    });
  }
}
