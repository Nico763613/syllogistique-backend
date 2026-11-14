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
    const r = await this.prisma.driverDailyReport.findUnique({ where: { driverId_reportDate: { driverId, reportDate: day } } });
    return !!r && !r.rejectedAt;
  }

  // Étape de la chaîne : DRAFT → SUBMITTED (Soumis) → VERIFIED (Vérifié, Resp. logistique) → VALIDATED (Validé, Resp. opérations) ; REJECTED (Rejeté, à corriger)
  static step(rep: { rejectedAt: Date | null; opsAt: Date | null; processedAt: Date | null } | null | undefined) {
    if (!rep) return 'DRAFT';
    if (rep.rejectedAt) return 'REJECTED';
    if (rep.opsAt) return 'VALIDATED';
    if (rep.processedAt) return 'VERIFIED';
    return 'SUBMITTED';
  }

  async build(driverId: string, date?: string) {
    const day = dayStart(date);
    const next = new Date(+day + 86400000);
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new BadRequestException('Chauffeur introuvable.');
    const [trips, fuel, maint, rep, expenses, downs] = await Promise.all([
      this.prisma.trip.findMany({ where: { driverId, startTime: { gte: day, lt: next } }, include: { vehicle: { select: { registrationNumber: true, brand: true, model: true, internalNumber: true } } }, orderBy: { startTime: 'asc' } }),
      this.prisma.fuelTransaction.findMany({ where: { driverId, transactionDate: { gte: day, lt: next } }, include: { vehicle: { select: { registrationNumber: true } } }, orderBy: { transactionDate: 'asc' } }),
      this.prisma.driverMaintenance.findMany({ where: { driverId, date: { gte: day, lt: next } }, orderBy: { date: 'asc' } }),
      this.prisma.driverDailyReport.findUnique({ where: { driverId_reportDate: { driverId, reportDate: day } } }),
      this.prisma.driverExpense.findMany({ where: { driverId, date: { gte: day, lt: next } }, orderBy: { date: 'asc' } }),
      driver.userId ? this.prisma.vehicleDowntime.findMany({ where: { createdById: driver.userId, startedAt: { gte: day, lt: next } }, orderBy: { startedAt: 'asc' } }) : Promise.resolve([] as any[]),
    ]);
    const km = trips.reduce((s, t) => s + n(t.distance), 0);
    const liters = fuel.reduce((s, f) => s + n(f.quantityLiters), 0);
    return {
      date: day.toISOString().slice(0, 10),
      day: DAYS[day.getUTCDay()],
      status: rep && !rep.rejectedAt ? 'SENT' : 'DRAFT',
      step: DriverSheetService.step(rep),
      sentAt: rep?.sentAt ?? null, receivedAt: rep?.receivedAt ?? null, processedAt: rep?.processedAt ?? null, processNote: rep?.processNote ?? null,
      opsAt: rep?.opsAt ?? null, opsNote: rep?.opsNote ?? null, rejectedAt: rep?.rejectedAt ?? null, rejectNote: rep?.rejectNote ?? null,
      driver: { id: driver.id, name: `${driver.firstName} ${driver.lastName}`, phone: driver.phone, activity: driver.activity },
      trips: trips.map((t) => ({
        id: t.id, status: t.status, plate: t.vehicle.registrationNumber, brand: [t.vehicle.brand, t.vehicle.model].filter(Boolean).join(' '),
        reference: t.reference, destination: t.destination, route: t.route, startFuelLiters: t.startFuelLiters, endFuelLiters: t.endFuelLiters, purpose: t.purpose, purposeType: t.purposeType, regions: t.regions, cargo: t.cargo, voyages: t.tripsCount, tonnagePerTrip: t.tonnagePerTrip, operationSites: t.operationSites, products: t.products, loadPlaces: t.loadPlaces, unloadPlaces: t.unloadPlaces, pauseMileage: t.pauseMileage, pauseAt: t.pauseAt,
        startTime: t.startTime, endTime: t.endTime, startMileage: t.startMileage, arrivalMileage: t.arrivalMileage, endMileage: t.endMileage, km: n(t.distance),
        preCondition: t.preCondition, preAnomalies: t.preAnomalies, delayReason: t.delayReason, maintenanceNeeded: t.maintenanceNeeded, maintenanceReason: t.maintenanceReason,
      })),
      fuel: fuel.map((f) => ({ time: f.transactionDate, plate: f.vehicle.registrationNumber, mileage: f.mileage, liters: n(f.quantityLiters), cost: n(f.totalCost), station: f.station, source: f.source, notes: f.observations, receiptUrl: f.receiptImageUrl })),
      maintenance: maint.map((m) => ({ id: m.id, date: m.date, nature: m.nature, detail: m.detail, mileage: m.mileage, cost: m.cost, nextServiceKm: m.nextServiceKm, observations: m.observations, severity: m.severity, photoUrls: m.photoUrls })),
      breakdowns: downs.map((d) => ({ id: d.id, time: d.startedAt, reason: d.reason, severity: d.severity, photoUrls: d.photoUrls })),
      expenses: expenses.map((e) => ({ id: e.id, time: e.date, category: e.category, amount: e.amount, description: e.description, status: e.status, note: e.decisionNote, receiptUrl: e.receiptUrl, insured: e.insured, receiptCheckedAt: e.receiptCheckedAt })),
      totals: {
        expenses: expenses.reduce((s, e) => s + e.amount, 0),
        km, liters: Math.round(liters * 100) / 100, fuelCost: fuel.reduce((s, f) => s + n(f.totalCost), 0), maintenanceCost: maint.reduce((s, m) => s + n(m.cost), 0),
        consumption: km >= 20 && liters > 0 ? Math.round((liters / km) * 1000) / 10 : null, voyages: trips.reduce((s, t) => s + n(t.tripsCount), 0),
      },
    };
  }

  // Envoi au responsable : la fiche est verrouillée, le chauffeur ne peut plus rien modifier pour ce jour
  async processSheet(driverId: string, date: string | undefined, note: string | undefined, actorId: string) {
    const day = dayStart(date);
    const rep = await this.prisma.driverDailyReport.findUnique({ where: { driverId_reportDate: { driverId, reportDate: day } } });
    if (!rep || rep.rejectedAt) throw new BadRequestException("Cette fiche n'a pas été envoyée.");
    if (rep.processedAt) throw new BadRequestException('Cette fiche est déjà vérifiée.');
    const u = await this.prisma.driverDailyReport.update({ where: { id: rep.id }, data: { processedAt: new Date(), processedBy: actorId, processNote: note?.trim() || null, receivedAt: rep.receivedAt ?? new Date(), receivedBy: rep.receivedBy ?? actorId } });
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    await this.prisma.notification.create({ data: { title: `Fiche à valider — ${driver ? driver.firstName + ' ' + driver.lastName : ''}`, severity: 'INFO', entity: 'DriverDailyReport', entityId: driverId, siteId: driver?.siteId, roleName: 'RESPONSABLE_OPERATIONS', message: `Fiche du ${day.toISOString().slice(0, 10)} vérifiée par la logistique, en attente de votre validation.` } }).catch(() => undefined);
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'DriverDailyReport', entityId: rep.id, newValue: { verified: true, note } });
    return u;
  }

  // Le Responsable des opérations valide la fiche vérifiée : elle passe à la Comptabilité
  async validateSheet(driverId: string, date: string | undefined, note: string | undefined, actorId: string) {
    const day = dayStart(date);
    const rep = await this.prisma.driverDailyReport.findUnique({ where: { driverId_reportDate: { driverId, reportDate: day } } });
    if (!rep || rep.rejectedAt) throw new BadRequestException("Cette fiche n'est pas à valider.");
    if (!rep.processedAt) throw new BadRequestException("Cette fiche n'a pas encore été vérifiée par le Responsable logistique.");
    if (rep.opsAt) throw new BadRequestException('Cette fiche est déjà validée.');
    const u = await this.prisma.driverDailyReport.update({ where: { id: rep.id }, data: { opsAt: new Date(), opsBy: actorId, opsNote: note?.trim() || null } });
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    await this.prisma.notification.create({ data: { title: `Dépenses à traiter — ${driver ? driver.firstName + ' ' + driver.lastName : ''}`, severity: 'INFO', entity: 'DriverDailyReport', entityId: driverId, siteId: driver?.siteId, roleName: 'COMPTABLE', message: `Fiche du ${day.toISOString().slice(0, 10)} validée par les opérations : les dépenses sont à traiter.` } }).catch(() => undefined);
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'DriverDailyReport', entityId: rep.id, newValue: { validated: true, note } });
    return u;
  }

  // Renvoi au chauffeur pour correction (motif obligatoire) : la fiche est rouverte, la chaîne repart de zéro
  async rejectSheet(driverId: string, date: string | undefined, note: string | undefined, actorId: string) {
    const day = dayStart(date);
    if (!note || note.trim().length < 3) throw new BadRequestException('Indiquez le motif du renvoi.');
    const rep = await this.prisma.driverDailyReport.findUnique({ where: { driverId_reportDate: { driverId, reportDate: day } } });
    if (!rep || rep.rejectedAt) throw new BadRequestException("Cette fiche n'est pas envoyée.");
    if (rep.opsAt) throw new BadRequestException('Cette fiche est déjà validée par les opérations.');
    const u = await this.prisma.driverDailyReport.update({ where: { id: rep.id }, data: { rejectedAt: new Date(), rejectedBy: actorId, rejectNote: note.trim(), processedAt: null, processedBy: null, processNote: null } });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'DriverDailyReport', entityId: rep.id, newValue: { rejected: true, note } });
    return u;
  }

  // Fiches vérifiées en attente de validation par le Responsable des opérations (tous jours confondus)
  async pendingValidation(siteId: string | undefined) {
    const ds = await this.prisma.driver.findMany({ where: { deletedAt: null, ...(siteId ? { siteId } : {}) }, select: { id: true } });
    const reps = await this.prisma.driverDailyReport.findMany({ where: { driverId: { in: ds.map((d) => d.id) }, processedAt: { not: null }, opsAt: null, rejectedAt: null }, orderBy: { reportDate: 'asc' }, take: 50 });
    const out: Awaited<ReturnType<DriverSheetService['build']>>[] = [];
    for (const r of reps) out.push(await this.build(r.driverId, r.reportDate.toISOString().slice(0, 10)));
    return out;
  }

  // Le reçu papier est arrivé chez le responsable et il est conforme
  async checkReceipt(id: string, actorId: string) {
    const e = await this.prisma.driverExpense.findUnique({ where: { id } });
    if (!e) throw new BadRequestException('Dépense introuvable.');
    if (e.receiptCheckedAt) throw new BadRequestException('Reçu papier déjà contrôlé.');
    const u = await this.prisma.driverExpense.update({ where: { id }, data: { receiptCheckedAt: new Date(), receiptCheckedBy: actorId } });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'DriverExpense', entityId: id, newValue: { receiptChecked: true } });
    return u;
  }

  // Suivi des transmissions du chauffeur : fiches envoyées (reçue / traitée) et dépenses (validée / refusée)
  async transmissions(driverId: string) {
    const [reps, exps] = await Promise.all([
      this.prisma.driverDailyReport.findMany({ where: { driverId }, orderBy: { reportDate: 'desc' }, take: 30 }),
      this.prisma.driverExpense.findMany({ where: { driverId }, orderBy: { date: 'desc' }, take: 30 }),
    ]);
    return {
      sheets: reps.map((r) => ({ date: r.reportDate.toISOString().slice(0, 10), step: DriverSheetService.step(r), sentAt: r.sentAt, receivedAt: r.receivedAt, processedAt: r.processedAt, opsAt: r.opsAt, rejectedAt: r.rejectedAt, note: r.rejectNote ?? r.opsNote ?? r.processNote })),
      expenses: exps.map((e) => ({ id: e.id, date: e.date, category: e.category, amount: e.amount, status: e.status, decidedAt: e.decidedAt, note: e.decisionNote })),
    };
  }

  async send(driverId: string, userId: string, date?: string) {
    const day = dayStart(date);
    if (await this.isSent(driverId, day)) throw new BadRequestException('Cette fiche a déjà été envoyée.');
    const missing = await this.prisma.driverExpense.count({ where: { driverId, date: { gte: day, lt: new Date(+day + 86400000) }, OR: [{ receiptUrl: null }, { receiptUrl: '' }] } });
    if (missing) throw new BadRequestException(`${missing} dépense(s) sans photo de reçu : le reçu scanné est obligatoire avant l'envoi.`);
    const noFuelReceipt = await this.prisma.fuelTransaction.count({ where: { driverId, transactionDate: { gte: day, lt: new Date(+day + 86400000) }, source: 'STATION', totalCost: { gt: 0 }, OR: [{ receiptImageUrl: null }, { receiptImageUrl: '' }] } });
    if (noFuelReceipt) throw new BadRequestException(`${noFuelReceipt} plein(s) en station sans photo du reçu : le reçu scanné est obligatoire avant l'envoi.`);
    const noMaintReceipt = await this.prisma.driverMaintenance.count({ where: { driverId, date: { gte: day, lt: new Date(+day + 86400000) }, nature: { not: 'ANOMALIE' }, cost: { gt: 0 }, photoUrls: { isEmpty: true } } });
    if (noMaintReceipt) throw new BadRequestException(`${noMaintReceipt} entretien(s) avec un coût mais sans photo de la facture : le reçu scanné est obligatoire avant l'envoi.`);
    const open = await this.prisma.trip.findFirst({ where: { driverId, status: 'IN_PROGRESS', startTime: { gte: day, lt: new Date(+day + 86400000) } } });
    if (open) throw new BadRequestException("Une mission est encore en cours : déclarez l'arrêt du véhicule avant d'envoyer la fiche.");
    const sheet = await this.build(driverId, date);
    if (!sheet.trips.length && !sheet.fuel.length && !sheet.maintenance.length) throw new BadRequestException("Rien à envoyer : aucune saisie pour cette journée.");
    const prior = await this.prisma.driverDailyReport.findUnique({ where: { driverId_reportDate: { driverId, reportDate: day } } });
    if (prior) await this.prisma.driverDailyReport.update({ where: { id: prior.id }, data: { status: 'SENT', sentAt: new Date(), sentBy: userId, receivedAt: null, receivedBy: null, processedAt: null, processedBy: null, processNote: null, opsAt: null, opsBy: null, opsNote: null, rejectedAt: null, rejectedBy: null } });
    else await this.prisma.driverDailyReport.create({ data: { driverId, reportDate: day, status: 'SENT', sentBy: userId } });
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    for (const roleName of ['GESTIONNAIRE_FLOTTE', 'ADMIN_LOGISTIQUE']) { // vérification par la logistique, puis validation par les opérations
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
    const reps = await this.prisma.driverDailyReport.findMany({ where: { driverId: { in: drivers.map((d) => d.id) } } });
    return rows.map((r) => {
      const d = drivers.find((x) => x.id === r.driverId), v = vehicles.find((x) => x.id === r.vehicleId);
      const rep = reps.find((x) => x.driverId === r.driverId && x.reportDate.toISOString().slice(0, 10) === r.date.toISOString().slice(0, 10));
      return { sheetStep: DriverSheetService.step(rep), receiptCheckedAt: r.receiptCheckedAt, id: r.id, date: r.date, driver: d ? `${d.firstName} ${d.lastName}` : '—', vehicle: v?.registrationNumber ?? null, category: r.category, amount: r.amount, description: r.description, receiptUrl: r.receiptUrl, insured: r.insured, status: r.status, decidedAt: r.decidedAt, note: r.decisionNote };
    });
  }

  async decideExpense(id: string, decision: string, note: string | undefined, actorId: string) {
    const e = await this.prisma.driverExpense.findUnique({ where: { id } });
    if (!e) throw new BadRequestException('Dépense introuvable.');
    if (e.status !== 'PENDING') throw new BadRequestException('Cette dépense a déjà été traitée.');
    const rep = await this.prisma.driverDailyReport.findUnique({ where: { driverId_reportDate: { driverId: e.driverId, reportDate: dayStart(e.date.toISOString().slice(0, 10)) } } });
    if (DriverSheetService.step(rep) !== 'VALIDATED') throw new BadRequestException("La fiche de bord de ce jour n'a pas encore été validée par le Responsable des opérations.");
    if (decision === 'REJECTED' && !note?.trim()) throw new BadRequestException('Indiquez le motif du refus.');
    const updated = await this.prisma.driverExpense.update({ where: { id }, data: { status: decision, decidedBy: actorId, decidedAt: new Date(), decisionNote: note?.trim() || null } });
    if (decision === 'APPROVED') {
      await this.prisma.expense.create({ data: { vehicleId: e.vehicleId ?? undefined, category: 'OTHER', amount: e.amount, expenseDate: e.date, description: `Dépense chauffeur (${e.category})${e.description ? ' — ' + e.description : ''}` } });
    }
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'DriverExpense', entityId: id, newValue: { status: decision, note } });
    return updated;
  }

  // Historique des missions (bureau : tous les chauffeurs du site ; chauffeur : ses propres missions), filtres + pagination
  async missions(f: { kind?: string; siteId?: string; driverId?: string; vehicleId?: string; status?: string; from?: string; to?: string; q?: string; page?: number }, onlyDriverId?: string) {
    const take = 30, page = Math.max(1, Number(f.page) || 1);
    const where: any = {};
    if (onlyDriverId) where.driverId = onlyDriverId; else { if (f.siteId) where.siteId = f.siteId; if (f.driverId) where.driverId = f.driverId; }
    if (f.vehicleId) where.vehicleId = f.vehicleId;
    if (f.kind === 'TRUCK' || f.kind === 'SERVICE_VEHICLE') where.vehicle = { vehicleType: f.kind };
    if (f.status && ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(f.status)) where.status = f.status;
    if (f.from || f.to) where.startTime = { ...(f.from ? { gte: dayStart(f.from) } : {}), ...(f.to ? { lt: new Date(+dayStart(f.to) + 86400000) } : {}) };
    const q = (f.q || '').trim();
    if (q) where.OR = [{ reference: { contains: q, mode: 'insensitive' } }, { destination: { contains: q, mode: 'insensitive' } }, { purpose: { contains: q, mode: 'insensitive' } }];
    const [total, rows] = await Promise.all([
      this.prisma.trip.count({ where }),
      this.prisma.trip.findMany({ where, orderBy: { startTime: 'desc' }, skip: (page - 1) * take, take, include: { driver: { select: { firstName: true, lastName: true } }, vehicle: { select: { registrationNumber: true, vehicleType: true } } } }),
    ]);
    const fuel = rows.length ? await this.prisma.fuelTransaction.groupBy({ by: ['tripId'], where: { tripId: { in: rows.map((r) => r.id) } }, _sum: { quantityLiters: true, totalCost: true } }) : [];
    return {
      total, page, pages: Math.max(1, Math.ceil(total / take)),
      missions: rows.map((t) => {
        const fu = fuel.find((x) => x.tripId === t.id);
        return { id: t.id, reference: t.reference, status: t.status, startTime: t.startTime, endTime: t.endTime, driver: `${t.driver.firstName} ${t.driver.lastName}`, vehicle: t.vehicle.registrationNumber, vehicleId: t.vehicleId, kind: t.vehicle.vehicleType === 'TRUCK' ? 'TRUCK' : 'SERVICE_VEHICLE', tons: t.tripsCount && t.tonnagePerTrip ? Math.round(t.tripsCount * t.tonnagePerTrip * 10) / 10 : null, destination: t.destination, purpose: t.purpose, km: t.distance ?? null, liters: fu ? n(fu._sum.quantityLiters) : 0, fuelCost: fu ? n(fu._sum.totalCost) : 0 };
      }),
    };
  }

  // Chronologie complète d'une mission (bureau, ou chauffeur propriétaire de la mission)
  async timeline(tripId: string, onlyDriverId?: string) {
    const t = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { driver: true, vehicle: true } });
    if (!t || (onlyDriverId && t.driverId !== onlyDriverId)) throw new BadRequestException('Mission introuvable.');
    const [fuel, maint, exp, down, logs, rep] = await Promise.all([
      this.prisma.fuelTransaction.findMany({ where: { tripId } }),
      this.prisma.driverMaintenance.findMany({ where: { tripId } }),
      this.prisma.driverExpense.findMany({ where: { tripId } }),
      this.prisma.vehicleDowntime.findMany({ where: { tripId } }),
      this.prisma.tripLog.findMany({ where: { tripId, eventType: { in: ['INCIDENT', 'PAUSE', 'RESUME'] } } }),
      this.prisma.driverDailyReport.findUnique({ where: { driverId_reportDate: { driverId: t.driverId, reportDate: dayStart(t.tripDate.toISOString().slice(0, 10)) } } }),
    ]);
    const ev: { at: Date; type: string; title: string; detail?: string }[] = [];
    ev.push({ at: t.createdAt, type: 'CREATION', title: 'Mission enregistrée' });
    ev.push({ at: t.startTime, type: 'START', title: 'Départ', detail: `${t.startMileage} km${t.startFuelLiters != null ? ` · ${t.startFuelLiters} L dans le réservoir` : ''}${t.destination ? ` · vers ${t.destination}` : ''}${t.route ? ` (${t.route})` : ''}` });
    for (const f of fuel) ev.push({ at: f.transactionDate, type: 'FUEL', title: 'Plein de carburant', detail: `${n(f.quantityLiters)} L · ${new Intl.NumberFormat('fr-FR').format(n(f.totalCost))} GNF · ${f.source === 'VOUCHER' ? 'Bon' : f.source === 'TANK' ? 'Pompe / dépôt' : 'Station'}${f.station ? ' · ' + f.station : ''}` });
    for (const m of maint) ev.push({ at: m.date, type: 'MAINTENANCE', title: m.nature === 'ANOMALIE' ? 'Anomalie signalée' : 'Maintenance', detail: [m.detail, m.cost ? `${new Intl.NumberFormat('fr-FR').format(n(m.cost))} GNF` : ''].filter(Boolean).join(' · ') });
    for (const e of exp) ev.push({ at: e.date, type: 'EXPENSE', title: 'Dépense déclarée', detail: `${e.category} · ${new Intl.NumberFormat('fr-FR').format(e.amount)} GNF · ${e.status === 'APPROVED' ? 'validée' : e.status === 'REJECTED' ? 'refusée' : 'en attente'}${e.description ? ' · ' + e.description : ''}` });
    for (const d of down) ev.push({ at: d.startedAt, type: 'BREAKDOWN', title: 'Panne / immobilisation', detail: d.reason });
    for (const l of logs) ev.push({ at: l.occurredAt, type: l.eventType, title: l.eventType === 'INCIDENT' ? 'Incident' : l.eventType === 'PAUSE' ? 'Pause' : 'Reprise' });
    if (t.endTime) ev.push({ at: t.endTime, type: 'ARRIVE', title: 'Arrivée / retour', detail: `${t.endMileage ?? '—'} km${t.distance != null ? ` · ${t.distance} km parcourus` : ''}${t.endFuelLiters != null ? ` · ${t.endFuelLiters} L dans le réservoir` : ''}` });
    if (rep) ev.push({ at: rep.sentAt, type: 'SHEET_SENT', title: 'Fiche du jour envoyée à la hiérarchie' });
    ev.sort((a, b) => +a.at - +b.at);
    return { id: t.id, reference: t.reference, status: t.status, driver: `${t.driver.firstName} ${t.driver.lastName}`, vehicle: t.vehicle.registrationNumber, events: ev };
  }

  // Actualisation automatique du bureau : requête très légère, interrogée toutes les 30 s seulement quand l'écran est visible
  async changes(siteId: string | undefined, since?: string) {
    const now = new Date();
    const d = since && !Number.isNaN(+new Date(since)) ? new Date(since) : null;
    const sf = siteId ? { siteId } : {};
    const ids = siteId ? (await this.prisma.driver.findMany({ where: { siteId }, select: { id: true } })).map((x) => x.id) : null;
    const byDriver = ids ? { driverId: { in: ids } } : {};
    const [pending, unread] = await Promise.all([
      this.prisma.driverExpense.count({ where: { status: 'PENDING', ...byDriver } }),
      this.prisma.notification.count({ where: { isRead: false, ...sf } }),
    ]);
    if (!d) return { now, changed: false, pendingExpenses: pending, unreadAlerts: unread };
    const [t, f, m, e, r, dt, nt] = await Promise.all([
      this.prisma.trip.count({ where: { ...sf, updatedAt: { gt: d } } }),
      this.prisma.fuelTransaction.count({ where: { ...sf, createdAt: { gt: d } } }),
      this.prisma.driverMaintenance.count({ where: { ...byDriver, createdAt: { gt: d } } }),
      this.prisma.driverExpense.count({ where: { ...byDriver, OR: [{ createdAt: { gt: d } }, { decidedAt: { gt: d } }] } }),
      this.prisma.driverDailyReport.count({ where: { ...byDriver, OR: [{ sentAt: { gt: d } }, { processedAt: { gt: d } }] } }),
      this.prisma.vehicleDowntime.count({ where: { ...sf, OR: [{ startedAt: { gt: d } }, { endedAt: { gt: d } }] } }),
      this.prisma.notification.count({ where: { ...sf, createdAt: { gt: d } } }),
    ]);
    return { now, changed: t + f + m + e + r + dt + nt > 0, pendingExpenses: pending, unreadAlerts: unread };
  }

  // Tableau de bord bureau : un coup d'oeil sur chaque chauffeur du jour
  async board(siteId: string | undefined, date?: string) {
    const day = dayStart(date);
    const next = new Date(+day + 86400000);
    const drivers = await this.prisma.driver.findMany({ where: { deletedAt: null, status: 'ACTIVE', ...(siteId ? { siteId } : {}) }, orderBy: { lastName: 'asc' } });
    const ids = drivers.map((d) => d.id);
    const [vehicles, trips, fuel, maint, reports, attend] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { assignedDriverId: { in: ids }, deletedAt: null } }),
      this.prisma.trip.findMany({ where: { driverId: { in: ids }, OR: [{ startTime: { gte: day, lt: next } }, { status: 'IN_PROGRESS' }] }, include: { vehicle: true }, orderBy: { startTime: 'asc' } }),
      this.prisma.fuelTransaction.findMany({ where: { driverId: { in: ids }, transactionDate: { gte: day, lt: next } } }),
      this.prisma.driverMaintenance.findMany({ where: { driverId: { in: ids }, date: { gte: day, lt: next } } }),
      this.prisma.driverDailyReport.findMany({ where: { driverId: { in: ids }, reportDate: day } }),
      this.prisma.driverAttendance.findMany({ where: { driverId: { in: ids }, date: day } }),
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
      const att = attend.find((a) => a.driverId === d.id);
      const absent = att && att.status !== 'PRESENT' ? `${att.status}${att.absenceReason ? ' : ' + att.absenceReason : ''}` : null;
      if (absent) alerts.push('Absent — ' + absent);
      const loader = [...dt].reverse().find((t) => t.loaderName)?.loaderName ?? null;
      return {
        id: d.id, name: `${d.firstName} ${d.lastName}`, phone: d.phone,
        kind: veh ? (veh.vehicleType === 'TRUCK' ? 'TRUCK' : 'SERVICE_VEHICLE') : 'NONE', loader, absent,
        vehicle: veh ? veh.registrationNumber : null, status,
        destination: active ? (active.destination ?? (active.regions || []).join(', ')) : null,
        tripsCount: dt.length, km, liters: Math.round(liters * 100) / 100, fuelCost: df.reduce((a, f) => a + n(f.totalCost), 0),
        sentAt: rep?.sentAt ?? null, alerts,
      };
    });
    const count = (st: string) => rows.filter((r) => r.status === st).length;
    return { date: day.toISOString().slice(0, 10), summary: { byKind: { TRUCK: rows.filter((r) => r.kind === 'TRUCK').length, SERVICE_VEHICLE: rows.filter((r) => r.kind === 'SERVICE_VEHICLE').length, NONE: rows.filter((r) => r.kind === 'NONE').length }, absents: rows.filter((r) => r.absent).length, total: rows.length, enMission: count('EN_MISSION'), aEnvoyer: count('A_ENVOYER'), envoyees: count('ENVOYEE'), rien: count('RIEN') }, drivers: rows };
  }

  async listForDay(siteId: string | undefined, date?: string, actorId?: string) {
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
    // La consultation par le bureau vaut accusé de réception
    if (actorId && r.length) await this.prisma.driverDailyReport.updateMany({ where: { driverId: { in: ids }, reportDate: day, receivedAt: null }, data: { receivedAt: new Date(), receivedBy: actorId } });
    for (const id of active) out.push(await this.build(id, date));
    return out.sort((a, b) => (a.status === b.status ? a.driver.name.localeCompare(b.driver.name) : a.status === 'SENT' ? -1 : 1));
  }
}
