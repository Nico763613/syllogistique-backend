import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { allowedSiteIds } from '../common/tenant-scope';
import { AuditService } from '../audit/audit.service';
import { PaymentsService } from './payments.service';

type Actor = { userId: string; role: string; siteId?: string };
const METHODS = ['MOBILE_MONEY', 'ORANGE_MONEY'];

@Injectable()
export class PendingPaymentsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private payments: PaymentsService) {}
  private q(sql: string, ...a: any[]) { return this.prisma.$queryRawUnsafe(sql, ...a) as Promise<any[]>; }

  // Déclaration d'un paiement mobile en attente de confirmation de l'opérateur
  async declare(dto: { salesInvoiceId: string; method: string; amount: number; paymentDate?: string; externalRef?: string }, actor: Actor) {
    if (!METHODS.includes(dto.method)) throw new BadRequestException('Seuls Mobile Money et Orange Money peuvent être mis en attente de confirmation.');
    const amount = Number(dto.amount);
    if (!(amount > 0)) throw new BadRequestException('Montant invalide.');
    const ref = (dto.externalRef || '').trim();
    if (!ref) throw new BadRequestException('Le numéro de transaction est obligatoire.');
    const inv = await this.prisma.salesInvoice.findUnique({ where: { id: dto.salesInvoiceId } });
    if (!inv) throw new NotFoundException('Facture client introuvable.');
    if (['CANCELLED', 'DRAFT', 'PAID'].includes(inv.status)) throw new BadRequestException("Cette facture n'est pas encaissable.");
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && inv.siteId !== actor.siteId) throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
    const pending = await this.q(`SELECT COALESCE(SUM("amount"),0) AS s FROM "pending_payments" WHERE "sales_invoice_id" = $1 AND "status" = 'EN_ATTENTE'`, inv.id);
    const rest = Number(inv.totalAmount) - Number(inv.amountPaid) - Number(pending[0].s);
    if (amount > rest + 0.01) throw new BadRequestException(`Le montant dépasse le reste à payer (${Math.round(rest)} GNF, paiements en attente déduits).`);
    // Un même numéro de transaction ne sert qu'une fois
    const dup = (await this.q(`SELECT 1 FROM "pending_payments" WHERE "external_ref" = $1 AND "status" <> 'REJETE' UNION ALL SELECT 1 FROM "payments" WHERE "external_ref" = $1 LIMIT 1`, ref));
    if (dup.length) throw new BadRequestException('Ce numéro de transaction a déjà été utilisé.');
    const id = randomUUID();
    await this.prisma.$executeRawUnsafe('INSERT INTO "pending_payments" ("id","sales_invoice_id","site_id","method","amount","payment_date","external_ref","declared_by") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', id, inv.id, inv.siteId, dto.method, amount, dto.paymentDate ? new Date(dto.paymentDate) : new Date(), ref, actor.userId);
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'PendingPayment', entityId: id, newValue: { invoice: inv.reference, ...dto } });
    return { id, status: 'EN_ATTENTE' };
  }

  async list(params: { siteId?: string; status?: string }, actor: Actor) {
    const siteId = actor.role !== 'SUPER_ADMIN' && actor.siteId ? actor.siteId : params.siteId;
    const where: string[] = [`p."status" = $1`]; const a: any[] = [params.status || 'EN_ATTENTE'];
    if (siteId) { a.push(siteId); where.push(`p."site_id" = $${a.length}`); }
    const allowed = await allowedSiteIds(this.prisma);
    if (allowed) { a.push(allowed); where.push(`p."site_id" = ANY($${a.length}::text[])`); }
    return this.q(`SELECT p.*, i."reference" AS invoice_reference, c."name" AS customer_name, i."total_amount" AS invoice_total, i."amount_paid" AS invoice_paid FROM "pending_payments" p JOIN "sales_invoices" i ON i."id" = p."sales_invoice_id" LEFT JOIN "customers" c ON c."id" = i."customer_id" WHERE ${where.join(' AND ')} ORDER BY p."declared_at" DESC LIMIT 200`, ...a);
  }

  private async claim(id: string, status: string, actor: Actor, reason?: string) {
    const row = (await this.q('SELECT * FROM "pending_payments" WHERE "id" = $1', id))[0];
    if (!row) throw new NotFoundException('Paiement en attente introuvable.');
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && row.site_id && row.site_id !== actor.siteId) throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
    const allowed = await allowedSiteIds(this.prisma);
    if (allowed && !allowed.includes(row.site_id)) throw new NotFoundException('Paiement introuvable.');
    if (row.status !== 'EN_ATTENTE') throw new BadRequestException('Ce paiement a déjà été traité.');
    // Séparation des tâches : celui qui a déclaré le paiement ne le confirme pas lui-même (sauf Administrateur Général)
    if (status === 'CONFIRME' && row.declared_by === actor.userId && actor.role !== 'SUPER_ADMIN') throw new ForbiddenException("La confirmation doit être faite par un autre responsable que celui qui a déclaré le paiement.");
    const won = await this.q(`UPDATE "pending_payments" SET "status" = $2, "decided_by" = $3, "decided_at" = CURRENT_TIMESTAMP, "reject_reason" = $4 WHERE "id" = $1 AND "status" = 'EN_ATTENTE' RETURNING "id"`, id, status, actor.userId, reason || null);
    if (!won.length) throw new BadRequestException('Ce paiement vient d\'être traité par quelqu\'un d\'autre.');
    return row;
  }

  // Confirmation (message de l'opérateur reçu) : le paiement est enregistré normalement (facture, caisse, reçu numéroté)
  async confirm(id: string, actor: Actor) {
    const row = await this.claim(id, 'CONFIRME', actor);
    try {
      const pay: any = await this.payments.create({ direction: 'IN', method: row.method, amount: Number(row.amount), paymentDate: new Date().toISOString(), salesInvoiceId: row.sales_invoice_id, externalRef: row.external_ref, reference: row.external_ref } as any, actor.userId, actor);
      await this.prisma.$executeRawUnsafe('UPDATE "pending_payments" SET "payment_id" = $2 WHERE "id" = $1', id, pay.id);
      await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'PendingPayment', entityId: id, oldValue: { status: 'EN_ATTENTE' }, newValue: { status: 'CONFIRME', paymentId: pay.id } });
      return { status: 'CONFIRME', paymentId: pay.id };
    } catch (e) {
      // L'enregistrement a échoué (ex. facture déjà soldée) : le paiement reste en attente
      await this.prisma.$executeRawUnsafe(`UPDATE "pending_payments" SET "status" = 'EN_ATTENTE', "decided_by" = NULL, "decided_at" = NULL WHERE "id" = $1`, id);
      throw e;
    }
  }

  async reject(id: string, reason: string, actor: Actor) {
    if (!(reason || '').trim() || reason.trim().length < 3) throw new BadRequestException('Indiquez le motif du rejet (paiement non reçu, montant incorrect…).');
    await this.claim(id, 'REJETE', actor, reason.trim());
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'PendingPayment', entityId: id, oldValue: { status: 'EN_ATTENTE' }, newValue: { status: 'REJETE' }, reason: reason.trim() });
    return { status: 'REJETE' };
  }
}
