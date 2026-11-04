import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Actor } from '../common/actor';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DAY_MS, bucketKey, bucketKeys, resolvePeriod, startOfDay } from './dashboard-period';
import { Status, gnf, kpi, num, pct, periodInfo, resolveSite } from './dashboard-common';

const FINANCE_ROLES = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'LECTEUR'];

const ACTIONS: Array<{ key: string; label: string; endpoint: string; roles: string[] }> = [
  { key: 'new_order', label: 'Créer un bon de commande', endpoint: 'POST /purchases/orders', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'MAGASINIER'] },
  { key: 'reorder', label: 'Générer les commandes de réapprovisionnement', endpoint: 'POST /purchases/reorder/create-drafts', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'MAGASINIER'] },
  { key: 'approve_order', label: 'Valider un bon de commande', endpoint: 'POST /purchases/orders/:id/confirm', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'] },
  { key: 'receive', label: 'Réceptionner une livraison (rejets, fret)', endpoint: 'POST /purchases/orders/:id/receive', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'MAGASINIER'] },
  { key: 'supplier_invoice', label: 'Enregistrer une facture fournisseur', endpoint: 'POST /purchases/orders/:id/invoice', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'] },
  { key: 'transfer', label: 'Transférer du stock vers un autre site', endpoint: 'POST /transfers', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'MAGASINIER'] },
  { key: 'receive_transfer', label: 'Réceptionner un transfert', endpoint: 'POST /transfers/:id/receive', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'MAGASINIER'] },
];

const TRANSFER_LATE_HOURS = 48;

@Injectable()
export class LogisticsDashboardService {
  constructor(private prisma: PrismaService) {}

  async get(actor: Actor, q: DashboardQueryDto) {
    const siteId = resolveSite(actor, q.siteId);
    const finance = FINANCE_ROLES.includes(actor.role);
    const p = resolvePeriod(q.period ?? 'month', q.from, q.to, q.granularity);
    const now = new Date();
    const today = startOfDay(now);
    const siteWhere: any = siteId ? { siteId } : {};

    const [orders, openOrders, receipts, prevReceiptAgg, invoices, transfers, items] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: { ...siteWhere, orderDate: { gte: p.from, lt: p.to }, status: { not: 'CANCELLED' } },
        select: { id: true, orderDate: true, supplierId: true, supplier: { select: { name: true } }, lines: { select: { lineTotal: true } } },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { ...siteWhere, status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] } },
        select: {
          id: true, reference: true, status: true, orderDate: true, expectedDate: true, supplierId: true,
          supplier: { select: { name: true } },
          lines: { select: { quantityOrdered: true, quantityReceived: true, lineTotal: true } },
        },
        orderBy: { expectedDate: 'asc' },
      }),
      this.prisma.goodsReceipt.findMany({
        where: { ...siteWhere, receivedAt: { gte: p.from, lt: p.to } },
        select: {
          id: true, receivedAt: true, freightCost: true, purchaseOrderId: true,
          purchaseOrder: { select: { orderDate: true, supplierId: true, supplier: { select: { name: true, contractualLeadDays: true } } } },
          lines: { select: { quantityReceived: true, quantityAccepted: true, quantityRejected: true } },
        },
        orderBy: { receivedAt: 'asc' },
      }),
      this.prisma.goodsReceipt.aggregate({
        where: { ...siteWhere, receivedAt: { gte: p.previousFrom, lt: p.previousTo } },
        _sum: { freightCost: true }, _count: { _all: true },
      }),
      finance
        ? this.prisma.purchaseInvoice.findMany({
            where: { ...siteWhere, status: { in: ['UNPAID', 'PARTIALLY_PAID'] } },
            select: { id: true, reference: true, dueDate: true, invoiceDate: true, totalAmount: true, amountPaid: true, supplierId: true, supplier: { select: { name: true, paymentTermDays: true } } },
          })
        : Promise.resolve([] as any[]),
      this.prisma.stockTransfer.findMany({
        where: {
          status: 'IN_TRANSIT',
          ...(siteId ? { OR: [{ fromSiteId: siteId }, { toSiteId: siteId }] } : {}),
        },
        select: { id: true, reference: true, shippedAt: true, fromSiteId: true, toSiteId: true, fromSite: { select: { name: true } }, toSite: { select: { name: true } }, lines: { select: { quantity: true } } },
        orderBy: { shippedAt: 'asc' },
      }),
      this.prisma.inventoryItem.findMany({
        where: { ...siteWhere, deletedAt: null },
        select: { id: true, name: true, unit: true, currentQuantity: true, minimumQuantity: true, reorderPoint: true, supplier: { select: { name: true } } },
        take: 2000,
      }),
    ]);

    // ---- Commandes en cours / en retard ----
    const orderTotal = (o: { lines: Array<{ lineTotal: unknown }> }) => o.lines.reduce((a, l) => a + num(l.lineTotal), 0);
    const live = openOrders.filter((o) => o.status !== 'DRAFT');
    const late = live.filter((o) => o.expectedDate && +o.expectedDate < +today);
    const lateDays = (o: { expectedDate: Date | null }) => (o.expectedDate ? Math.floor((+today - +startOfDay(o.expectedDate)) / DAY_MS) : 0);

    // ---- Réceptions de la période ----
    let received = 0, accepted = 0, rejected = 0, freight = 0;
    const leadBySupplier = new Map<string, { name: string; days: number[]; contractual: number | null }>();
    const firstReceiptOfOrder = new Map<string, Date>();
    const receiptsByBucket = new Map<string, number>();
    for (const r of receipts) {
      freight += num(r.freightCost);
      for (const l of r.lines) {
        received += num(l.quantityReceived);
        accepted += num(l.quantityAccepted);
        rejected += num(l.quantityRejected);
      }
      if (!firstReceiptOfOrder.has(r.purchaseOrderId)) {
        firstReceiptOfOrder.set(r.purchaseOrderId, r.receivedAt);
        const days = Math.max(0, (+r.receivedAt - +r.purchaseOrder.orderDate) / DAY_MS);
        const sid = r.purchaseOrder.supplierId;
        const e = leadBySupplier.get(sid) ?? { name: r.purchaseOrder.supplier.name, days: [], contractual: r.purchaseOrder.supplier.contractualLeadDays ?? null };
        e.days.push(days);
        leadBySupplier.set(sid, e);
      }
      const k = bucketKey(r.receivedAt, p.granularity);
      receiptsByBucket.set(k, (receiptsByBucket.get(k) ?? 0) + 1);
    }
    const allLead = [...leadBySupplier.values()].flatMap((e) => e.days);
    const avgLead = allLead.length ? allLead.reduce((a, b) => a + b, 0) / allLead.length : null;
    const contractuals = [...leadBySupplier.values()].filter((e) => e.contractual !== null).flatMap((e) => e.days.map(() => e.contractual as number));
    const avgContractual = contractuals.length ? contractuals.reduce((a, b) => a + b, 0) / contractuals.length : null;
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const conformRate = received ? pct(accepted, received) : null;

    // ---- Dettes fournisseurs ----
    const aging = { notDue: 0, d1_30: 0, d31_60: 0, d60plus: 0 };
    const dueSoon: any[] = [];
    let debt = 0, overdueDebt = 0;
    for (const inv of invoices as any[]) {
      const open = num(inv.totalAmount) - num(inv.amountPaid);
      if (open <= 0) continue;
      debt += open;
      const due = inv.dueDate ?? (inv.supplier?.paymentTermDays ? new Date(+inv.invoiceDate + inv.supplier.paymentTermDays * DAY_MS) : inv.invoiceDate);
      const overdueDays = Math.floor((+today - +startOfDay(due)) / DAY_MS);
      if (overdueDays <= 0) {
        aging.notDue += open;
        if (overdueDays >= -7) dueSoon.push({ invoiceId: inv.id, reference: inv.reference, supplier: inv.supplier?.name, dueDate: due, amount: gnf(open) });
      } else {
        overdueDebt += open;
        if (overdueDays <= 30) aging.d1_30 += open;
        else if (overdueDays <= 60) aging.d31_60 += open;
        else aging.d60plus += open;
      }
    }

    // ---- Transferts ----
    const lateTransfers = transfers.filter((t) => t.shippedAt && now.getTime() - +t.shippedAt > TRANSFER_LATE_HOURS * 3_600_000);

    // ---- Réapprovisionnement ----
    const toReorder = items
      .filter((i) => {
        const threshold = i.reorderPoint !== null && i.reorderPoint !== undefined ? num(i.reorderPoint) : num(i.minimumQuantity);
        return threshold > 0 && num(i.currentQuantity) <= threshold;
      })
      .sort((a, b) => num(a.currentQuantity) - num(b.currentQuantity));

    // ---- Achats par pas ----
    const keys = bucketKeys(p.from, p.to, p.granularity);
    const purchasesByBucket = new Map<string, { amount: number; count: number }>();
    const spendBySupplier = new Map<string, { name: string; amount: number; orders: number }>();
    let spend = 0;
    for (const o of orders) {
      const t = orderTotal(o);
      spend += t;
      const k = bucketKey(o.orderDate, p.granularity);
      const b = purchasesByBucket.get(k) ?? { amount: 0, count: 0 };
      b.amount += t; b.count += 1;
      purchasesByBucket.set(k, b);
      const s = spendBySupplier.get(o.supplierId) ?? { name: o.supplier.name, amount: 0, orders: 0 };
      s.amount += t; s.orders += 1;
      spendBySupplier.set(o.supplierId, s);
    }

    const leadStatus: Status = avgLead !== null && avgContractual !== null && avgLead > avgContractual * 1.2 ? 'critical' : avgLead !== null && avgContractual !== null && avgLead > avgContractual ? 'warning' : 'ok';
    const conformStatus: Status = conformRate === null ? 'ok' : conformRate < 90 ? 'critical' : conformRate < 95 ? 'warning' : 'ok';

    const cards = [
      kpi('open_orders', 'Commandes en cours', 'commandes', live.length, null, 'neutral', 'ok', { amount: finance ? gnf(live.reduce((a, o) => a + orderTotal(o), 0)) : null }),
      kpi('late_orders', 'Commandes en retard', 'commandes', late.length, null, 'down', late.length ? (late.some((o) => lateDays(o) > 7) ? 'critical' : 'warning') : 'ok'),
      kpi('lead_time', 'Délai moyen de livraison', 'jours', avgLead === null ? null : round1(avgLead), null, 'down', leadStatus, { contractualDays: avgContractual === null ? null : round1(avgContractual) }),
      kpi('conformity', 'Taux de réception conforme', '%', conformRate, null, 'up', conformStatus, { received: round1(received), accepted: round1(accepted), rejected: round1(rejected) }),
      kpi('receipts', 'Réceptions de la période', 'réceptions', receipts.length, prevReceiptAgg._count._all, 'up'),
      kpi('freight', 'Coût de fret', 'GNF', finance ? gnf(freight) : null, finance ? gnf(num(prevReceiptAgg._sum.freightCost)) : null, 'down', 'ok', { perUnit: finance && accepted ? gnf(freight / accepted) : null }),
      kpi('purchases', 'Achats de la période', 'GNF', finance ? gnf(spend) : null, null, 'neutral'),
      kpi('supplier_debt', 'Dettes fournisseurs', 'GNF', finance ? gnf(debt) : null, null, 'down', overdueDebt > 0 ? 'warning' : 'ok', { overdue: finance ? gnf(overdueDebt) : null }),
      kpi('transfers_late', 'Transferts en transit > 48 h', 'transferts', lateTransfers.length, null, 'down', lateTransfers.length ? 'warning' : 'ok', { inTransit: transfers.length }),
    ];

    return {
      generatedAt: now.toISOString(),
      access: { role: actor.role, scope: finance ? 'full' : 'operational', siteId: siteId ?? null },
      period: periodInfo(p),
      kpis: cards,
      actions: ACTIONS.map((a) => ({ ...a, available: true, allowed: a.roles.includes(actor.role) })),
      worklists: {
        expectedDeliveries: live.slice(0, 20).map((o) => ({
          orderId: o.id, reference: o.reference, supplier: o.supplier.name, expectedDate: o.expectedDate,
          lateDays: Math.max(0, lateDays(o)), status: o.status,
          remainingQuantity: Math.round(o.lines.reduce((a, l) => a + num(l.quantityOrdered) - num(l.quantityReceived), 0) * 100) / 100,
        })),
        ordersToApprove: openOrders.filter((o) => o.status === 'DRAFT').slice(0, 20).map((o) => ({
          orderId: o.id, reference: o.reference, supplier: o.supplier.name, orderDate: o.orderDate, amount: finance ? gnf(orderTotal(o)) : null,
        })),
        itemsToReorder: toReorder.slice(0, 20).map((i) => ({
          itemId: i.id, name: i.name, unit: i.unit, quantity: num(i.currentQuantity),
          threshold: i.reorderPoint !== null && i.reorderPoint !== undefined ? num(i.reorderPoint) : num(i.minimumQuantity), supplier: i.supplier?.name ?? null,
        })),
        transfersToReceive: transfers.filter((t) => !siteId || t.toSiteId === siteId).slice(0, 20).map((t) => ({
          transferId: t.id, reference: t.reference, from: t.fromSite.name, to: t.toSite.name, shippedAt: t.shippedAt,
          late: lateTransfers.some((x) => x.id === t.id), lines: t.lines.length,
        })),
        supplierInvoicesDueSoon: dueSoon.sort((a, b) => +a.dueDate - +b.dueDate).slice(0, 20),
      },
      charts: {
        purchasesTrend: finance ? keys.map((k) => ({ period: k, amount: gnf(purchasesByBucket.get(k)?.amount ?? 0), orders: purchasesByBucket.get(k)?.count ?? 0 })) : null,
        receiptsTrend: keys.map((k) => ({ period: k, receipts: receiptsByBucket.get(k) ?? 0 })),
        spendBySupplier: finance ? [...spendBySupplier.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 10).map(([id, s]) => ({ supplierId: id, name: s.name, amount: gnf(s.amount), orders: s.orders, sharePercent: pct(s.amount, spend) })) : null,
        leadTimeBySupplier: [...leadBySupplier.entries()].map(([id, e]) => ({
          supplierId: id, name: e.name, averageDays: round1(e.days.reduce((a, b) => a + b, 0) / e.days.length), contractualDays: e.contractual, deliveries: e.days.length,
        })).sort((a, b) => b.averageDays - a.averageDays),
        supplierDebtAging: finance ? [
          { bucket: 'NOT_DUE', label: 'À échoir', amount: gnf(aging.notDue) },
          { bucket: 'D1_30', label: 'En retard 1–30 j', amount: gnf(aging.d1_30) },
          { bucket: 'D31_60', label: 'En retard 31–60 j', amount: gnf(aging.d31_60) },
          { bucket: 'D60_PLUS', label: 'En retard > 60 j', amount: gnf(aging.d60plus) },
        ] : null,
      },
    };
  }
}
