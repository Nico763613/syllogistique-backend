import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DAY_MS, bucketKey, bucketKeys, resolvePeriod, startOfDay, variation } from './dashboard-period';

interface Actor {
  userId: string;
  role: string;
  siteId?: string;
  department?: string;
}

type Status = 'ok' | 'warning' | 'critical';

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const gnf = (v: number): number => Math.round(v); // montants en GNF entiers
const pct = (a: number, b: number): number | null => (b ? Math.round((a / b) * 1000) / 10 : null);

// Canaux d'encaissement affichés (Chèque regroupé avec la banque)
const CHANNEL_OF: Record<string, string> = {
  CASH: 'CASH',
  ORANGE_MONEY: 'ORANGE_MONEY',
  MOBILE_MONEY: 'MOBILE_MONEY',
  BANK_TRANSFER: 'BANK',
  CHEQUE: 'BANK',
  OTHER: 'OTHER',
};
const CHANNEL_LABEL: Record<string, string> = {
  CASH: 'Caisse (espèces)',
  ORANGE_MONEY: 'Orange Money',
  MOBILE_MONEY: 'Mobile Money',
  BANK: 'Banque',
  OTHER: 'Autre',
};
const MOBILE_METHODS = ['MOBILE_MONEY', 'ORANGE_MONEY'];

const SETTING_DEFAULTS: Record<string, number> = {
  CASHIER_DISCOUNT_CAP_PERCENT: 5,
  MANAGER_DISCOUNT_CAP_PERCENT: 15,
};

// Actions rapides : `available: false` = l'écran est prévu mais le point d'accès n'existe pas encore côté API
const ACTIONS: Array<{ key: string; label: string; endpoint: string; roles: string[]; available: boolean }> = [
  { key: 'new_sale', label: 'Nouvelle vente (comptant, crédit, échelonnée, promotionnelle)', endpoint: 'POST /sales/orders', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_COMMERCIAL', 'CAISSIER'], available: true },
  { key: 'issue_invoice', label: 'Émettre la facture / le reçu', endpoint: 'POST /sales/orders/:id/invoice', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_COMMERCIAL', 'CAISSIER'], available: true },
  { key: 'record_payment', label: 'Enregistrer un règlement client', endpoint: 'POST /payments', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_COMMERCIAL', 'CAISSIER'], available: true },
  { key: 'new_quote', label: 'Créer un devis / une proforma', endpoint: 'POST /sales/orders (status: QUOTE)', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_COMMERCIAL'], available: true },
  { key: 'sales_return', label: 'Retour / annulation (avoir automatique)', endpoint: 'POST /sales/returns', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_COMMERCIAL', 'CAISSIER'], available: false },
  { key: 'cash_session', label: 'Ouvrir / clôturer la caisse', endpoint: 'POST /cash-sessions/open | /:id/close', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_COMMERCIAL', 'CAISSIER'], available: false },
  { key: 'cash_expense', label: 'Enregistrer un décaissement de caisse', endpoint: 'POST /cash-sessions/:id/expenses', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_COMMERCIAL', 'CAISSIER'], available: false },
];

@Injectable()
export class CommercialDashboardService {
  constructor(private prisma: PrismaService) {}

  // Site effectif : le Super Admin voit tout ou le site demandé ; les autres restent sur leur site.
  private resolveSite(actor: Actor, requested?: string): string | undefined {
    if (actor.role === 'SUPER_ADMIN') return requested || undefined;
    if (actor.siteId) {
      if (requested && requested !== actor.siteId) {
        throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
      }
      return actor.siteId;
    }
    return requested || undefined;
  }

  private async thresholds(): Promise<Record<string, number>> {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: Object.keys(SETTING_DEFAULTS) } } });
    const out = { ...SETTING_DEFAULTS };
    for (const r of rows as Array<{ key: string; value: string }>) {
      const n = Number(r.value);
      if (Number.isFinite(n)) out[r.key] = n;
    }
    return out;
  }

  async get(actor: Actor, q: DashboardQueryDto) {
    const isCashier = actor.role === 'CAISSIER';
    const siteId = this.resolveSite(actor, q.siteId);
    const p = resolvePeriod(q.period ?? (isCashier ? 'day' : 'month'), q.from, q.to, q.granularity);
    const th = await this.thresholds();
    const today = startOfDay(new Date());

    // Filtres communs. Un caissier ne voit que ses propres ventes et encaissements (sa session de caisse).
    const invoiceWhere = (from: Date, to: Date): any => ({
      ...(siteId ? { siteId } : {}),
      ...(isCashier ? { createdById: actor.userId } : {}),
      invoiceDate: { gte: from, lt: to },
      status: { notIn: ['DRAFT', 'CANCELLED'] },
    });
    const paymentWhere = (from: Date, to: Date): any => ({
      direction: 'IN',
      paymentDate: { gte: from, lt: to },
      ...(siteId ? { salesInvoice: { siteId } } : {}),
      ...(isCashier ? { createdById: actor.userId } : {}),
    });
    const scopeWhere: any = {
      ...(siteId ? { siteId } : {}),
      ...(isCashier ? { createdById: actor.userId } : {}),
    };

    const [invoices, prevInvoices, payments, prevPayments, returnsAgg, cancelledAgg, receivables, quotes, topLines, sessions] =
      await Promise.all([
        this.prisma.salesInvoice.findMany({
          where: invoiceWhere(p.from, p.to),
          select: {
            id: true, reference: true, invoiceDate: true, subtotal: true, discountAmount: true, taxAmount: true,
            totalAmount: true, amountPaid: true, paymentTerm: true, status: true, cogsAmount: true, customerId: true,
            customer: { select: { name: true } },
            salesOrder: { select: { saleType: true } },
          },
          orderBy: { invoiceDate: 'desc' },
        }),
        this.prisma.salesInvoice.aggregate({
          where: invoiceWhere(p.previousFrom, p.previousTo),
          _sum: { subtotal: true, discountAmount: true, taxAmount: true, totalAmount: true },
          _count: { _all: true },
        }),
        this.prisma.payment.findMany({
          where: paymentWhere(p.from, p.to),
          select: {
            id: true, method: true, amount: true, paymentDate: true, reference: true, externalRef: true,
            reconciled: true, cashSessionId: true, salesInvoice: { select: { reference: true } },
          },
          orderBy: { paymentDate: 'desc' },
        }),
        this.prisma.payment.aggregate({ where: paymentWhere(p.previousFrom, p.previousTo), _sum: { amount: true } }),
        this.prisma.salesReturn.aggregate({
          where: {
            status: 'VALIDATED',
            createdAt: { gte: p.from, lt: p.to },
            ...(siteId ? { siteId } : {}),
            ...(isCashier ? { createdBy: actor.userId } : {}),
          },
          _sum: { totalAmount: true },
          _count: { _all: true },
        }),
        this.prisma.salesInvoice.aggregate({
          where: { ...scopeWhere, status: 'CANCELLED', invoiceDate: { gte: p.from, lt: p.to } },
          _sum: { totalAmount: true },
          _count: { _all: true },
        }),
        // Créances clients (hors périmètre « session » du caissier)
        isCashier
          ? Promise.resolve([] as any[])
          : this.prisma.salesInvoice.findMany({
              where: { ...(siteId ? { siteId } : {}), status: { in: ['UNPAID', 'PARTIALLY_PAID'] } },
              select: {
                id: true, reference: true, invoiceDate: true, dueDate: true, totalAmount: true, amountPaid: true,
                customer: { select: { id: true, name: true, phone: true } },
              },
              orderBy: { dueDate: 'asc' },
              take: 5000,
            }),
        isCashier
          ? Promise.resolve([] as any[])
          : this.prisma.salesOrder.findMany({
              where: { ...(siteId ? { siteId } : {}), status: 'QUOTE' },
              select: { id: true, reference: true, orderDate: true, customer: { select: { name: true } }, lines: { select: { lineTotal: true } } },
              orderBy: { orderDate: 'desc' },
              take: 20,
            }),
        this.prisma.salesOrderLine.groupBy({
          by: ['itemId'],
          where: { salesOrder: { invoices: { some: invoiceWhere(p.from, p.to) } } },
          _sum: { quantityDelivered: true, lineTotal: true },
          orderBy: { _sum: { lineTotal: 'desc' } },
          take: 10,
        }),
        isCashier
          ? this.prisma.cashSession.findMany({
              where: { cashierId: actor.userId, ...(siteId ? { siteId } : {}) },
              orderBy: { openedAt: 'desc' },
              take: 1,
            })
          : this.prisma.cashSession.findMany({
              where: { ...(siteId ? { siteId } : {}), openedAt: { gte: p.from, lt: p.to } },
              select: {
                id: true, openedAt: true, closedAt: true, openingFloat: true, countedCash: true, expectedCash: true,
                gapAmount: true, validatedBy: true, cashier: { select: { firstName: true, lastName: true } },
              },
              orderBy: { openedAt: 'desc' },
              take: 50,
            }),
      ]);

    // ---------- Ventes ----------
    let ht = 0, tva = 0, ttc = 0, discounts = 0, grossBeforeDiscount = 0;
    let cogsTotal = 0, cogsRevenue = 0, invoicesWithCogs = 0;
    const revenueByBucket = new Map<string, { ht: number; tva: number; ttc: number; count: number; collected: number }>();
    const byClient = new Map<string, { name: string; ttc: number; count: number }>();
    const byType: Record<string, { count: number; ttc: number }> = {
      CASH: { count: 0, ttc: 0 }, CREDIT: { count: 0, ttc: 0 }, INSTALLMENT: { count: 0, ttc: 0 }, PROMO: { count: 0, ttc: 0 },
    };
    const bucket = (k: string) => {
      let b = revenueByBucket.get(k);
      if (!b) { b = { ht: 0, tva: 0, ttc: 0, count: 0, collected: 0 }; revenueByBucket.set(k, b); }
      return b;
    };

    for (const i of invoices as any[]) {
      const sub = num(i.subtotal), disc = num(i.discountAmount), tax = num(i.taxAmount), tot = num(i.totalAmount);
      const net = sub - disc; // HT après remise
      ht += net; tva += tax; ttc += tot; discounts += disc; grossBeforeDiscount += sub;
      if (i.cogsAmount !== null && i.cogsAmount !== undefined) {
        cogsTotal += num(i.cogsAmount); cogsRevenue += net; invoicesWithCogs++;
      }
      const b = bucket(bucketKey(new Date(i.invoiceDate), p.granularity));
      b.ht += net; b.tva += tax; b.ttc += tot; b.count++;
      const c = byClient.get(i.customerId) ?? { name: i.customer?.name ?? '—', ttc: 0, count: 0 };
      c.ttc += tot; c.count++; byClient.set(i.customerId, c);
      const t = i.salesOrder?.saleType ?? (i.paymentTerm === 'CREDIT' ? 'CREDIT' : 'CASH');
      (byType[t] ?? (byType[t] = { count: 0, ttc: 0 })).count++;
      byType[t].ttc += tot;
    }
    const salesCount = invoices.length;
    const prevSub = num(prevInvoices._sum.subtotal), prevDisc = num(prevInvoices._sum.discountAmount);
    const prevHt = prevSub - prevDisc, prevTva = num(prevInvoices._sum.taxAmount), prevTtc = num(prevInvoices._sum.totalAmount);
    const prevCount = prevInvoices._count._all as number;

    // ---------- Encaissements ----------
    let collected = 0;
    const byChannel: Record<string, number> = {};
    for (const pay of payments as any[]) {
      const amt = num(pay.amount);
      collected += amt;
      const ch = CHANNEL_OF[pay.method] ?? 'OTHER';
      byChannel[ch] = (byChannel[ch] ?? 0) + amt;
      bucket(bucketKey(new Date(pay.paymentDate), p.granularity)).collected += amt;
    }
    const prevCollected = num(prevPayments._sum.amount);

    // ---------- Créances clients ----------
    const aging = { notDue: 0, d1_30: 0, d31_60: 0, d60plus: 0 };
    let receivableTotal = 0, overdueTotal = 0, overdueCount = 0;
    const overdueList: any[] = [];
    const dueTodayList: any[] = [];
    for (const r of receivables as any[]) {
      const remaining = num(r.totalAmount) - num(r.amountPaid);
      if (remaining <= 0) continue;
      receivableTotal += remaining;
      const due = startOfDay(new Date(r.dueDate ?? r.invoiceDate));
      const daysLate = Math.floor((+today - +due) / DAY_MS);
      if (daysLate <= 0) aging.notDue += remaining;
      else if (daysLate <= 30) aging.d1_30 += remaining;
      else if (daysLate <= 60) aging.d31_60 += remaining;
      else aging.d60plus += remaining;
      const row = {
        invoiceId: r.id, reference: r.reference, customer: r.customer?.name ?? '—', phone: r.customer?.phone ?? null,
        dueDate: r.dueDate ?? r.invoiceDate, remaining: gnf(remaining), daysLate: Math.max(daysLate, 0),
      };
      if (daysLate > 0) { overdueTotal += remaining; overdueCount++; overdueList.push(row); }
      else if (daysLate === 0) dueTodayList.push(row);
    }
    overdueList.sort((a, b) => b.daysLate - a.daysLate);

    // ---------- Caisse ----------
    let cash: any;
    if (isCashier) {
      const s: any = (sessions as any[])[0] ?? null;
      if (s) {
        const cashIn = await this.prisma.payment.aggregate({
          where: { cashSessionId: s.id, direction: 'IN', method: 'CASH' },
          _sum: { amount: true },
        });
        const expected = num(s.openingFloat) + num(cashIn._sum.amount);
        cash = {
          sessionId: s.id, open: !s.closedAt, openedAt: s.openedAt, closedAt: s.closedAt,
          openingFloat: gnf(num(s.openingFloat)), cashCollected: gnf(num(cashIn._sum.amount)),
          expectedCash: gnf(expected), countedCash: s.countedCash === null ? null : gnf(num(s.countedCash)),
          gap: s.closedAt && s.countedCash !== null ? gnf(num(s.countedCash) - expected) : null,
        };
      } else {
        cash = { sessionId: null, open: false };
      }
    } else {
      const list = sessions as any[];
      const closed = list.filter((s) => s.closedAt);
      cash = {
        sessionsCount: list.length,
        openSessions: list.filter((s) => !s.closedAt).length,
        totalGap: gnf(closed.reduce((a, s) => a + num(s.gapAmount), 0)),
        sessionsWithGap: closed.filter((s) => num(s.gapAmount) !== 0).length,
        toValidate: closed.filter((s) => !s.validatedBy).length,
        sessions: list.slice(0, 10).map((s) => ({
          id: s.id, cashier: `${s.cashier?.firstName ?? ''} ${s.cashier?.lastName ?? ''}`.trim(), openedAt: s.openedAt,
          closedAt: s.closedAt, gap: s.gapAmount === null ? null : gnf(num(s.gapAmount)), validated: !!s.validatedBy,
        })),
      };
    }

    // ---------- Produits les plus vendus ----------
    const itemIds = (topLines as any[]).map((l) => l.itemId);
    const items = itemIds.length
      ? await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, sku: true, unit: true } })
      : [];
    const itemById = new Map((items as any[]).map((it) => [it.id, it]));
    const topProducts = (topLines as any[]).map((l) => ({
      itemId: l.itemId, name: itemById.get(l.itemId)?.name ?? '—', sku: itemById.get(l.itemId)?.sku ?? null,
      unit: itemById.get(l.itemId)?.unit ?? null, quantity: num(l._sum.quantityDelivered), amount: gnf(num(l._sum.lineTotal)),
    }));

    // ---------- KPI ----------
    const discountRate = pct(discounts, grossBeforeDiscount);
    const discountStatus: Status =
      discountRate === null ? 'ok'
        : discountRate > th.MANAGER_DISCOUNT_CAP_PERCENT ? 'critical'
        : discountRate > th.CASHIER_DISCOUNT_CAP_PERCENT ? 'warning' : 'ok';
    const margin = cogsRevenue - cogsTotal;
    const trendKeys = bucketKeys(p.from, p.to, p.granularity);
    const sparkline = trendKeys.slice(-7).map((k) => gnf(revenueByBucket.get(k)?.ttc ?? 0));

    const card = (
      key: string, label: string, value: number | null, previous: number | null,
      favorable: 'up' | 'down' | 'neutral', status: Status = 'ok', extra: Record<string, unknown> = {},
    ) => ({
      key, label, unit: 'GNF', value: value === null ? null : gnf(value), previous: previous === null ? null : gnf(previous),
      variationPercent: value === null || previous === null ? null : variation(value, previous), favorable, status, ...extra,
    });

    const salesCards = [
      card('revenue_ttc', "Chiffre d'affaires TTC", ttc, prevTtc, 'up', 'ok', {
        breakdown: { ht: gnf(ht), tva: gnf(tva), ttc: gnf(ttc) }, sparkline,
      }),
      { ...card('revenue_ht', "Chiffre d'affaires HT", ht, prevHt, 'up'), vat: { value: gnf(tva), previous: gnf(prevTva) } },
      { key: 'sales_count', label: 'Nombre de ventes', unit: 'ventes', value: salesCount, previous: prevCount, variationPercent: variation(salesCount, prevCount), favorable: 'up', status: 'ok' as Status, averageBasket: salesCount ? gnf(ttc / salesCount) : 0 },
      card('collections', 'Encaissements', collected, prevCollected, 'up', 'ok', {
        byChannel: Object.keys(CHANNEL_LABEL).map((c) => ({ channel: c, label: CHANNEL_LABEL[c], amount: gnf(byChannel[c] ?? 0) })),
      }),
    ];
    const fullCards = isCashier ? [] : [
      card('receivables', 'Crédits clients en cours', receivableTotal, null, 'down', overdueCount > 0 ? 'warning' : 'ok', {
        overdue: { amount: gnf(overdueTotal), count: overdueCount },
      }),
      { key: 'discounts', label: 'Remises accordées', unit: 'GNF', value: gnf(discounts), previous: gnf(prevDisc), variationPercent: variation(discounts, prevDisc), favorable: 'down', status: discountStatus, ratePercent: discountRate, caps: { cashierPercent: th.CASHIER_DISCOUNT_CAP_PERCENT, managerPercent: th.MANAGER_DISCOUNT_CAP_PERCENT } },
      {
        key: 'gross_margin', label: 'Marge brute', unit: 'GNF', value: invoicesWithCogs ? gnf(margin) : null, previous: null, variationPercent: null,
        favorable: 'up', status: 'ok' as Status, ratePercent: invoicesWithCogs ? pct(margin, cogsRevenue) : null,
        coveragePercent: pct(invoicesWithCogs, salesCount),
        note: invoicesWithCogs === salesCount ? null : 'Calculée sur les factures dont le coût des marchandises est renseigné.',
      },
    ];
    const cashCard = isCashier
      ? { key: 'cash_gap', label: 'Écart de caisse (session)', unit: 'GNF', value: cash.gap ?? null, expected: cash.expectedCash ?? null, counted: cash.countedCash ?? null, favorable: 'neutral', status: (cash.gap ? 'critical' : 'ok') as Status }
      : { key: 'cash_gap', label: 'Écarts de caisse (période)', unit: 'GNF', value: cash.totalGap, favorable: 'neutral', status: (cash.sessionsWithGap > 0 ? 'critical' : 'ok') as Status, sessionsWithGap: cash.sessionsWithGap, openSessions: cash.openSessions };
    const returnsCard = {
      key: 'returns_cancellations', label: 'Retours / annulations', unit: 'GNF', favorable: 'down', status: 'ok' as Status,
      value: gnf(num(returnsAgg._sum.totalAmount) + num(cancelledAgg._sum.totalAmount)),
      returns: { count: returnsAgg._count._all, amount: gnf(num(returnsAgg._sum.totalAmount)) },
      cancellations: { count: cancelledAgg._count._all, amount: gnf(num(cancelledAgg._sum.totalAmount)) },
    };

    // ---------- Listes de travail ----------
    const mobileToReconcile = (payments as any[])
      .filter((x) => MOBILE_METHODS.includes(x.method) && !x.reconciled)
      .slice(0, 20)
      .map((x) => ({ paymentId: x.id, method: x.method, amount: gnf(num(x.amount)), date: x.paymentDate, invoice: x.salesInvoice?.reference ?? null, reference: x.externalRef ?? x.reference ?? null }));
    const worklists = {
      overdueReceivables: overdueList.slice(0, 20),
      dueToday: dueTodayList.slice(0, 20),
      pendingQuotes: (quotes as any[]).map((o) => ({ orderId: o.id, reference: o.reference, date: o.orderDate, customer: o.customer?.name ?? '—', amount: gnf((o.lines as any[]).reduce((a, l) => a + num(l.lineTotal), 0)) })),
      mobileMoneyToReconcile: mobileToReconcile,
      latestSales: (invoices as any[]).slice(0, 10).map((i) => ({ invoiceId: i.id, reference: i.reference, date: i.invoiceDate, customer: i.customer?.name ?? '—', total: gnf(num(i.totalAmount)), status: i.status })),
    };

    return {
      generatedAt: new Date().toISOString(),
      access: { role: actor.role, scope: isCashier ? 'session' : 'full', siteId: siteId ?? null },
      period: {
        key: p.key, from: p.from.toISOString(), to: new Date(+p.to - 1).toISOString(), granularity: p.granularity,
        previousFrom: p.previousFrom.toISOString(), previousTo: new Date(+p.previousTo - 1).toISOString(),
      },
      kpis: [...salesCards, ...fullCards, cashCard, returnsCard],
      cash,
      actions: ACTIONS.map((a) => ({ ...a, allowed: a.roles.includes(actor.role) })),
      worklists,
      charts: {
        revenueTrend: trendKeys.map((k) => {
          const b = revenueByBucket.get(k);
          return { period: k, ht: gnf(b?.ht ?? 0), tva: gnf(b?.tva ?? 0), ttc: gnf(b?.ttc ?? 0), sales: b?.count ?? 0, collected: gnf(b?.collected ?? 0) };
        }),
        paymentsByMethod: Object.keys(CHANNEL_LABEL).map((c) => ({ channel: c, label: CHANNEL_LABEL[c], amount: gnf(byChannel[c] ?? 0), sharePercent: pct(byChannel[c] ?? 0, collected) })),
        salesByType: Object.keys(byType).map((t) => ({ type: t, count: byType[t].count, ttc: gnf(byType[t].ttc) })),
        receivablesAging: isCashier ? null : [
          { bucket: 'NOT_DUE', label: 'À échoir', amount: gnf(aging.notDue) },
          { bucket: 'D1_30', label: 'En retard 1–30 j', amount: gnf(aging.d1_30) },
          { bucket: 'D31_60', label: 'En retard 31–60 j', amount: gnf(aging.d31_60) },
          { bucket: 'D60_PLUS', label: 'En retard > 60 j', amount: gnf(aging.d60plus) },
        ],
        topCustomers: isCashier ? null : [...byClient.entries()].sort((a, b) => b[1].ttc - a[1].ttc).slice(0, 10).map(([id, c]) => ({ customerId: id, name: c.name, sales: c.count, ttc: gnf(c.ttc) })),
        topProducts,
      },
    };
  }
}
