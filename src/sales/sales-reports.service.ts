import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma.service';
import { SalesDashboardService } from './sales-dashboard.service';

type Actor = { userId: string; role: string; siteId?: string };
const num = (v: any) => Number(v || 0);
const fmt = (n: any) => Math.round(Number(n || 0)).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const dt = (d: Date | string) => new Date(d).toLocaleDateString('fr-FR');

// Rapport commercial d'une période : chiffres du tableau de bord + détail par produit, client, commercial et factures impayées.
@Injectable()
export class SalesReportsService {
  constructor(private prisma: PrismaService, private dash: SalesDashboardService) {}

  async data(q: { from?: string; to?: string; siteId?: string }, actor: Actor) {
    const s = await this.dash.summary(q, actor);
    const siteId = s.siteId || undefined;
    const from = new Date(s.period.from), to = new Date(s.period.to);
    const [lines, invoices, open, site] = await Promise.all([
      this.prisma.salesOrderLine.findMany({ where: { salesOrder: { status: { notIn: ['QUOTE', 'CANCELLED'] }, ...(siteId ? { siteId } : {}), orderDate: { gte: from, lte: to } } }, select: { itemId: true, quantityOrdered: true, lineTotal: true, item: { select: { name: true, sku: true, unit: true } } } }),
      this.prisma.salesInvoice.findMany({ where: { status: { notIn: ['CANCELLED', 'DRAFT'] }, ...(siteId ? { siteId } : {}), invoiceDate: { gte: from, lte: to } }, select: { totalAmount: true, amountPaid: true, customer: { select: { name: true } } } }),
      this.prisma.salesInvoice.findMany({ where: { status: { in: ['UNPAID', 'PARTIALLY_PAID'] }, ...(siteId ? { siteId } : {}) }, select: { reference: true, invoiceDate: true, dueDate: true, totalAmount: true, amountPaid: true, customer: { select: { name: true, phone: true } } }, orderBy: { dueDate: 'asc' } }),
      siteId ? this.prisma.site.findUnique({ where: { id: siteId }, include: { organization: true } }) : this.prisma.site.findFirst({ include: { organization: true } }),
    ]);
    const prod = new Map<string, { sku: string; name: string; unit: string; qty: number; amount: number }>();
    for (const l of lines) { const p = prod.get(l.itemId) ?? { sku: l.item.sku, name: l.item.name, unit: l.item.unit, qty: 0, amount: 0 }; p.qty += num(l.quantityOrdered); p.amount += num(l.lineTotal); prod.set(l.itemId, p); }
    const cust = new Map<string, { name: string; count: number; total: number; paid: number }>();
    for (const i of invoices) { const n = i.customer?.name ?? '—'; const c = cust.get(n) ?? { name: n, count: 0, total: 0, paid: 0 }; c.count++; c.total += num(i.totalAmount); c.paid += num(i.amountPaid); cust.set(n, c); }
    const now = new Date();
    return {
      company: site?.organization?.name ?? 'SYL LOGISTIQUE', siteName: site?.name ?? '', summary: s,
      products: [...prod.values()].map((p) => ({ ...p, amount: Math.round(p.amount) })).sort((a, b) => b.amount - a.amount),
      customers: [...cust.values()].map((c) => ({ ...c, total: Math.round(c.total), paid: Math.round(c.paid) })).sort((a, b) => b.total - a.total),
      unpaid: open.map((i) => ({ reference: i.reference, customer: i.customer?.name ?? '—', phone: i.customer?.phone ?? '', invoiceDate: i.invoiceDate, dueDate: i.dueDate, balance: Math.round(num(i.totalAmount) - num(i.amountPaid)), lateDays: i.dueDate && i.dueDate < now ? Math.floor((now.getTime() - i.dueDate.getTime()) / 864e5) : 0 })),
    };
  }

  async pdf(q: any, actor: Actor): Promise<Buffer> {
    const d = await this.data(q, actor);
    const s = d.summary;
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
      const navy = '#163A5F', gold = '#E0A72E';
      const head = (t: string) => { if (doc.y > 700) doc.addPage(); doc.moveDown(0.8); doc.fillColor(navy).fontSize(12).text(t, 40, doc.y, { underline: true }); doc.moveDown(0.3); doc.fillColor('#000000').fontSize(9); };
      const table = (cols: { h: string; w: number; right?: boolean }[], rows: string[][]) => {
        let y = doc.y; let x = 40;
        doc.fillColor(navy).fontSize(9); cols.forEach((c) => { doc.text(c.h, x, y, { width: c.w - 4, align: c.right ? 'right' : 'left' }); x += c.w; });
        y += 14; doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor(gold).stroke(); doc.fillColor('#000000');
        for (const r of rows) {
          if (y > 760) { doc.addPage(); y = 40; }
          x = 40; let h = 12; r.forEach((v, i) => { doc.text(v, x, y, { width: cols[i].w - 4, align: cols[i].right ? 'right' : 'left' }); h = Math.max(h, doc.heightOfString(v, { width: cols[i].w - 4 })); x += cols[i].w; });
          y += h + 3;
        }
        doc.y = y + 4;
      };
      doc.rect(0, 0, doc.page.width, 64).fill(navy);
      doc.fillColor('#FFFFFF').fontSize(17).text(d.company, 40, 16); doc.fillColor(gold).fontSize(11).text('RAPPORT COMMERCIAL', 40, 40);
      doc.fillColor('#000000').fontSize(9).text(`Période : ${dt(s.period.from)} au ${dt(s.period.to)}${d.siteName ? '   —   Site : ' + d.siteName : ''}   —   Édité le ${dt(new Date())}`, 40, 76);
      doc.moveDown();
      head('Chiffres clés');
      table([{ h: 'Indicateur', w: 300 }, { h: 'Valeur', w: 215, right: true }], [
        ["Chiffre d'affaires facturé", `${fmt(s.turnover)} GNF`], ['Factures émises', String(s.invoicesCount)], ['Paiements reçus', `${fmt(s.paymentsReceived)} GNF (${s.paymentsCount})`],
        ['Impayés (toutes périodes)', `${fmt(s.unpaid.amount)} GNF (${s.unpaid.count} factures, ${s.unpaid.overdueCount} en retard)`],
        ['Commandes (hors devis)', String(s.ordersCount)], ['Devis en attente', String(s.quotesPending)], ['À préparer / livrées', `${s.ordersToPrepare + s.ordersPartiallyDelivered} / ${s.ordersDelivered}`], ['Clients actifs', String(s.activeCustomers)],
      ]);
      head('Ventes par produit');
      table([{ h: 'Code', w: 70 }, { h: 'Produit', w: 235 }, { h: 'Quantité', w: 90, right: true }, { h: 'Montant (GNF)', w: 120, right: true }], d.products.slice(0, 40).map((p) => [p.sku, p.name, `${fmt(p.qty)} ${p.unit}`, fmt(p.amount)]));
      head('Ventes par client');
      table([{ h: 'Client', w: 215 }, { h: 'Factures', w: 60, right: true }, { h: 'Facturé', w: 120, right: true }, { h: 'Payé', w: 120, right: true }], d.customers.slice(0, 40).map((c) => [c.name, String(c.count), fmt(c.total), fmt(c.paid)]));
      head('Performance des commerciaux');
      table([{ h: 'Commercial', w: 255 }, { h: 'Factures', w: 80, right: true }, { h: 'Facturé (GNF)', w: 180, right: true }], s.agents.map((a) => [a.name, String(a.count), fmt(a.total)]));
      head('Factures impayées');
      table([{ h: 'Facture', w: 85 }, { h: 'Client', w: 150 }, { h: 'Échéance', w: 70 }, { h: 'Retard', w: 50, right: true }, { h: 'Reste dû (GNF)', w: 110, right: true }, { h: 'Téléphone', w: 50 }], d.unpaid.slice(0, 80).map((u) => [u.reference, u.customer, u.dueDate ? dt(u.dueDate) : '—', u.lateDays ? u.lateDays + ' j' : '—', fmt(u.balance), u.phone || '']));
      doc.end();
    });
  }

  async xlsx(q: any, actor: Actor): Promise<Buffer> {
    const d = await this.data(q, actor);
    const s = d.summary;
    const wb = new ExcelJS.Workbook(); wb.creator = d.company;
    const sheet = (name: string, cols: { header: string; key: string; width: number }[], rows: any[]) => {
      const ws = wb.addWorksheet(name); ws.columns = cols; ws.addRows(rows);
      const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163A5F' } };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      return ws;
    };
    sheet('Chiffres clés', [{ header: 'Indicateur', key: 'k', width: 38 }, { header: 'Valeur', key: 'v', width: 26 }], [
      { k: 'Période', v: `${dt(s.period.from)} au ${dt(s.period.to)}` }, { k: "Chiffre d'affaires facturé (GNF)", v: s.turnover }, { k: 'Factures émises', v: s.invoicesCount },
      { k: 'Paiements reçus (GNF)', v: s.paymentsReceived }, { k: 'Impayés (GNF)', v: s.unpaid.amount }, { k: 'Factures impayées', v: s.unpaid.count }, { k: 'Factures en retard', v: s.unpaid.overdueCount },
      { k: 'Commandes (hors devis)', v: s.ordersCount }, { k: 'Devis en attente', v: s.quotesPending }, { k: 'Clients actifs', v: s.activeCustomers },
    ]);
    sheet('Produits', [{ header: 'Code', key: 'sku', width: 14 }, { header: 'Produit', key: 'name', width: 40 }, { header: 'Unité', key: 'unit', width: 10 }, { header: 'Quantité', key: 'qty', width: 14 }, { header: 'Montant (GNF)', key: 'amount', width: 18 }], d.products);
    sheet('Clients', [{ header: 'Client', key: 'name', width: 40 }, { header: 'Factures', key: 'count', width: 12 }, { header: 'Facturé (GNF)', key: 'total', width: 18 }, { header: 'Payé (GNF)', key: 'paid', width: 18 }], d.customers);
    sheet('Commerciaux', [{ header: 'Commercial', key: 'name', width: 34 }, { header: 'Factures', key: 'count', width: 12 }, { header: 'Facturé (GNF)', key: 'total', width: 18 }], s.agents);
    sheet('Impayés', [{ header: 'Facture', key: 'reference', width: 18 }, { header: 'Client', key: 'customer', width: 36 }, { header: 'Téléphone', key: 'phone', width: 16 }, { header: 'Date facture', key: 'invoiceDate', width: 14 }, { header: 'Échéance', key: 'dueDate', width: 14 }, { header: 'Retard (jours)', key: 'lateDays', width: 14 }, { header: 'Reste dû (GNF)', key: 'balance', width: 18 }],
      d.unpaid.map((u) => ({ ...u, invoiceDate: dt(u.invoiceDate), dueDate: u.dueDate ? dt(u.dueDate) : '' })));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
