import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Actor } from '../common/actor';
import { num, pct, resolveSite } from './dashboard-common';

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

// Tableau de bord de pilotage : Directeur Général et Responsable logistique.
// Une seule lecture agrège flotte, missions, personnel, dépenses, stock, HSE et alertes.
@Injectable()
export class ExecutiveDashboardService {
  constructor(private prisma: PrismaService) {}

  async get(actor: Actor, requestedSite?: string) {
    const siteId = resolveSite(actor, requestedSite);
    const site = siteId ? { siteId } : {};
    const vSite = { deletedAt: null, ...site };
    const now = new Date();
    const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
    const day1 = new Date(day0); day1.setDate(day1.getDate() + 1);
    const month0 = new Date(day0.getFullYear(), day0.getMonth(), 1);
    const since6 = new Date(day0.getFullYear(), day0.getMonth() - 5, 1);
    const todayStr = day0.toISOString().slice(0, 10);

    const [vehicles, tripsToday, tripsInProgress, tripsPlanned, trips6, driversTotal, attToday, staffToday, staffTotal,
      fuelToday, maintToday, drvExpToday, expensesPending, fuelMonth, maintMonth, drvExpMonth,
      items, movements, hseOpen, hseAccidents, inspMonth, inspCompliant, alerts, running] = await Promise.all([
      this.prisma.vehicle.groupBy({ by: ['status'], where: vSite, _count: true }),
      this.prisma.trip.count({ where: { ...site, tripDate: { gte: day0, lt: day1 } } }),
      this.prisma.trip.count({ where: { ...site, status: 'IN_PROGRESS' } }),
      this.prisma.trip.count({ where: { ...site, status: 'PLANNED' } }),
      this.prisma.trip.findMany({ where: { ...site, tripDate: { gte: since6 } }, select: { tripDate: true, status: true, distance: true } }),
      this.prisma.driver.count({ where: { ...site, deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.driverAttendance.groupBy({ by: ['status'], where: { ...site, date: day0 }, _count: true }),
      this.prisma.staffReport.count({ where: { ...site, date: todayStr } }),
      this.prisma.user.count({ where: { ...site, deletedAt: null, status: 'ACTIVE', role: { name: { in: ['AGENT_HSE', 'GESTIONNAIRE_HSE', 'MAGASINIER', 'MECANICIEN', 'POINTEUR'] } } } }),
      this.prisma.fuelTransaction.aggregate({ where: { ...site, transactionDate: { gte: day0, lt: day1 } }, _sum: { totalCost: true } }),
      this.prisma.maintenance.aggregate({ where: { vehicle: vSite, maintenanceDate: { gte: day0, lt: day1 } }, _sum: { cost: true } }),
      this.prisma.driverExpense.aggregate({ where: { date: { gte: day0, lt: day1 }, status: { not: 'REJECTED' } }, _sum: { amount: true } }),
      this.prisma.driverExpense.count({ where: { status: 'PENDING' } }),
      this.prisma.fuelTransaction.aggregate({ where: { ...site, transactionDate: { gte: month0 } }, _sum: { totalCost: true } }),
      this.prisma.maintenance.aggregate({ where: { vehicle: vSite, maintenanceDate: { gte: month0 } }, _sum: { cost: true } }),
      this.prisma.driverExpense.aggregate({ where: { date: { gte: month0 }, status: { not: 'REJECTED' } }, _sum: { amount: true } }),
      this.prisma.inventoryItem.findMany({ where: site, select: { currentQuantity: true, minimumQuantity: true, unitPrice: true } }),
      this.prisma.stockMovement.findMany({ where: site, orderBy: { createdAt: 'desc' }, take: 6, include: { item: { select: { name: true } } } }),
      this.prisma.hseIncident.count({ where: { ...site, status: { not: 'CLOSED' } } }),
      this.prisma.hseIncident.count({ where: { ...site, type: 'ACCIDENT', occurredAt: { gte: month0 } } }),
      this.prisma.hseInspection.count({ where: { ...site, inspectedAt: { gte: month0 } } }),
      this.prisma.hseInspection.count({ where: { ...site, inspectedAt: { gte: month0 }, compliant: true } }),
      this.prisma.notification.findMany({ where: { isRead: false, ...(siteId ? { OR: [{ siteId }, { siteId: null }] } : {}) }, orderBy: { createdAt: 'desc' }, take: 6 }),
      this.prisma.trip.findMany({
        where: { ...site, status: 'IN_PROGRESS' }, orderBy: { startTime: 'desc' }, take: 8,
        select: { id: true, reference: true, destination: true, startTime: true, scheduledArrival: true, startLat: true, startLng: true,
          vehicle: { select: { internalNumber: true, registrationNumber: true } }, driver: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    const vc = (s: string) => vehicles.find((v) => v.status === s)?._count ?? 0;
    const vTotal = vehicles.reduce((a, v) => a + v._count, 0);
    const att = (s: string) => attToday.find((a) => a.status === s)?._count ?? 0;
    const present = att('PRESENT');
    const attTotal = attToday.reduce((a, x) => a + x._count, 0);

    const byMonth: Array<{ key: string; label: string; total: number; completed: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(day0.getFullYear(), day0.getMonth() - i, 1);
      byMonth.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], total: 0, completed: 0 });
    }
    for (const t of trips6) {
      const b = byMonth.find((m) => m.key === `${t.tripDate.getFullYear()}-${t.tripDate.getMonth()}`);
      if (b) { b.total++; if (t.status === 'COMPLETED') b.completed++; }
    }
    const cur = byMonth[5], prev = byMonth[4];

    const expToday = num(fuelToday._sum.totalCost) + num(maintToday._sum.cost) + num(drvExpToday._sum.amount);
    const expMonth = num(fuelMonth._sum.totalCost) + num(maintMonth._sum.cost) + num(drvExpMonth._sum.amount);
    const belowMin = items.filter((i) => num(i.currentQuantity) < num(i.minimumQuantity)).length;

    // Données validées uniquement : frais chauffeurs approuvés + carburant + maintenance
    const prev0 = new Date(month0.getFullYear(), month0.getMonth() - 1, 1);
    const [fuelPrev, maintPrev, drvPrev, drvApprovedMonth, openIncidents] = await Promise.all([
      this.prisma.fuelTransaction.aggregate({ where: { ...site, transactionDate: { gte: prev0, lt: month0 } }, _sum: { totalCost: true } }),
      this.prisma.maintenance.aggregate({ where: { vehicle: vSite, maintenanceDate: { gte: prev0, lt: month0 } }, _sum: { cost: true } }),
      this.prisma.driverExpense.aggregate({ where: { date: { gte: prev0, lt: month0 }, status: 'APPROVED' }, _sum: { amount: true } }),
      this.prisma.driverExpense.aggregate({ where: { date: { gte: month0 }, status: 'APPROVED' }, _sum: { amount: true } }),
      this.prisma.hseIncident.findMany({ where: { ...site, status: { not: 'CLOSED' } }, orderBy: { occurredAt: 'desc' }, take: 5, select: { type: true, severity: true, description: true, occurredAt: true } }),
    ]);
    const expPrev = num(fuelPrev._sum.totalCost) + num(maintPrev._sum.cost) + num(drvPrev._sum.amount);
    const expValidated = num(fuelMonth._sum.totalCost) + num(maintMonth._sum.cost) + num(drvApprovedMonth._sum.amount);
    const budgetAlerts: Array<{ title: string; message: string; severity: string }> = [];
    if (expPrev > 0 && expMonth > expPrev * 1.2) budgetAlerts.push({ title: 'Dépenses en hausse', message: `Les dépenses du mois dépassent de ${Math.round((expMonth / expPrev - 1) * 100)} % celles du mois dernier.`, severity: 'WARNING' });
    if (expensesPending > 0) budgetAlerts.push({ title: 'Dépenses en attente de validation', message: `${expensesPending} dépense(s) chauffeur ne sont pas encore validées.`, severity: 'INFO' });
    if (belowMin > 0) budgetAlerts.push({ title: 'Stock sous le seuil', message: `${belowMin} article(s) à réapprovisionner.`, severity: 'WARNING' });

    return {
      asOf: now.toISOString(),
      fleet: { total: vTotal, active: vc('AVAILABLE') + vc('ON_MISSION'), available: vc('AVAILABLE'), onMission: vc('ON_MISSION'), maintenance: vc('MAINTENANCE'), immobilized: vc('IMMOBILIZED') },
      missions: {
        today: tripsToday, inProgress: tripsInProgress, planned: tripsPlanned, monthTotal: cur.total, monthCompleted: cur.completed,
        completionRate: pct(cur.completed, cur.total), previousMonthTotal: prev.total, byMonth: byMonth.map(({ label, total, completed }) => ({ label, total, completed })),
        kmMonth: trips6.filter((t) => t.tripDate >= month0).reduce((s, t) => s + (t.distance ?? 0), 0),
        running: running.map((t) => ({ id: t.id, reference: t.reference, destination: t.destination, startTime: t.startTime, scheduledArrival: t.scheduledArrival,
          vehicle: t.vehicle.internalNumber, plate: t.vehicle.registrationNumber, driver: `${t.driver.firstName} ${t.driver.lastName}`, hasPosition: t.startLat != null })),
      },
      people: { drivers: driversTotal, present, absent: attTotal - present, attendanceRecorded: attTotal, staff: staffTotal, staffReportsToday: staffToday },
      expenses: { today: Math.round(expToday), month: Math.round(expMonth), fuelToday: Math.round(num(fuelToday._sum.totalCost)), maintenanceToday: Math.round(num(maintToday._sum.cost)), driversToday: Math.round(num(drvExpToday._sum.amount)), pendingApproval: expensesPending },
      stock: {
        items: items.length, belowMinimum: belowMin, value: Math.round(items.reduce((s, i) => s + num(i.currentQuantity) * num(i.unitPrice), 0)),
        recent: movements.map((m) => ({ at: m.createdAt, item: m.item.name, type: m.movementType, quantity: num(m.quantity), reason: m.reason })),
      },
      hse: { openIncidents: hseOpen, accidentsMonth: hseAccidents, inspectionsMonth: inspMonth, complianceRate: pct(inspCompliant, inspMonth) },
      safetyAlerts: openIncidents.map((i) => ({ title: `${i.type} — gravité ${i.severity}`, message: i.description, severity: i.severity === 'CRITICAL' || i.severity === 'HIGH' ? 'CRITICAL' : 'WARNING', at: i.occurredAt })),
      budgetAlerts,
      synthesis: { missionsCompleted: cur.completed, missionsTotal: cur.total, km: Math.round(trips6.filter((t) => t.tripDate >= month0).reduce((s, t) => s + (t.distance ?? 0), 0)), expensesValidated: Math.round(expValidated), expensesPreviousMonth: Math.round(expPrev), incidents: hseOpen, compliance: pct(inspCompliant, inspMonth) },
      alerts: alerts.map((a) => ({ id: a.id, title: a.title, message: a.message, severity: a.severity, at: a.createdAt })),
    };
  }
}
