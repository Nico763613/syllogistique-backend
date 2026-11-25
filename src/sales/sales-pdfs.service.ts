import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { readFile } from 'fs/promises';
import { join, basename } from 'path';
import { PrismaService } from '../prisma.service';
import { ensureReceiptNumber } from '../common/doc-numbers';

// Espaces ordinaires : les espaces insécables fines du français s'affichent mal dans les polices PDF standard.
const fmt = (n: any) => Number(n || 0).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ');
const dt = (d: Date) => d.toLocaleDateString('fr-FR');
const METHOD: Record<string, string> = { CASH: 'Espèces', BANK_TRANSFER: 'Virement bancaire', MOBILE_MONEY: 'Mobile Money', ORANGE_MONEY: 'Orange Money', CHEQUE: 'Chèque', OTHER: 'Autre' };
const ROLE: Record<string, string> = { SUPER_ADMIN: 'Direction', DIRECTEUR_GENERAL: 'Directeur général', ADMIN_LOGISTIQUE: 'Responsable logistique', RESPONSABLE_COMMERCIAL: 'Responsable commercial', CAISSIER: 'Caissier', COMPTABLE: 'Comptable', MAGASINIER: 'Magasinier', GESTIONNAIRE_FLOTTE: 'Gestionnaire de flotte' };
type Actor = { userId: string; role: string; siteId?: string };

// Devis, commande client, bon de livraison et reçu de paiement en PDF : mêmes données que l'application, aucune valeur inventée.
@Injectable()
export class SalesPdfsService {
  constructor(private prisma: PrismaService) {}

  private async loadLogo(url?: string | null): Promise<Buffer | null> {
    try {
      if (url?.startsWith('data:image/')) return Buffer.from(url.split(',')[1] || '', 'base64');
      if (url?.startsWith('/uploads/')) return await readFile(join(__dirname, '..', '..', 'uploads', basename(url)));
      if (url && /^https?:\/\//i.test(url)) { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()); }
    } catch { /* logo indisponible */ }
    return readFile(join(__dirname, '..', '..', 'public', 'logo-syl.png')).catch(() => null);
  }

  private checkSite(actor: Actor, siteId: string) {
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && actor.siteId !== siteId) throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
  }

  private async userLabel(id?: string | null) {
    if (!id) return '—';
    const u = await this.prisma.user.findUnique({ where: { id }, include: { role: true } as any }) as any;
    if (!u) return '—';
    return `${u.firstName} ${u.lastName}${u.role?.name && ROLE[u.role.name] ? ' — ' + ROLE[u.role.name] : ''}`;
  }

  private async build(title: string, number: string, meta: string[], body: (doc: any, org: any) => void): Promise<Buffer> {
    const org = (await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } })) as any;
    const logo = await this.loadLogo(org?.logoUrl);
    const color = /^#[0-9a-f]{6}$/i.test(org?.brandColor || '') ? org.brandColor : '#163A5F';
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
      let x = 50;
      if (logo) { try { doc.image(logo, 50, 45, { fit: [80, 55] }); x = 140; } catch { /* format non pris en charge */ } }
      doc.fontSize(17).fillColor(color).text(org?.name || 'SYL LOGISTIQUE', x, 48);
      doc.fontSize(9).fillColor('#555');
      [org?.address, [org?.phone, org?.email].filter(Boolean).join(' · ')].filter(Boolean).forEach((l) => doc.text(l, x));
      doc.y = Math.max(doc.y, 110); doc.x = 50;
      doc.moveDown(0.5).fontSize(15).fillColor(color).text(title, 50, doc.y);
      doc.fontSize(10).fillColor('#333').text(`N° ${number}`);
      meta.forEach((m) => doc.text(m));
      doc.moveDown(0.8).fillColor('#000');
      body(doc, { ...org, color });
      doc.fontSize(8).fillColor('#888').text(`${org?.name || 'SYL LOGISTIQUE'} — document généré par SYLLOGISTIQUE`, 50, 780, { align: 'center', width: 495 });
      doc.end();
    });
  }

  private customerBlock(doc: any, c: any) {
    doc.fontSize(11).text('Client :'); doc.fontSize(10).text(c.name);
    [c.contactName, c.phone, c.email, c.address, c.taxNumber ? 'N° fiscal : ' + c.taxNumber : null].filter(Boolean).forEach((l: string) => doc.text(l));
    doc.moveDown();
  }

  private table(doc: any, color: string, heads: string[], widths: number[], rows: string[][]) {
    let y = doc.y; let x = 50;
    doc.fontSize(9).fillColor(color); heads.forEach((h, i) => { doc.text(h, x, y, { width: widths[i] }); x += widths[i]; });
    y += 16; doc.moveTo(50, y - 3).lineTo(545, y - 3).strokeColor('#C9A24D').stroke(); doc.fillColor('#000');
    for (const r of rows) {
      if (y > 720) { doc.addPage(); y = 60; }
      x = 50; let h = 12;
      r.forEach((c, i) => { doc.text(c, x, y, { width: widths[i] - 4 }); h = Math.max(h, doc.y - y); x += widths[i]; });
      y += h + 4;
    }
    doc.y = y + 4; doc.x = 50;
  }

  async deliveryNotesOf(orderId: string, actor: Actor) {
    await this.order(orderId, actor);
    return this.prisma.$queryRawUnsafe('SELECT "id","number","delivered_at" AS "deliveredAt","receiver_name" AS "receiverName" FROM "delivery_notes" WHERE "order_id" = $1 ORDER BY "delivered_at" DESC', orderId);
  }

  // Bon de livraison numéroté d'une livraison précise (quantités livrées ce jour-là, cumul et reste)
  async deliveryNoteById(id: string, actor: Actor) {
    const r = (await this.prisma.$queryRawUnsafe('SELECT * FROM "delivery_notes" WHERE "id" = $1', id)) as any[];
    if (!r.length) throw new NotFoundException('Bon de livraison introuvable.');
    const n = r[0]; const o = await this.order(n.order_id, actor);
    const by = await this.userLabel(n.delivered_by); const lines: any[] = Array.isArray(n.lines) ? n.lines : JSON.parse(n.lines);
    return this.build('BON DE LIVRAISON', n.number, [`Commande : ${o.reference}`, `Livré le : ${new Date(n.delivered_at).toLocaleString('fr-FR')}`, ...(n.place ? [`Lieu de livraison : ${n.place}`] : [])], (doc, org) => {
      this.customerBlock(doc, o.customer);
      this.table(doc, org.color, ['Article', 'Commandé', 'Livré ce jour', 'Total livré', 'Reste'], [195, 65, 85, 80, 70], lines.map((l) => [l.item, String(l.ordered), String(l.deliveredNow), String(l.deliveredTotal), String(l.remaining)]));
      doc.fontSize(10).text(`Responsable : ${by}`);
      if (n.receiver_name) doc.text(`Réceptionnaire : ${n.receiver_name}`);
      if (n.observations) doc.text(`Observations : ${n.observations}`);
      doc.moveDown(2); const y = doc.y; doc.fontSize(9).fillColor('#6B7A8F');
      doc.text('Signature du réceptionnaire', 50, y); doc.rect(50, y + 14, 220, 60).strokeColor('#D9D9D9').stroke();
    });
  }

  private async order(id: string, actor: Actor) {
    const o = await this.prisma.salesOrder.findUnique({ where: { id }, include: { customer: true, lines: { include: { item: true } } } });
    if (!o) throw new NotFoundException('Commande introuvable.');
    this.checkSite(actor, o.siteId);
    return o;
  }

  // Devis (statut QUOTE) ou commande client : montants recalculés depuis les lignes
  async orderPdf(id: string, actor: Actor) {
    const o = await this.order(id, actor);
    const quote = o.status === 'QUOTE';
    const agent = await this.userLabel(o.createdById);
    const rows = o.lines.map((l) => { const q = Number(l.quantityOrdered), pu = Number(l.unitPrice); return { l, q, pu, gross: q * pu }; });
    const sub = rows.reduce((a, r) => a + Number(r.l.lineTotal), 0);
    const disc = sub * Number(o.discountPercent) / 100, tax = (sub - disc) * Number(o.taxPercent) / 100, total = sub - disc + tax;
    return this.build(quote ? 'DEVIS' : 'COMMANDE CLIENT', o.reference, [`Date : ${dt(o.orderDate)}`, ...(quote ? ['Devis non encore accepté : sans valeur de commande.'] : [])], (doc, org) => {
      this.customerBlock(doc, o.customer);
      this.table(doc, org.color, ['Désignation', 'Qté', 'PU (GNF)', 'Remise', 'Total (GNF)'], [220, 55, 90, 50, 80], rows.map((r) => [r.l.item.name, String(r.q), fmt(r.pu), Number(r.l.discountPercent) ? Number(r.l.discountPercent) + ' %' : '—', fmt(r.l.lineTotal)]));
      doc.fontSize(10).text(`Montant hors taxes : ${fmt(sub)} GNF`, { align: 'right' });
      if (disc) doc.text(`Remise globale (${Number(o.discountPercent)} %) : -${fmt(disc)} GNF`, { align: 'right' });
      if (tax) doc.text(`Taxe (${Number(o.taxPercent)} %) : ${fmt(tax)} GNF`, { align: 'right' });
      doc.fontSize(13).fillColor(org.color).text(`TOTAL : ${fmt(total)} GNF`, { align: 'right' });
      doc.fontSize(10).fillColor('#000').moveDown();
      if (o.notes) doc.text(`Observations : ${o.notes}`);
      doc.text(`Agent commercial : ${agent}`);
    });
  }

  // État de livraison : commandé / livré / restant, par ligne, à la date de l'édition (livraisons partielles incluses)
  async deliveryNotePdf(id: string, actor: Actor) {
    const o = await this.order(id, actor);
    if (o.status === 'QUOTE' || o.status === 'CANCELLED') throw new BadRequestException("Aucun bon de livraison pour un devis ou une commande annulée.");
    const agent = await this.userLabel(o.createdById);
    return this.build('ÉTAT DE LIVRAISON', `Commande ${o.reference}`, [`Édité le ${new Date().toLocaleString('fr-FR')}`], (doc, org) => {
      this.customerBlock(doc, o.customer);
      this.table(doc, org.color, ['Article', 'Commandé', 'Livré', 'Reste à livrer'], [235, 80, 80, 100], o.lines.map((l) => [l.item.name, String(Number(l.quantityOrdered)), String(Number(l.quantityDelivered)), String(Math.max(0, Number(l.quantityOrdered) - Number(l.quantityDelivered)))]));
      doc.fontSize(10).text(`Responsable : ${agent}`).moveDown(2);
      const y = doc.y; doc.fontSize(9).fillColor('#6B7A8F');
      doc.text('Signature du réceptionnaire', 50, y); doc.rect(50, y + 14, 220, 60).strokeColor('#D9D9D9').stroke();
    });
  }

  // Reçu : uniquement pour un encaissement client enregistré (jamais pour un règlement fournisseur ni un paiement inexistant)
  async receiptPdf(paymentId: string, actor: Actor) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { salesInvoice: { include: { customer: true } } } });
    if (!p) throw new NotFoundException('Paiement introuvable.');
    if (p.direction !== 'IN' || !p.salesInvoice) throw new BadRequestException("Un reçu n'existe que pour un encaissement client.");
    this.checkSite(actor, p.salesInvoice.siteId);
    const inv = p.salesInvoice;
    const number = await ensureReceiptNumber(this.prisma as any, p.id, actor.userId);
    const cashier = await this.userLabel(p.createdById);
    const total = Number(inv.totalAmount);
    // Cumul payé jusqu'à ce paiement inclus (les reçus anciens gardent leur propre situation)
    const before = await this.prisma.payment.aggregate({ _sum: { amount: true }, where: { salesInvoiceId: inv.id, direction: 'IN', OR: [{ paymentDate: { lt: p.paymentDate } }, { paymentDate: p.paymentDate, createdAt: { lte: p.createdAt } }] } });
    const paid = Number(before._sum.amount || 0), rest = Math.max(0, total - paid);
    const status = rest <= 0.01 ? 'Facture soldée' : 'Paiement partiel — solde restant dû';
    return this.build('REÇU DE PAIEMENT', number, [`Date : ${p.paymentDate.toLocaleString('fr-FR')}`], (doc, org) => {
      this.customerBlock(doc, inv.customer);
      doc.fontSize(10);
      [['Facture', inv.reference], ['Montant de la facture', fmt(total) + ' GNF'], ['Montant de ce paiement', fmt(p.amount) + ' GNF'], ['Total payé à ce jour (ce paiement inclus)', fmt(paid) + ' GNF'], ['Montant restant', fmt(rest) + ' GNF'], ['Mode de paiement', METHOD[p.method] || p.method], ['Référence de transaction', p.externalRef || p.reference || '—'], ['Encaissé par', cashier]].forEach(([k, v]) => { doc.fillColor('#555').text(k + ' : ', { continued: true }).fillColor('#000').text(v); });
      doc.moveDown().fontSize(12).fillColor(org.color).text(status);
    });
  }
}
