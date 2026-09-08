import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePaymentDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Enregistre un paiement (encaissement client / décaissement fournisseur)
  // et met automatiquement à jour le statut de la facture liée.
  async create(dto: CreatePaymentDto, actorId: string) {
    if (!dto.salesInvoiceId && !dto.purchaseInvoiceId) {
      throw new BadRequestException('Le paiement doit être rattaché à une facture client ou fournisseur.');
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          direction: dto.direction,
          method: dto.method as any,
          amount: dto.amount,
          paymentDate: new Date(dto.paymentDate),
          reference: dto.reference,
          salesInvoiceId: dto.salesInvoiceId,
          purchaseInvoiceId: dto.purchaseInvoiceId,
          createdById: actorId,
        },
      });

      if (dto.salesInvoiceId) {
        const invoice = await tx.salesInvoice.findUnique({ where: { id: dto.salesInvoiceId } });
        if (!invoice) throw new NotFoundException('Facture client introuvable.');
        const newPaid = Number(invoice.amountPaid) + dto.amount;
        if (newPaid > Number(invoice.totalAmount) + 0.01) {
          throw new BadRequestException('Le montant payé dépasse le total de la facture.');
        }
        const status = newPaid >= Number(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';
        await tx.salesInvoice.update({ where: { id: invoice.id }, data: { amountPaid: newPaid, status } });
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
