import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export function dayStart(date?: string): Date {
  const s = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

// Fiche journalière (fiche de bord) : tout ce que le chauffeur a saisi dans la journée, calculé automatiquement
@Injectable()
export class DriverSheetService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async isSent(driverId: string, day: Date) {
    return !!(await this.prisma.driverDailyReport.findUnique({ where: { driverId_reportDate: { driverId, reportDate: day } } }));
  }

  async build(driverId: string, date?: string) {
    const day = dayStart(date);
    const next = new Date(+day + 86400000);
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new BadRequestException('Chauffeur introuvable.');
    const [trips, fuel, maint, rep, expenses] = await Promise.all([
      this.prisma.trip.findMany({ where: { driverId, startTime: { gte: day, lt: next } }, include: { vehicle: { select: { registrationNumber: true, brand: true, model: true, internalNumber: true } } }, orderBy: { startTime: 'asc' } }),
      this.prisma.fuelTransaction.findMany({ where: { driverId, transactionDate: { gte: day, lt: next } }, include: { vehicle: { select: { registrationNumber: true } } }, orderBy: { transactionDate: 'asc' } }),
      this.prisma.driverMaintenance.findMany({ where: { driverId, date: { gte: day, lt: next } }, orderBy: { date: 'asc' } }),
      this.prisma.driverDailyReport.findUnique({ where: { driverId_reportDate: { driverId, reportDate: day } } }),
      this.prisma.driverExpense.findMany({ where: { driverId, date: { gte: day, lt: next } }, orderBy: { date: 'asc' } }),
    ]);
    const km = trips.reduce((s, t) => s + n(t.distance), 0);
    const liters = fuel.reduce((s, f) => s + n(f.quantityLiters), 0);
    return {
      date: day.toISOString().slice(0, 10),
      day: DAYS[day.getUTCDay()],
      status: rep ? 'SENT' : 'DRAFT',
      sentAt: rep?.sentAt ?? null,
      driver: { id: driver.id, name: `${driver.firstName} ${driver.lastName}`, phone: driver.phone, activity: driver.activity },
      trips: trips.map((t) => ({
        id: t.id, status: t.status, plate: t.vehicle.registrationNumber, brand: [t.vehicle.brand, t.vehicle.model].filter(Boolean).join(' '),
        destination: t.destination, route: t.route, startFuelLiters: t.startFuelLiters, endFuelLiters: t.endFuelLiters, purpose: t.purpose, purposeType: t.purposeType, regions: t.regions, cargo: t.cargo, voyages: t.tripsCount,
        startTime: t.startTime, endTime: t.endTime, startMileage: t.startMileage, arrivalMileage: t.arrivalMileage, endMileage: t.endMileage, km: n(t.distance),
        preCondition: t.preCondition, preAnomalies: t.preAnomalies, delayReason: t.delayReason, maintenanceNeeded: t.maintenanceNeeded, maintenanceReason: t.maintenanceReason,
      })),
      fuel: fuel.map((f) => ({ time: f.transactionDate, plate: f.vehicle.registrationNumber, mileage: f.mileage, liters: n(f.quantityLiters), cost: n(f.totalCost), station: f.station, source: f.source, notes: f.observations })),
      maintenance: maint.map((m) => ({ id: m.id, date: m.date, nature: m.nature, detail: m.detail, mileage: m.mileage, cost: m.cost, nextServiceKm: m.nextServiceKm, observations: m.observations })),
      expenses: expenses.map((e) => ({ id: e.id, time: e.date, category: e.category, amount: e.amount, description: e.description, status: e.status, note: e.decisionNote })),
      totals: {
        km, liters: Math.round(liters * 100) / 100, fuelCost: fuel.reduce((s, f) => s + n(f.totalCost), 0), maintenanceCost: maint.reduce((s, m) => s + n(m.cost), 0),
        consumption: km >= 20 && liters > 0 ? Math.round((liters / km) * 1000) / 10 : null, voyages: trips.reduce((s, t) => s + n(t.tripsCount), 0),
      },
    };
  }

  // Envoi au responsable : la fiche est verrouillée, le chauffeur ne peut plus rien modifier pour ce jour
  async send(driverId: string, userId: string, date?: string) {
    const day = dayStart(date);
    if (await this.isSent(driverId, day)) throw new BadRequestException('Cette fiche a déjà été envoyée.');
    const open = await this.prisma.trip.findFirst({ where: { driverId, status: 'IN_PROGRESS', startTime: { gte: day, lt: new Date(+day + 86400000) } } });
    if (open) throw new BadRequestException("Une mission est encore en cours : déclarez l'arrêt du véhicule avant d'envoyer la fiche.");
    const sheet = await this.build(driverId, date);
    if (!sheet.trips.length && !sheet.fuel.length && !sheet.maintenance.length) throw new BadRequestException("Rien à envoyer : aucune saisie pour cette journée.");
    await this.prisma.driverDailyReport.create({ data: { driverId, reportDate: day, status: 'SENT', sentBy: userId } });
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    for (const roleName of ['GESTIONNAIRE_FLOTTE', 'ADMIN_LOGISTIQUE']) {
      await this.prisma.notification.create({
        data: {
          title: `Fiche journalière reçue — ${sheet.driver.name}`, severity: 'INFO', entity: 'DriverDailyReport', entityId: driverId, siteId: driver?.siteId, roleName,
          message: `${sheet.day} ${sheet.date} : ${sheet.totals.km} km, ${sheet.totals.liters} L (${sheet.totals.fuelCost} GNF)${sheet.maintenance.length ? `, ${sheet.maintenance.length} maintenance(s)` : ''}${sheet.totals.voyages ? `, ${sheet.totals.voyages} voyage(s)` : ''}.`,
        },
      }).catch(() => undefined);
    }
    await this.audit.log({ userId, action: 'CREATE', entity: 'DriverDailyReport', entityId: driverId, newValue: { date: sheet.date, km: sheet.totals.km } });
    return { ...sheet, status: 'SENT', sentAt: new Date() };
  }

  // Côté bureau : fiches du jour (envoyées ou en cours) de tous les chauffeurs du site
  // Dépenses déclarées par les chauffeurs : liste et décision du bureau
  async listExpenses(siteId: string | undefined, status?: string) {
    const where: any = { ...(status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? { status } : {}) };
    if (siteId) { const ds = await this.prisma.driver.findMany({ where: { siteId }, select: { id: true } }); where.driverId = { in: ds.map((d) => d.id) }; }
    const rows = await this.prisma.driverExpense.findMany({ where, orderBy: { date: 'desc' }, take: 200 });
    const drivers = await this.prisma.driver.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.driverId))] } }, select: { id: true, firstName: true, lastName: true } });
    const vehicles = await this.prisma.vehicle.findMany({ where: { id: { in: rows.map((r) => r.vehicleId).filter((x): x is string => !!x) } }, select: { id: true, registrationNumber: true } });
    return rows.map((r) => {
      const d = drivers.find((x) => x.id === r.driverId), v = vehicles.find((x) => x.id === r.vehicleId);
      return { id: r.id, date: r.date, driver: d ? `${d.firstName} ${d.lastName}` : '—', vehicle: v?.registrationNumber ?? null, category: r.category, amount: r.amount, description: r.description, receiptUrl: r.receiptUrl, status: r.status, decidedAt: r.decidedAt, note: r.decisionNote };
    });
  }

  async decideExpense(id: string, decision: string, note: string | undefined, actorId: string) {
    const e = await this.prisma.driverExpense.findUnique({ where: { id } });
    if (!e) throw new BadRequestException('Dépense introuvable.');
    if (e.status !== 'PENDING') throw new BadRequestException('Cette dépense a déjà été traitée.');
    if (decision === 'REJECTED' && !note?.trim()) throw new BadRequestException('Indiquez le motif du refus.');
    const updated = await this.prisma.driverExpense.update({ where: { id }, data: { status: decision, decidedBy: actorId, decidedAt: new Date(), decisionNote: note?.trim() || null } });
    if (decision === 'APPROVED') {
      await this.prisma.expense.create({ data: { vehicleId: e.vehicleId ?? undefined, category: 'OTHER', amount: e.amount, expenseDate: e.date, description: `Dépense chauffeur (${e.category})${e.description ? ' — ' + e.description : ''}` } });
    }
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'DriverExpense', entityId: id, newValue: { status: decision, note } });
    return updated;
  }

  // Tableau de bord bureau : un coup d'oeil sur chaque chauffeur du jour
  async board(siteId: string | undefined, date?: string) {
    const day = dayStart(date);
    const next = new Date(+day + 86400000);
    const drivers = await this.prisma.driver.findMany({ where: { deletedAt: null, status: 'ACTIVE', ...(siteId ? { siteId } : {}) }, orderBy: { lastName: 'asc' } });
    const ids = drivers.map((d) => d.id);
    const [vehicles, trips, fuel, maint, reports] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { assignedDriverId: { in: ids }, deletedAt: null } }),
      this.prisma.trip.findMany({ where: { driverId: { in: ids }, OR: [{ startTime: { gte: day, lt: next } }, { status: 'IN_PROGRESS' }] }, include: { vehicle: true }, orderBy: { startTime: 'asc' } }),
      this.prisma.fuelTransaction.findMany({ where: { driverId: { in: ids }, transactionDate: { gte: day, lt: next } } }),
      this.prisma.driverMaintenance.findMany({ where: { driverId: { in: ids }, date: { gte: day, lt: next } } }),
      this.prisma.driverDailyReport.findMany({ where: { driverId: { in: ids }, reportDate: day } }),
    ]);
    const now = Date.now();
    const rows = drivers.map((d) => {
      const veh = vehicles.find((v) => v.assignedDriverId === d.id);
      const dt = trips.filter((t) => t.driverId === d.id);
      const active = dt.find((t) => t.status === 'IN_PROGRESS');
      const df = fuel.filter((f) => f.driverId === d.id), dm = maint.filter((m) => m.driverId === d.id);
      const rep = reports.find((r) => r.driverId === d.id);
      const km = dt.reduce((a, t) => a + n(t.distance), 0);
      const liters = df.reduce((a, f) => a + n(f.quantityLiters), 0);
      const hasActivity = dt.length > 0 || df.length > 0 || dm.length > 0;
      const status = active ? 'EN_MISSION' : rep ? 'ENVOYEE' : hasActivity ? 'A_ENVOYER' : 'RIEN';
      const alerts: string[] = [];
      if (d.licenseExpiryDate) {
        const days = Math.ceil((+d.licenseExpiryDate - now) / 86400000);
        if (days < 0) alerts.push('Permis expiré'); else if (days <= 60) alerts.push(`Permis : expire dans ${days} j`);
      } else alerts.push('Permis non renseigné');
      if (!veh) alerts.push('Aucun véhicule affecté');
      else if (['IMMOBILIZED', 'MAINTENANCE', 'OUT_OF_SERVICE'].includes(veh.status)) alerts.push('Véhicule immobilisé');
      if (dm.some((m) => m.nature === 'ANOMALIE')) alerts.push('Anomalie signalée');
      return {
        id: d.id, name: `${d.firstName} ${d.lastName}`, phone: d.phone,
        vehicle: veh ? veh.registrationNumber : null, status,
        destination: active ? (active.destination ?? (active.regions || []).join(', ')) : null,
        tripsCount: dt.length, km, liters: Math.round(liters * 100) / 100, fuelCost: df.reduce((a, f) => a + n(f.totalCost), 0),
        sentAt: rep?.sentAt ?? null, alerts,
      };
    });
    const count = (st: string) => rows.filter((r) => r.status === st).length;
    return { date: day.toISOString().slice(0, 10), summary: { total: rows.length, enMission: count('EN_MISSION'), aEnvoyer: count('A_ENVOYER'), envoyees: count('ENVOYEE'), rien: count('RIEN') }, drivers: rows };
  }

  async listForDay(siteId: string | undefined, date?: string) {
    const day = dayStart(date);
    const next = new Date(+day + 86400000);
    const drivers = await this.prisma.driver.findMany({ where: { deletedAt: null, ...(siteId ? { siteId } : {}) }, select: { id: true } });
    const ids = drivers.map((d) => d.id);
    const [t, f, m, r] = await Promise.all([
      this.prisma.trip.findMany({ where: { driverId: { in: ids }, startTime: { gte: day, lt: next } }, select: { driverId: true }, distinct: ['driverId'] }),
      this.prisma.fuelTransaction.findMany({ where: { driverId: { in: ids }, transactionDate: { gte: day, lt: next } }, select: { driverId: true }, distinct: ['driverId'] }),
      this.prisma.driverMaintenance.findMany({ where: { driverId: { in: ids }, date: { gte: day, lt: next } }, select: { driverId: true }, distinct: ['driverId'] }),
      this.prisma.driverDailyReport.findMany({ where: { driverId: { in: ids }, reportDate: day } }),
    ]);
    const active = new Set<string>([...t, ...f, ...m, ...r].map((x: any) => x.driverId));
    const out: Awaited<ReturnType<DriverSheetService["build"]>>[] = [];
    for (const id of active) out.push(await this.build(id, date));
    return out.sort((a, b) => (a.status === b.status ? a.driver.name.localeCompare(b.driver.name) : a.status === 'SENT' ? -1 : 1));
  }
}
