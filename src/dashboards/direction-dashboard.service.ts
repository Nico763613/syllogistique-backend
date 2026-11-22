import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Actor } from '../common/actor';
import { num, resolveSite } from './dashboard-common';
import { bucketKey, bucketKeys, resolvePeriod, variation } from './dashboard-period';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

// Tableau de bord Direction Générale : lecture seule, données réelles uniquement, périmètre de l'entreprise.
// Aucune écriture, aucun nouveau champ : tout est calculé à partir des tables existantes.
@Injectable()
export class DirectionDashboardService {
  constructor(private prisma: PrismaService) {}

  async get(actor: Actor, q: DashboardQueryDto) {
    const siteId = resolveSite(actor, q.siteId);
    const site = siteId ? { siteId } : {};
    const vSite = { deletedAt: null, ...site };
    const p = resolvePeriod(q.period ?? 'month', q.from, q.to, q.granularity);
    const keys = bucketKeys(p.from, p.to, p.granularity);
    const zero = () => new Map<string, number>(keys.map((k) => [k, 0]));
    const dayStart = (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; })();

    const [vehicles, drivers, users, trips, tripsPrev, fuel, fuelPrev, maint, maintPrev, dexp, dexpPrev, reports, reportsNew, alerts, alertsCount] = await Promise.all([
      this.prisma.vehicle.groupBy({ by: ['vehicleType', 'status'], where: vSite, _count: true }),
      this.prisma.driver.count({ where: { ...site, deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { ...(siteId ? { siteId } : {}), deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.trip.findMany({ where: { ...site, tripDate: { gte: p.from, lt: p.to } }, select: { tripDate: true, status: true } }),
      this.prisma.trip.count({ where: { ...site, tripDate: { gte: p.previousFrom, lt: p.previousTo }, status: 'COMPLETED' } }),
      this.prisma.fuelTransaction.findMany({ where: { ...site, transactionDate: { gte: p.from, lt: p.to } }, select: { transactionDate: true, quantityLiters: true, totalCost: true, vehicle: { select: { vehicleType: true } } } }),
      this.prisma.fuelTransaction.aggregate({ where: { ...site, transactionDate: { gte: p.previousFrom, lt: p.previousTo } }, _sum: { totalCost: true, quantityLiters: true } }),
      this.prisma.maintenance.findMany({ where: { vehicle: vSite, maintenanceDate: { gte: p.from, lt: p.to } }, select: { maintenanceDate: true, cost: true } }),
      this.prisma.maintenance.aggregate({ where: { vehicle: vSite, maintenanceDate: { gte: p.previousFrom, lt: p.previousTo } }, _sum: { cost: true } }),
      this.prisma.driverExpense.findMany({ where: { date: { gte: p.from, lt: p.to }, status: { not: 'REJECTED' } }, select: { date: true, amount: true, category: true } }),
      this.prisma.driverExpense.aggregate({ where: { date: { gte: p.previousFrom, lt: p.previousTo }, status: { not: 'REJECTED' } }, _sum: { amount: true } }),
      this.prisma.staffReport.findMany({ where: site, orderBy: { sentAt: 'desc' }, take: 5, include: { user: { select: { firstName: true, lastName: true } } } }),
      this.prisma.staffReport.count({ where: { ...site, receivedAt: null, rejectedAt: null, sentAt: { gte: p.from, lt: p.to } } }),
      this.prisma.notification.findMany({ where: { isRead: false, ...(siteId ? { OR: [{ siteId }, { siteId: null }] } : {}) }, orderBy: { createdAt: 'desc' }, take: 4 }),
      this.prisma.notification.count({ where: { isRead: false, ...(siteId ? { OR: [{ siteId }, { siteId: null }] } : {}) } }),
    ]);

    const fleetOf = (type: string) => {
      const c = (s: string) => vehicles.filter((v) => v.vehicleType === type && v.status === s).reduce((a, v) => a + v._count, 0);
      const total = vehicles.filter((v) => v.vehicleType === type).reduce((a, v) => a + v._count, 0);
      return { total, available: c('AVAILABLE'), onMission: c('ON_MISSION'), maintenance: c('MAINTENANCE'), immobilized: c('IMMOBILIZED'), outOfService: c('OUT_OF_SERVICE') };
    };
    const trucks = fleetOf('TRUCK'), service = fleetOf('SERVICE_VEHICLE');
    const fleetTotal = trucks.total + service.total;
    const fleetAvail = trucks.available + service.available;
    const fleetMaint = trucks.maintenance + service.maintenance;

    // Séries
    const mTotal = zero(), mDone = zero();
    for (const t of trips) {
      const k = bucketKey(t.tripDate, p.granularity);
      if (mTotal.has(k)) { mTotal.set(k, mTotal.get(k)! + 1); if (t.status === 'COMPLETED') mDone.set(k, mDone.get(k)! + 1); }
    }
    const fLit = zero(), fCost = zero(), mCost = zero(), oCost = zero();
    let fuelTruck = 0, fuelService = 0;
    for (const f of fuel) {
      const k = bucketKey(f.transactionDate, p.granularity);
      if (fLit.has(k)) { fLit.set(k, fLit.get(k)! + num(f.quantityLiters)); fCost.set(k, fCost.get(k)! + num(f.totalCost)); }
      if (f.vehicle?.vehicleType === 'TRUCK') fuelTruck += num(f.quantityLiters); else fuelService += num(f.quantityLiters);
    }
    for (const m of maint) { const k = bucketKey(m.maintenanceDate, p.granularity); if (mCost.has(k)) mCost.set(k, mCost.get(k)! + num(m.cost)); }
    for (const e of dexp) { const k = bucketKey(e.date, p.granularity); if (oCost.has(k)) oCost.set(k, oCost.get(k)! + e.amount); }
    const sum = (m: Map<string, number>) => Math.round([...m.values()].reduce((a, b) => a + b, 0));
    const fuelTotal = sum(fCost), maintTotal = sum(mCost), otherTotal = sum(oCost);
    const total = fuelTotal + maintTotal + otherTotal;
    const prevTotal = Math.round(num(fuelPrev._sum.totalCost) + num(maintPrev._sum.cost) + num(dexpPrev._sum.amount));
    const completed = trips.filter((t) => t.status === 'COMPLETED').length;
    const inProgress = trips.filter((t) => t.status === 'IN_PROGRESS').length;
    const series = (m: Map<string, number>) => keys.map((k) => ({ key: k, value: Math.round(m.get(k) ?? 0) }));

    // Autres dépenses par catégorie (péages, frais de mission…)
    const cat: Record<string, number> = {};
    for (const e of dexp) cat[e.category] = (cat[e.category] ?? 0) + e.amount;

    const reportStatus = (r: any) => (r.rejectedAt ? 'REJECTED' : r.opsAt ? 'VALIDATED' : r.receivedAt ? 'READ' : 'NEW');

    return {
      asOf: new Date().toISOString(),
      period: { key: p.key, from: p.from.toISOString(), to: new Date(+p.to - 1).toISOString(), granularity: p.granularity },
      fleet: {
        trucks, serviceVehicles: service, total: fleetTotal, available: fleetAvail, maintenance: fleetMaint,
        availabilityPct: fleetTotal ? Math.round((fleetAvail / fleetTotal) * 100) : null,
        maintenancePct: fleetTotal ? Math.round((fleetMaint / fleetTotal) * 100) : null,
      },
      people: { activeAccounts: users, drivers },
      missions: { completed, inProgress, total: trips.length, previousCompleted: tripsPrev, variation: variation(completed, tripsPrev), series: keys.map((k) => ({ key: k, total: mTotal.get(k) ?? 0, completed: mDone.get(k) ?? 0 })) },
      expenses: {
        total, previousTotal: prevTotal, variation: variation(total, prevTotal),
        fuel: fuelTotal, maintenance: maintTotal, other: otherTotal,
        otherByCategory: Object.entries(cat).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
      },
      fuel: { liters: Math.round(sum(fLit)), litersTrucks: Math.round(fuelTruck), litersService: Math.round(fuelService), cost: fuelTotal, previousCost: Math.round(num(fuelPrev._sum.totalCost)), variation: variation(fuelTotal, num(fuelPrev._sum.totalCost)), series: series(fLit) },
      maintenance: { cost: maintTotal, interventions: maint.length, previousCost: Math.round(num(maintPrev._sum.cost)), variation: variation(maintTotal, num(maintPrev._sum.cost)), series: series(mCost) },
      reports: {
        newInPeriod: reportsNew,
        recent: reports.map((r) => ({ id: r.id, title: `Rapport ${r.roleName}`, author: `${r.user.firstName} ${r.user.lastName}`, role: r.roleName, date: r.date, status: reportStatus(r) })),
      },
      alerts: { unread: alertsCount, items: alerts.map((a) => ({ id: a.id, title: a.title, message: a.message, severity: a.severity, at: a.createdAt })) },
      today: dayStart.toISOString().slice(0, 10),
    };
  }
}
