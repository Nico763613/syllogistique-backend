import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Actor } from '../common/actor';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DAY_MS, bucketKey, bucketKeys, resolvePeriod, startOfDay } from './dashboard-period';
import { Status, gnf, kpi, num, pct, periodInfo, resolveSite } from './dashboard-common';

const FINANCE_ROLES = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'LECTEUR'];
const LOSS_CODES = ['LOSS', 'BREAKAGE', 'SCRAP', 'DONATION'];
const LOSS_LABEL: Record<string, string> = { LOSS: 'Perte / vol', BREAKAGE: 'Casse', SCRAP: 'Rebut', DONATION: 'Don' };
const EXPIRY_ALERT_DAYS = 30;
const DORMANT_DAYS = 90;

const ACTIONS: Array<{ key: string; label: string; endpoint: string; roles: string[] }> = [
  { key: 'stock_in', label: 'Entrée de stock (lot, péremption)', endpoint: 'POST /inventory/movements/in', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'MAGASINIER'] },
  { key: 'stock_out', label: 'Sortie de stock motivée', endpoint: 'POST /inventory/movements/out', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'MAGASINIER'] },
  { key: 'transfer', label: 'Transfert inter-sites', endpoint: 'POST /transfers', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'MAGASINIER'] },
  { key: 'inventory', label: 'Lancer un inventaire physique', endpoint: 'POST /inventory/counts', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'MAGASINIER'] },
  { key: 'locations', label: 'Gérer les emplacements', endpoint: 'POST /stock-locations', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'MAGASINIER'] },
  { key: 'reorder', label: 'Réapprovisionner', endpoint: 'POST /purchases/reorder/create-drafts', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'MAGASINIER'] },
];

@Injectable()
export class StockDashboardService {
  constructor(private prisma: PrismaService) {}

  async get(actor: Actor, q: DashboardQueryDto) {
    const siteId = resolveSite(actor, q.siteId);
    const finance = FINANCE_ROLES.includes(actor.role);
    const p = resolvePeriod(q.period ?? 'month', q.from, q.to, q.granularity);
    const now = new Date();
    const today = startOfDay(now);
    const siteWhere: any = siteId ? { siteId } : {};
    const val = (v: number) => (finance ? gnf(v) : null);

    const [items, movements, prevLoss, lots, openCounts, validatedCounts, lastOut] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { ...siteWhere, deletedAt: null },
        select: { id: true, name: true, unit: true, currentQuantity: true, minimumQuantity: true, reorderPoint: true, unitPrice: true, category: { select: { name: true } } },
      }),
      this.prisma.stockMovement.findMany({
        where: { ...siteWhere, createdAt: { gte: p.from, lt: p.to } },
        select: { itemId: true, movementType: true, quantity: true, totalValue: true, reasonCode: true, createdAt: true },
      }),
      this.prisma.stockMovement.aggregate({
        where: { ...siteWhere, reasonCode: { in: LOSS_CODES }, createdAt: { gte: p.previousFrom, lt: p.previousTo } },
        _sum: { totalValue: true },
      }),
      this.prisma.stockLot.findMany({
        where: { ...siteWhere, quantity: { gt: 0 }, expiryDate: { not: null } },
        select: { id: true, lotNumber: true, quantity: true, unitCost: true, expiryDate: true, item: { select: { name: true, unit: true } } },
        orderBy: { expiryDate: 'asc' },
      }),
      this.prisma.inventoryCount.findMany({ where: { ...siteWhere, status: 'OPEN' }, select: { id: true, createdAt: true, location: true } }),
      this.prisma.inventoryCount.findMany({
        where: { ...siteWhere, status: 'VALIDATED', validatedAt: { gte: p.from, lt: p.to } },
        select: { lines: { select: { expectedQuantity: true, countedQuantity: true, unitCost: true } } },
      }),
      this.prisma.stockMovement.groupBy({
        by: ['itemId'],
        where: { ...siteWhere, movementType: 'OUT', createdAt: { gte: new Date(+today - DORMANT_DAYS * DAY_MS) } },
        _max: { createdAt: true },
      }),
    ]);

    const stockValue = items.reduce((a, i) => a + num(i.currentQuantity) * num(i.unitPrice), 0);
    const outOfStock = items.filter((i) => num(i.currentQuantity) <= 0 && (num(i.minimumQuantity) > 0 || num(i.reorderPoint) > 0));
    const threshold = (i: (typeof items)[number]) => (i.reorderPoint !== null && i.reorderPoint !== undefined ? num(i.reorderPoint) : num(i.minimumQuantity));
    const belowMin = items.filter((i) => num(i.currentQuantity) > 0 && threshold(i) > 0 && num(i.currentQuantity) <= threshold(i));

    // Mouvements de la période
    let inValue = 0, outValue = 0, outQty = 0;
    const trend = new Map<string, { inValue: number; outValue: number; inCount: number; outCount: number }>();
    const losses = new Map<string, { count: number; value: number }>();
    let lossValue = 0;
    const outByItem = new Map<string, number>();
    for (const m of movements) {
      const v = num(m.totalValue);
      const k = bucketKey(m.createdAt, p.granularity);
      const t = trend.get(k) ?? { inValue: 0, outValue: 0, inCount: 0, outCount: 0 };
      if (m.movementType === 'IN') { inValue += v; t.inValue += v; t.inCount += 1; }
      if (m.movementType === 'OUT') {
        outValue += v; outQty += num(m.quantity); t.outValue += v; t.outCount += 1;
        outByItem.set(m.itemId, (outByItem.get(m.itemId) ?? 0) + v);
      }
      trend.set(k, t);
      if (m.reasonCode && LOSS_CODES.includes(m.reasonCode)) {
        lossValue += v;
        const l = losses.get(m.reasonCode) ?? { count: 0, value: 0 };
        l.count += 1; l.value += v;
        losses.set(m.reasonCode, l);
      }
    }
    const periodDays = Math.max(1, (+p.to - +p.from) / DAY_MS);
    const rotation = stockValue > 0 ? Math.round((outValue / stockValue) * 100) / 100 : null;
    const coverageDays = outQty > 0 ? Math.round((items.reduce((a, i) => a + num(i.currentQuantity), 0) / (outQty / periodDays)) * 10) / 10 : null;

    // Péremptions
    const daysToExpiry = (d: Date) => Math.floor((+startOfDay(d) - +today) / DAY_MS);
    const expired = lots.filter((l) => daysToExpiry(l.expiryDate as Date) < 0);
    const expiring = lots.filter((l) => { const d = daysToExpiry(l.expiryDate as Date); return d >= 0 && d <= EXPIRY_ALERT_DAYS; });
    const expiredValue = expired.reduce((a, l) => a + num(l.quantity) * num(l.unitCost), 0);

    // Écarts d'inventaire (valorisés)
    let gapValue = 0, gapLines = 0;
    for (const c of validatedCounts) {
      for (const l of c.lines) {
        if (l.countedQuantity === null) continue;
        const diff = num(l.countedQuantity) - num(l.expectedQuantity);
        if (diff !== 0) { gapLines += 1; gapValue += diff * num(l.unitCost); }
      }
    }

    // Articles dormants : du stock mais aucune sortie depuis 90 j
    const recentlyOut = new Set(lastOut.map((r) => r.itemId));
    const dormant = items.filter((i) => num(i.currentQuantity) > 0 && !recentlyOut.has(i.id));
    const dormantValue = dormant.reduce((a, i) => a + num(i.currentQuantity) * num(i.unitPrice), 0);

    // Valeur par catégorie et classement ABC
    const byCategory = new Map<string, number>();
    for (const i of items) {
      const c = i.category?.name ?? 'Sans catégorie';
      byCategory.set(c, (byCategory.get(c) ?? 0) + num(i.currentQuantity) * num(i.unitPrice));
    }
    const ranked = items.map((i) => ({ id: i.id, name: i.name, value: num(i.currentQuantity) * num(i.unitPrice) })).sort((a, b) => b.value - a.value);
    let cum = 0;
    const abc = ranked.slice(0, 15).map((r) => {
      cum += r.value;
      const share = stockValue ? (cum / stockValue) * 100 : 0;
      return { itemId: r.id, name: r.name, value: val(r.value), cumulativePercent: finance ? Math.round(share * 10) / 10 : null, class: share <= 80 ? 'A' : share <= 95 ? 'B' : 'C' };
    });

    const keys = bucketKeys(p.from, p.to, p.granularity);
    const lossStatus: Status = lossValue > 0 && stockValue > 0 && lossValue / stockValue > 0.02 ? 'critical' : lossValue > 0 ? 'warning' : 'ok';

    return {
      generatedAt: now.toISOString(),
      access: { role: actor.role, scope: finance ? 'full' : 'operational', siteId: siteId ?? null },
      period: periodInfo(p),
      kpis: [
        kpi('stock_value', 'Valeur du stock', 'GNF', val(stockValue), null, 'neutral', 'ok', { items: items.length }),
        kpi('out_of_stock', 'Articles en rupture', 'articles', outOfStock.length, null, 'down', outOfStock.length ? 'critical' : 'ok'),
        kpi('below_minimum', 'Articles sous le seuil', 'articles', belowMin.length, null, 'down', belowMin.length ? 'warning' : 'ok'),
        kpi('expiring', `Lots périmant sous ${EXPIRY_ALERT_DAYS} j`, 'lots', expiring.length, null, 'down', expiring.length ? 'warning' : 'ok'),
        kpi('expired', 'Lots périmés', 'lots', expired.length, null, 'down', expired.length ? 'critical' : 'ok', { value: val(expiredValue) }),
        kpi('rotation', 'Rotation du stock', 'x', rotation, null, 'up'),
        kpi('coverage', 'Couverture de stock', 'jours', coverageDays, null, 'neutral'),
        kpi('losses', 'Pertes, casse et rebuts', 'GNF', val(lossValue), val(num(prevLoss._sum.totalValue)), 'down', lossStatus),
        kpi('inventory_gap', "Écart d'inventaire", 'GNF', val(gapValue), null, 'neutral', gapLines ? 'warning' : 'ok', { lines: gapLines }),
        kpi('dormant', `Stock dormant (> ${DORMANT_DAYS} j)`, 'articles', dormant.length, null, 'down', dormant.length ? 'warning' : 'ok', { value: val(dormantValue) }),
      ],
      actions: ACTIONS.map((a) => ({ ...a, available: true, allowed: a.roles.includes(actor.role) })),
      worklists: {
        stockouts: [...outOfStock, ...belowMin].slice(0, 30).map((i) => ({ itemId: i.id, name: i.name, unit: i.unit, quantity: num(i.currentQuantity), threshold: threshold(i) })),
        expiringLots: [...expired, ...expiring].slice(0, 30).map((l) => ({ lotId: l.id, lotNumber: l.lotNumber, item: l.item.name, quantity: num(l.quantity), expiryDate: l.expiryDate, daysLeft: daysToExpiry(l.expiryDate as Date), expired: daysToExpiry(l.expiryDate as Date) < 0 })),
        dormantItems: dormant.slice(0, 20).map((i) => ({ itemId: i.id, name: i.name, quantity: num(i.currentQuantity), value: val(num(i.currentQuantity) * num(i.unitPrice)) })),
        openInventories: openCounts.map((c) => ({ countId: c.id, startedAt: c.createdAt, location: c.location, daysOpen: Math.floor((+now - +c.createdAt) / DAY_MS) })),
      },
      charts: {
        movementsTrend: keys.map((k) => ({ period: k, inValue: val(trend.get(k)?.inValue ?? 0), outValue: val(trend.get(k)?.outValue ?? 0), inCount: trend.get(k)?.inCount ?? 0, outCount: trend.get(k)?.outCount ?? 0 })),
        valueByCategory: finance ? [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ category: name, value: gnf(v), sharePercent: pct(v, stockValue) })) : null,
        abcAnalysis: abc,
        lossesByReason: LOSS_CODES.map((c) => ({ reason: c, label: LOSS_LABEL[c], count: losses.get(c)?.count ?? 0, value: val(losses.get(c)?.value ?? 0) })),
      },
    };
  }
}
