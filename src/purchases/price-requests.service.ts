import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import PDFDocument = require('pdfkit');
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { PurchasesService } from './purchases.service';
import { getIssuer } from '../common/issuer';
import { maxSeqOf, nextDocNumber } from '../common/doc-numbers';
export { PRICE_REQUEST_SCHEMA } from './price-requests.schema';

// Circuit d'achat : demande d'achat (état de besoin approuvé) → demande de prix à plusieurs fournisseurs →
// comparatif → validation → bon de commande fournisseur automatique. Tout est historisé (audit + statuts).

type Actor = { userId: string; role: string; siteId?: string };
const num = (v: any) => Number(v) || 0;

@Injectable()
export class PriceRequestsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private purchases: PurchasesService) {}

  private q(sql: string, ...a: any[]) { return this.prisma.$queryRawUnsafe(sql, ...a) as Promise<any[]>; }

  private checkSite(actor: Actor, siteId: string) {
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && actor.siteId !== siteId) throw new ForbiddenException('Cette demande appartient à un autre site.');
  }

  private async load(id: string) {
    const r = (await this.q('SELECT * FROM "price_requests" WHERE "id" = $1', id))[0];
    if (!r) throw new NotFoundException('Demande de prix introuvable.');
    return r;
  }

  // ---- Création : demande d'achat approuvée (ou lignes saisies) + fournisseurs consultés ----
  async create(dto: { siteId: string; title?: string; needRequestId?: string; notes?: string; supplierIds: string[]; lines?: { itemId: string; quantity: number }[] }, actor: Actor) {
    this.checkSite(actor, dto.siteId);
    const supplierIds = Array.from(new Set((dto.supplierIds || []).filter(Boolean)));
    if (supplierIds.length < 2) throw new BadRequestException('Consultez au moins 2 fournisseurs pour pouvoir comparer les prix.');
    const suppliers = await this.prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true } });
    if (suppliers.length !== supplierIds.length) throw new BadRequestException('Un des fournisseurs est introuvable.');

    let title = (dto.title || '').trim();
    let lines = (dto.lines || []).filter((l) => l && l.itemId && Number(l.quantity) > 0);
    if (dto.needRequestId) {
      const need = await this.prisma.needRequest.findUnique({ where: { id: dto.needRequestId }, include: { lines: true } });
      if (!need) throw new NotFoundException("Demande d'achat (état de besoin) introuvable.");
      if (need.status !== 'APPROUVE') throw new BadRequestException("L'état de besoin doit d'abord être approuvé avant de demander des prix.");
      if (!lines.length) lines = need.lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId as string, quantity: Number(l.quantity) }));
      if (!title) title = need.title;
    }
    if (!lines.length) throw new BadRequestException('Ajoutez au moins un article (avec son code article) à la demande de prix.');
    const itemIds = Array.from(new Set(lines.map((l) => l.itemId)));
    const items = await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true } });
    if (items.length !== itemIds.length) throw new BadRequestException('Un des articles est introuvable.');
    if (!title) title = 'Demande de prix';

    const id = randomUUID();
    const number = await this.prisma.$transaction(async (tx) => {
      const n = await nextDocNumber(tx as any, 'DP', 'DP', async (year) => {
        const rows = (await (tx as any).$queryRawUnsafe('SELECT "number" FROM "price_requests" WHERE "number" LIKE $1', `DP-${year}-%`)) as any[];
        return maxSeqOf(rows.map((r) => r.number));
      }, { by: actor.userId });
      await (tx as any).$executeRawUnsafe('INSERT INTO "price_requests" ("id","number","site_id","need_request_id","title","notes","created_by") VALUES ($1,$2,$3,$4,$5,$6,$7)', id, n, dto.siteId, dto.needRequestId || null, title, dto.notes || null, actor.userId);
      let pos = 0;
      for (const l of lines) await (tx as any).$executeRawUnsafe('INSERT INTO "price_request_lines" ("id","request_id","item_id","quantity","position") VALUES ($1,$2,$3,$4,$5)', randomUUID(), id, l.itemId, l.quantity, pos++);
      for (const s of supplierIds) await (tx as any).$executeRawUnsafe('INSERT INTO "price_quotes" ("id","request_id","supplier_id") VALUES ($1,$2,$3)', randomUUID(), id, s);
      return n;
    });
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'PriceRequest', entityId: id, newValue: { number, supplierIds, lines } });
    return this.get(id, actor);
  }

  async list(params: { siteId?: string; status?: string }, actor: Actor) {
    const siteId = actor.role !== 'SUPER_ADMIN' && actor.siteId ? actor.siteId : params.siteId;
    const where: string[] = []; const a: any[] = [];
    if (siteId) { a.push(siteId); where.push(`r."site_id" = $${a.length}`); }
    if (params.status) { a.push(params.status); where.push(`r."status" = $${a.length}`); }
    const rows = await this.q(`SELECT r.*, (SELECT COUNT(*) FROM "price_quotes" q WHERE q."request_id" = r."id") AS suppliers, (SELECT COUNT(*) FROM "price_quotes" q WHERE q."request_id" = r."id" AND q."status" = 'RECUE') AS received FROM "price_requests" r ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r."created_at" DESC LIMIT 200`, ...a);
    return rows.map((r) => ({ ...r, suppliers: Number(r.suppliers), received: Number(r.received), nextStep: this.nextStep(r.status, Number(r.received)) }));
  }

  // Prochaine étape (guidage de bout en bout)
  private nextStep(status: string, received: number) {
    if (status === 'OUVERTE') return received < 2 ? 'Saisir les prix reçus des fournisseurs (au moins 2 offres complètes).' : 'Comparer les offres puis valider un fournisseur.';
    if (status === 'COMPAREE') return 'Valider le fournisseur retenu : le bon de commande sera créé automatiquement.';
    if (status === 'VALIDEE') return 'Bon de commande créé : réceptionner la marchandise (bon de réception BR).';
    return 'Demande annulée.';
  }

  // Détail + tableau comparatif
  async get(id: string, actor: Actor) {
    const r = await this.load(id);
    this.checkSite(actor, r.site_id);
    const lines = await this.q('SELECT l.*, i."sku", i."name", i."unit" FROM "price_request_lines" l JOIN "stock_items" i ON i."id" = l."item_id" WHERE l."request_id" = $1 ORDER BY l."position"', id);
    const quotes = await this.q('SELECT q.*, s."name" AS supplier_name, s."phone" AS supplier_phone FROM "price_quotes" q JOIN "suppliers" s ON s."id" = q."supplier_id" WHERE q."request_id" = $1 ORDER BY s."name"', id);
    const prices = await this.q('SELECT p.* FROM "price_quote_lines" p JOIN "price_quotes" q ON q."id" = p."quote_id" WHERE q."request_id" = $1', id);
    const cmp = quotes.map((q) => {
      const priced = lines.map((l) => { const p = prices.find((x) => x.quote_id === q.id && x.request_line_id === l.id); return { requestLineId: l.id, unitPrice: p ? num(p.unit_price) : null }; });
      const complete = q.status === 'RECUE' && priced.every((p) => p.unitPrice !== null);
      const total = complete ? lines.reduce((s, l, i) => s + num(l.quantity) * (priced[i].unitPrice as number), 0) : null;
      return { quoteId: q.id, supplierId: q.supplier_id, supplierName: q.supplier_name, supplierPhone: q.supplier_phone, status: q.status, deliveryDays: q.delivery_days, paymentTerms: q.payment_terms, notes: q.notes, receivedAt: q.received_at, prices: priced, complete, total };
    });
    const completes = cmp.filter((c) => c.complete);
    const minTotal = completes.length ? Math.min(...completes.map((c) => c.total as number)) : null;
    const withDays = completes.filter((c) => c.deliveryDays != null);
    const minDays = withDays.length ? Math.min(...withDays.map((c) => c.deliveryDays as number)) : null;
    const comparison = cmp.map((c) => ({ ...c, cheapest: c.complete && c.total === minTotal, fastest: c.complete && c.deliveryDays != null && c.deliveryDays === minDays }));
    const received = quotes.filter((q) => q.status === 'RECUE').length;
    return {
      id: r.id, number: r.number, siteId: r.site_id, needRequestId: r.need_request_id, title: r.title, status: r.status, notes: r.notes,
      createdAt: r.created_at, chosenSupplierId: r.chosen_supplier_id, validatedAt: r.validated_at, validationNote: r.validation_note, purchaseOrderId: r.purchase_order_id, cancelReason: r.cancel_reason,
      lines: lines.map((l) => ({ id: l.id, itemId: l.item_id, sku: l.sku, name: l.name, unit: l.unit, quantity: num(l.quantity) })),
      comparison, nextStep: this.nextStep(r.status, received),
    };
  }

  // ---- Saisie des prix reçus d'un fournisseur ----
  async saveQuote(id: string, supplierId: string, dto: { deliveryDays?: number; paymentTerms?: string; notes?: string; prices: { requestLineId: string; unitPrice: number }[] }, actor: Actor) {
    const r = await this.load(id);
    this.checkSite(actor, r.site_id);
    if (r.status !== 'OUVERTE' && r.status !== 'COMPAREE') throw new BadRequestException('Cette demande est clôturée : les prix ne peuvent plus être modifiés.');
    const quote = (await this.q('SELECT * FROM "price_quotes" WHERE "request_id" = $1 AND "supplier_id" = $2', id, supplierId))[0];
    if (!quote) throw new NotFoundException("Ce fournisseur ne fait pas partie de la demande de prix.");
    const lines = await this.q('SELECT "id" FROM "price_request_lines" WHERE "request_id" = $1', id);
    const ids = new Set(lines.map((l) => l.id));
    const seen = new Set<string>();
    for (const p of dto.prices || []) {
      if (!ids.has(p.requestLineId)) throw new BadRequestException('Ligne inconnue dans la demande de prix.');
      if (seen.has(p.requestLineId)) throw new BadRequestException('Une même ligne ne peut pas figurer deux fois.');
      seen.add(p.requestLineId);
      if (!(Number(p.unitPrice) >= 0)) throw new BadRequestException('Prix unitaire invalide.');
    }
    if (seen.size !== lines.length) throw new BadRequestException('Saisissez le prix de chaque article (une offre incomplète ne peut pas être comparée).');
    const days = dto.deliveryDays == null || (dto.deliveryDays as any) === '' ? null : Math.max(0, Math.floor(Number(dto.deliveryDays)));
    await this.prisma.$transaction(async (tx) => {
      const t = tx as any;
      await t.$executeRawUnsafe('DELETE FROM "price_quote_lines" WHERE "quote_id" = $1', quote.id);
      for (const p of dto.prices) await t.$executeRawUnsafe('INSERT INTO "price_quote_lines" ("id","quote_id","request_line_id","unit_price") VALUES ($1,$2,$3,$4)', randomUUID(), quote.id, p.requestLineId, p.unitPrice);
      await t.$executeRawUnsafe(`UPDATE "price_quotes" SET "status"='RECUE', "delivery_days"=$2, "payment_terms"=$3, "notes"=$4, "received_at"=CURRENT_TIMESTAMP, "received_by"=$5 WHERE "id"=$1`, quote.id, days, (dto.paymentTerms || '').trim() || null, (dto.notes || '').trim() || null, actor.userId);
      const cnt = (await t.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "price_quotes" WHERE "request_id" = $1 AND "status" = 'RECUE'`, id)) as any[];
      if (Number(cnt[0].c) >= 2) await t.$executeRawUnsafe(`UPDATE "price_requests" SET "status"='COMPAREE' WHERE "id" = $1 AND "status" = 'OUVERTE'`, id);
    });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'PriceRequest', entityId: id, newValue: { supplierId, deliveryDays: days, prices: dto.prices } });
    return this.get(id, actor);
  }

  // ---- Validation du fournisseur retenu → bon de commande fournisseur automatique ----
  async validate(id: string, dto: { supplierId: string; note?: string }, actor: Actor) {
    const detail = await this.get(id, actor);
    if (detail.status === 'VALIDEE') throw new BadRequestException('Cette demande est déjà validée.');
    if (detail.status === 'ANNULEE') throw new BadRequestException('Cette demande est annulée.');
    const r = await this.load(id);
    // Séparation des tâches : celui qui a préparé la demande ne la valide pas lui-même (sauf Administrateur Général)
    if (r.created_by === actor.userId && actor.role !== 'SUPER_ADMIN') throw new ForbiddenException('La validation doit être faite par un autre responsable que celui qui a préparé la demande.');
    const chosen = detail.comparison.find((c) => c.supplierId === dto.supplierId);
    if (!chosen) throw new BadRequestException('Fournisseur non consulté dans cette demande.');
    if (!chosen.complete) throw new BadRequestException("Ce fournisseur n'a pas remis une offre complète.");
    const completes = detail.comparison.filter((c) => c.complete);
    const note = (dto.note || '').trim();
    if (completes.length < 2 && !note) throw new BadRequestException('Une seule offre complète reçue : indiquez la justification (ex. fournisseur unique, urgence).');
    if (!chosen.cheapest && !note) throw new BadRequestException("Ce n'est pas l'offre la moins chère : indiquez le motif du choix (délai, qualité, confiance…).");

    const now = new Date();
    const expected = chosen.deliveryDays != null ? new Date(now.getTime() + Number(chosen.deliveryDays) * 86400000) : undefined;
    const order = await this.purchases.createOrder({
      siteId: detail.siteId, supplierId: chosen.supplierId, orderDate: now.toISOString(), expectedDate: expected?.toISOString(),
      notes: `Issu de la demande de prix ${detail.number}${note ? ' — ' + note : ''}`,
      lines: detail.lines.map((l, i) => ({ itemId: l.itemId, quantityOrdered: l.quantity, unitPrice: chosen.prices[i].unitPrice as number })),
    } as any, actor.userId);
    await this.prisma.$executeRawUnsafe(`UPDATE "price_requests" SET "status"='VALIDEE', "chosen_supplier_id"=$2, "validated_by"=$3, "validated_at"=CURRENT_TIMESTAMP, "validation_note"=$4, "purchase_order_id"=$5 WHERE "id"=$1`, id, chosen.supplierId, actor.userId, note || null, order.id);
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'PriceRequest', entityId: id, oldValue: { status: detail.status }, newValue: { status: 'VALIDEE', supplierId: chosen.supplierId, purchaseOrder: order.reference }, reason: note || undefined });
    return { request: await this.get(id, actor), purchaseOrder: { id: order.id, reference: order.reference } };
  }

  async cancel(id: string, reason: string, actor: Actor) {
    const r = await this.load(id);
    this.checkSite(actor, r.site_id);
    if (r.status === 'VALIDEE') throw new BadRequestException('Un bon de commande a déjà été créé : annulez-le depuis les bons de commande.');
    if (r.status === 'ANNULEE') throw new BadRequestException('Déjà annulée.');
    if (!(reason || '').trim() || reason.trim().length < 3) throw new BadRequestException("Indiquez le motif de l'annulation.");
    await this.prisma.$executeRawUnsafe(`UPDATE "price_requests" SET "status"='ANNULEE', "cancel_reason"=$2 WHERE "id"=$1`, id, reason.trim());
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'PriceRequest', entityId: id, oldValue: { status: r.status }, newValue: { status: 'ANNULEE' }, reason: reason.trim() });
    return this.get(id, actor);
  }

  // ---- PDF « Demande de prix » à envoyer aux fournisseurs (sans aucun prix) ----
  async pdf(id: string, actor: Actor): Promise<Buffer> {
    const d = await this.get(id, actor);
    const issuer = await getIssuer(this.prisma, actor.userId);
    const site = await this.prisma.site.findUnique({ where: { id: d.siteId }, include: { organization: true } });
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
      const navy = '#163A5F'; const gold = '#E0A72E';
      const n = (v: number) => Math.round(v).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
      doc.rect(0, 0, doc.page.width, 70).fill(navy);
      doc.fillColor('#FFFFFF').fontSize(18).text(site?.organization?.name ?? 'SYL LOGISTIQUE', 50, 20);
      doc.fillColor(gold).fontSize(12).text('DEMANDE DE PRIX', 50, 44);
      doc.fillColor('#000000').fontSize(10);
      doc.text(`N° ${d.number}   —   Date : ${new Date(d.createdAt).toLocaleDateString('fr-FR')}`, 50, 85);
      if (site) doc.text(`Site : ${site.name}`);
      doc.text(`Objet : ${d.title}`);
      doc.moveDown();
      doc.fillColor(navy).fontSize(11).text('Fournisseurs consultés', { underline: true });
      doc.fillColor('#000000').fontSize(10).text(d.comparison.map((c) => c.supplierName).join(' — '));
      doc.moveDown();
      doc.text("Merci de nous indiquer votre meilleur prix unitaire pour chacun des articles ci-dessous, ainsi que votre délai de livraison et vos conditions de paiement.");
      let y = doc.y + 14;
      const x = [50, 130, 390, 470];
      doc.fillColor(navy);
      ['Code', 'Désignation', 'Quantité', 'Prix unitaire proposé'].forEach((h, i) => doc.text(h, x[i], y, { width: i === 1 ? 250 : 80 }));
      y += 16; doc.moveTo(50, y - 2).lineTo(545, y - 2).strokeColor(gold).stroke(); doc.fillColor('#000000');
      for (const l of d.lines) {
        if (y > 700) { doc.addPage(); y = 50; }
        doc.text(l.sku, x[0], y, { width: 75 }); doc.text(l.name, x[1], y, { width: 250 }); doc.text(`${n(l.quantity)} ${l.unit}`, x[2], y, { width: 75 });
        doc.moveTo(x[3], y + 12).lineTo(545, y + 12).strokeColor('#999999').stroke();
        y += 20;
      }
      doc.moveDown(2);
      doc.text('Délai de livraison : ______________________   Conditions de paiement : ______________________', 50, y + 16);
      doc.text('Validité de l\'offre : ______________________', 50, y + 36);
      const sy = Math.min(y + 80, 720);
      doc.fillColor(navy).text('Établi par', 50, sy, { underline: true });
      doc.fillColor('#000000').text(issuer.name, 50, sy + 14);
      if (issuer.service) doc.text(issuer.service);
      if (issuer.phone) doc.text(`Tél. : ${issuer.phone}`);
      doc.end();
    });
  }
}
