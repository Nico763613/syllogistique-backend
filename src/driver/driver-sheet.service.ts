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
    const [trips, fuel, maint, rep] = await Promise.all([
      this.prisma.trip.findMany({ where: { driverId, startTime: { gte: day, lt: next } }, include: { vehicle: { select: { registrationNumber: true, brand: true, model: true, internalNumber: true } } }, orderBy: { startTime: 'asc' } }),
      this.prisma.fuelTransaction.findMany({ where: { driverId, transactionDate: { gte: day, lt: next } }, include: { vehicle: { select: { registrationNumber: true } } }, orderBy: { transactionDate: 'asc' } }),
      this.prisma.driverMaintenance.findMany({ where: { driverId, date: { gte: day, lt: next } }, orderBy: { date: 'asc' } }),
      this.prisma.driverDailyReport.findUnique({ where: { driverId_reportDate: { driverId, reportDate: day } } }),
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
        destination: t.destination, purpose: t.purpose, purposeType: t.purposeType, regions: t.regions, cargo: t.cargo, voyages: t.tripsCount,
        startTime: t.startTime, endTime: t.endTime, startMileage: t.startMileage, arrivalMileage: t.arrivalMileage, endMileage: t.endMileage, km: n(t.distance),
        preCondition: t.preCondition, preAnomalies: t.preAnomalies, delayReason: t.delayReason, maintenanceNeeded: t.maintenanceNeeded, maintenanceReason: t.maintenanceReason,
      })),
      fuel: fuel.map((f) => ({ time: f.transactionDate, plate: f.vehicle.registrationNumber, mileage: f.mileage, liters: n(f.quantityLiters), cost: n(f.totalCost), station: f.station })),
      maintenance: maint.map((m) => ({ id: m.id, date: m.date, nature: m.nature, detail: m.detail, mileage: m.mileage, cost: m.cost, observations: m.observations })),
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
    const out = [];
    for (const id of active) out.push(await this.build(id, date));
    return out.sort((a, b) => (a.status === b.status ? a.driver.name.localeCompare(b.driver.name) : a.status === 'SENT' ? -1 : 1));
  }
}
