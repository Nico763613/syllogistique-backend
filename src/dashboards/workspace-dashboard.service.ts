import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Actor } from '../common/actor';
import { num, pct, resolveSite } from './dashboard-common';

// Espace de travail personnel de chaque métier : stock, HSE, atelier (mécanicien), pointage.
// Les données renvoyées dépendent du rôle de l'utilisateur connecté.
@Injectable()
export class WorkspaceDashboardService {
  constructor(private prisma: PrismaService) {}

  async get(actor: Actor, requestedSite?: string) {
    const siteId = resolveSite(actor, requestedSite);
    const site = siteId ? { siteId } : {};
    const day0 = new Date(); day0.setHours(0, 0, 0, 0);
    const day1 = new Date(day0); day1.setDate(day1.getDate() + 1);
    const month0 = new Date(day0.getFullYear(), day0.getMonth(), 1);
    const todayStr = day0.toISOString().slice(0, 10);
    const myReport = await this.prisma.staffReport.findUnique({ where: { userId_date: { userId: actor.userId, date: todayStr } }, select: { sentAt: true, receivedAt: true, opsAt: true, rejectedAt: true } });
    const base = { role: actor.role, myReport: myReport ? { sentAt: myReport.sentAt, receivedAt: myReport.receivedAt, opsAt: myReport.opsAt, rejectedAt: myReport.rejectedAt } : null };

    if (actor.role === 'MECANICIEN') return { ...base, ...(await this.mechanic(site, month0)) };
    if (actor.role === 'POINTEUR') return { ...base, ...(await this.pointer(site, day0)) };
    if (actor.role === 'AGENT_HSE' || actor.role === 'GESTIONNAIRE_HSE') return { ...base, ...(await this.hse(site, month0)) };
    return { ...base, ...(await this.store(site, day0, day1)) };
  }

  // Gestionnaire de stock : quantités uniquement (pas de valorisation)
  private async store(site: { siteId?: string }, day0: Date, day1: Date) {
    const [items, mv, recent] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where: site, select: { name: true, unit: true, currentQuantity: true, minimumQuantity: true } }),
      this.prisma.stockMovement.groupBy({ by: ['movementType'], where: { ...site, createdAt: { gte: day0, lt: day1 } }, _count: true }),
      this.prisma.stockMovement.findMany({ where: site, orderBy: { createdAt: 'desc' }, take: 10, include: { item: { select: { name: true } }, vehicle: { select: { internalNumber: true } } } }),
    ]);
    const c = (t: string) => mv.find((m) => m.movementType === t)?._count ?? 0;
    const low = items.filter((i) => num(i.currentQuantity) < num(i.minimumQuantity)).sort((a, b) => num(a.currentQuantity) - num(b.currentQuantity));
    return {
      kind: 'STORE',
      kpis: { items: items.length, entriesToday: c('IN') + c('RETURN'), exitsToday: c('OUT'), belowMinimum: low.length },
      alerts: low.slice(0, 8).map((i) => ({ name: i.name, unit: i.unit, quantity: num(i.currentQuantity), minimum: num(i.minimumQuantity) })),
      recent: recent.map((m) => ({ at: m.createdAt, item: m.item.name, type: m.movementType, quantity: num(m.quantity), vehicle: m.vehicle?.internalNumber ?? null, reason: m.reason })),
    };
  }

  private async hse(site: { siteId?: string }, month0: Date) {
    const [open, accidents, insp, ok, openList, inspList] = await Promise.all([
      this.prisma.hseIncident.count({ where: { ...site, status: { not: 'CLOSED' } } }),
      this.prisma.hseIncident.count({ where: { ...site, type: 'ACCIDENT', occurredAt: { gte: month0 } } }),
      this.prisma.hseInspection.count({ where: { ...site, inspectedAt: { gte: month0 } } }),
      this.prisma.hseInspection.count({ where: { ...site, inspectedAt: { gte: month0 }, compliant: true } }),
      this.prisma.hseIncident.findMany({ where: { ...site, status: { not: 'CLOSED' } }, orderBy: { occurredAt: 'desc' }, take: 6, select: { type: true, severity: true, description: true, occurredAt: true, status: true } }),
      this.prisma.hseInspection.findMany({ where: site, orderBy: { inspectedAt: 'desc' }, take: 6, select: { type: true, inspectedAt: true, compliant: true, score: true } }),
    ]);
    return {
      kind: 'HSE',
      kpis: { inspections: insp, openIncidents: open, accidents, compliance: pct(ok, insp) },
      incidents: openList.map((i) => ({ type: i.type, severity: i.severity, description: i.description, at: i.occurredAt, status: i.status })),
      inspections: inspList.map((i) => ({ type: i.type, at: i.inspectedAt, compliant: i.compliant, score: i.score === null ? null : num(i.score) })),
    };
  }

  private async mechanic(site: { siteId?: string }, month0: Date) {
    const vSite = { deletedAt: null, ...site };
    const [down, inProg, done, todo, recent, stopped] = await Promise.all([
      this.prisma.vehicle.count({ where: { ...vSite, status: { in: ['MAINTENANCE', 'IMMOBILIZED'] } } }),
      this.prisma.maintenance.count({ where: { vehicle: vSite, status: 'IN_PROGRESS' } }),
      this.prisma.maintenance.count({ where: { vehicle: vSite, status: 'COMPLETED', maintenanceDate: { gte: month0 } } }),
      this.prisma.maintenance.count({ where: { vehicle: vSite, status: { in: ['PLANNED', 'OVERDUE'] } } }),
      this.prisma.maintenance.findMany({ where: { vehicle: vSite }, orderBy: { maintenanceDate: 'desc' }, take: 8, include: { vehicle: { select: { internalNumber: true } }, maintenanceType: { select: { label: true } } } }),
      this.prisma.vehicle.findMany({ where: { ...vSite, status: { in: ['MAINTENANCE', 'IMMOBILIZED'] } }, take: 8, select: { internalNumber: true, registrationNumber: true, status: true } }),
    ]);
    return {
      kind: 'MECHANIC',
      kpis: { down, inProgress: inProg, doneMonth: done, todo },
      recent: recent.map((m) => ({ at: m.maintenanceDate, vehicle: m.vehicle.internalNumber, nature: m.maintenanceType.label, kind: m.kind, status: m.status })),
      stopped: stopped.map((v) => ({ vehicle: v.internalNumber, plate: v.registrationNumber, status: v.status })),
    };
  }

  private async pointer(site: { siteId?: string }, day0: Date) {
    const [drivers, att] = await Promise.all([
      this.prisma.driver.count({ where: { ...site, deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.driverAttendance.findMany({ where: { ...site, date: day0 }, include: { driver: { select: { firstName: true, lastName: true } } } }),
    ]);
    const present = att.filter((a) => a.status === 'PRESENT').length;
    const absent = att.filter((a) => a.status === 'ABSENT');
    return {
      kind: 'POINTER',
      kpis: { total: drivers, present, absent: absent.length, others: att.length - present - absent.length, remaining: Math.max(0, drivers - att.length) },
      absentees: absent.map((a) => ({ name: `${a.driver.firstName} ${a.driver.lastName}`, reason: a.absenceReason })),
    };
  }
}
