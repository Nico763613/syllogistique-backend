import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { currentFuelPrice } from '../common/fuel-price';
import { SyncOpDto } from './driver.dto';
import { DriverSheetService, dayStart } from './driver-sheet.service';

type P = Record<string, any>;
const BLOCKED_VEHICLE = ['IMMOBILIZED', 'MAINTENANCE', 'OUT_OF_SERVICE'];
const LATE_TOLERANCE_MS = 15 * 60_000;
const CONSUMPTION_TOLERANCE = 1.15;

const REGIONS = ['Conakry', 'Boké', 'Kindia', 'Mamou', 'Labé', 'Faranah', 'Kankan', "N'Zérékoré"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const geo = (v: unknown, lo: number, hi: number) => { const n = num(v); return n !== undefined && n >= lo && n <= hi ? n : undefined; };
const urls = (v: unknown): string[] => (Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && u.startsWith('/uploads/')).slice(0, 8) : []);
const when = (v: unknown): Date => {
  const d = typeof v === 'string' ? new Date(v) : new Date(NaN);
  const now = Date.now();
  return Number.isNaN(+d) || +d > now + 10 * 60_000 ? new Date(now) : d;
};

const tankLiters = (v: unknown): number | undefined => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) && n >= 0 && n <= 2000 ? Math.round(n * 10) / 10 : undefined; };

@Injectable()
export class DriverAppService {
  constructor(private prisma: PrismaService, private audit: AuditService, private sheets: DriverSheetService) {}

  private async driverOf(userId: string) {
    const d = await this.prisma.driver.findFirst({ where: { userId, deletedAt: null } });
    if (!d) throw new ForbiddenException("Ce compte n'est lié à aucune fiche chauffeur. Contactez le gestionnaire de flotte.");
    return d;
  }

  private async notify(a: { role: string; siteId?: string | null; title: string; message: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; entity: string; entityId: string }) {
    const roles = a.severity === 'CRITICAL' && a.role !== 'SUPER_ADMIN' ? [a.role, 'SUPER_ADMIN'] : [a.role];
    for (const roleName of roles) {
      await this.prisma.notification
        .create({ data: { title: a.title, message: a.message, severity: a.severity, entity: a.entity, entityId: a.entityId, siteId: a.siteId ?? undefined, roleName } })
        .catch(() => undefined);
    }
  }

  private async assertVehicleUsable(vehicleId: string) {
    const v = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!v || v.deletedAt) throw new NotFoundException('Véhicule introuvable.');
    const open = await this.prisma.vehicleDowntime.findFirst({ where: { vehicleId, endedAt: null } });
    if (BLOCKED_VEHICLE.includes(v.status) || open) {
      throw new BadRequestException(`Véhicule ${v.internalNumber} immobilisé : en attente de la levée de réserve de l'atelier.`);
    }
    return v;
  }

  // Profil du chauffeur : missions, véhicule, appareil
  async me(userId: string, device: { id: string; model?: string | null; activatedAt?: Date | null }) {
    const driver = await this.driverOf(userId);
    const orgUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    const fuelPrice = orgUser ? await currentFuelPrice(this.prisma, orgUser.organizationId) : 12000;
    const trips = await this.prisma.trip.findMany({
      where: { driverId: driver.id, OR: [{ status: { in: ['PLANNED', 'IN_PROGRESS'] } }, { status: 'COMPLETED', endTime: { gte: new Date(Date.now() - 3 * 86400000) } }] },
      include: { vehicle: true },
      orderBy: { startTime: 'asc' },
      take: 30,
    });
    const active = trips.find((t) => t.status === 'IN_PROGRESS') ?? null;
    const vehicleRow = active?.vehicle ?? (await this.prisma.vehicle.findFirst({ where: { assignedDriverId: driver.id, deletedAt: null } })) ?? trips[0]?.vehicle ?? null;
    const downtime = vehicleRow ? await this.prisma.vehicleDowntime.findFirst({ where: { vehicleId: vehicleRow.id, endedAt: null } }) : null;
    const fmtTrip = (t: (typeof trips)[number]) => ({
      id: t.id, status: t.status, destination: t.destination, purpose: t.purpose, passengerName: t.passengerName, observations: t.observations,
      startTime: t.startTime, scheduledArrival: t.scheduledArrival, endTime: t.endTime, startMileage: t.startMileage, endMileage: t.endMileage, distance: t.distance,
      vehicle: `${t.vehicle.internalNumber} — ${t.vehicle.registrationNumber}`, vehicleId: t.vehicleId,
      purposeType: t.purposeType, regions: t.regions, cargo: t.cargo, tripsCount: t.tripsCount, route: t.route,
    });
    return {
      driver: { id: driver.id, name: `${driver.firstName} ${driver.lastName}`, phone: driver.phone, siteId: driver.siteId, activity: driver.activity ?? vehicleRow?.vehicleType ?? null },
      device: { id: device.id, model: device.model, activatedAt: device.activatedAt },
      vehicle: vehicleRow
        ? { id: vehicleRow.id, plate: vehicleRow.registrationNumber, number: vehicleRow.internalNumber, brand: vehicleRow.brand, model: vehicleRow.model, type: vehicleRow.vehicleType, registrationType: vehicleRow.registrationType, itExpiryDate: vehicleRow.itExpiryDate, label: [vehicleRow.brand, vehicleRow.model].filter(Boolean).join(' '), status: vehicleRow.status, mileage: vehicleRow.currentMileage, capacity: vehicleRow.capacity, equipment: vehicleRow.observations, immobilized: !!downtime || BLOCKED_VEHICLE.includes(vehicleRow.status), downtimeReason: downtime?.reason ?? null }
        : null,
      activeTrip: active ? fmtTrip(active) : null,
      trips: trips.map(fmtTrip),
      fuelPrice,
      serverTime: new Date(),
    };
  }

  // Traitement idempotent d'un lot d'opérations (en ligne ou rejouées après une coupure réseau)
  async sync(userId: string, organizationId: string, ops: SyncOpDto[]) {
    const driver = await this.driverOf(userId);
    const results: { clientOpId: string; ok: boolean; duplicate?: boolean; error?: string; result?: unknown }[] = [];
    for (const op of ops) {
      try {
        const p = (op.payload ?? {}) as P;
        // Fiche du jour déjà envoyée : plus aucune modification possible
        if (await this.sheets.isSent(driver.id, dayStart(when(p.occurredAt).toISOString().slice(0, 10)))) throw new BadRequestException('La fiche de cette journée a déjà été envoyée au responsable : elle ne peut plus être modifiée.');
        let r: { duplicate?: boolean; [k: string]: unknown };
        if (op.type === 'start') r = await this.start(driver, userId, op, p);
        else if (op.type === 'arrive') r = await this.arrive(driver, userId, op, p);
        else if (op.type === 'fuel') r = await this.fuel(driver, userId, organizationId, op, p);
        else if (op.type === 'breakdown') r = await this.breakdown(driver, userId, op, p);
        else if (op.type === 'maintenance') r = await this.maintenance(driver, userId, op, p);
        else r = await this.incident(driver, userId, op, p);
        results.push({ clientOpId: op.clientOpId, ok: true, duplicate: r.duplicate, result: r });
      } catch (e: any) {
        const msg = e?.response?.message ?? e?.message ?? 'Erreur';
        results.push({ clientOpId: op.clientOpId, ok: false, error: Array.isArray(msg) ? msg.join(', ') : String(msg) });
      }
    }
    return { results };
  }

  private async tripOf(driverId: string, tripId?: string) {
    if (!tripId) throw new BadRequestException('Mission non précisée.');
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.driverId !== driverId) throw new NotFoundException('Mission introuvable pour ce chauffeur.');
    return trip;
  }

  private async start(driver: { id: string }, userId: string, op: SyncOpDto, p: P) {
    if (await this.prisma.tripLog.findUnique({ where: { clientOpId: op.clientOpId } })) return { duplicate: true };
    let trip = op.tripId ? await this.prisma.trip.findUnique({ where: { id: op.tripId } }) : null;
    if (trip && trip.driverId !== driver.id) throw new NotFoundException('Mission introuvable pour ce chauffeur.');
    let vehicleId = trip?.vehicleId;
    if (!trip) {
      // Mission ouverte par le chauffeur lui-même (journée de camion, déplacement de véhicule de service)
      if (!op.tripId || !UUID.test(op.tripId)) throw new BadRequestException('Identifiant de mission invalide.');
      const assigned = await this.prisma.vehicle.findFirst({ where: { assignedDriverId: driver.id, deletedAt: null } });
      if (!assigned) throw new BadRequestException("Aucun véhicule ne vous est affecté. Contactez le gestionnaire de flotte.");
      vehicleId = assigned.id;
    } else if (trip.status !== 'PLANNED') {
      throw new BadRequestException(trip.status === 'IN_PROGRESS' ? 'Cette mission est déjà démarrée.' : 'Cette mission ne peut plus être démarrée.');
    }
    const odometer = num(p.odometer);
    if (odometer === undefined || !Number.isInteger(odometer) || odometer < 0) throw new BadRequestException('Le kilométrage de départ est obligatoire.');
    const vehicle = await this.assertVehicleUsable(vehicleId as string);
    if (odometer < vehicle.currentMileage) throw new BadRequestException(`Kilométrage de départ (${odometer}) inférieur au compteur enregistré (${vehicle.currentMileage}).`);
    const other = await this.prisma.trip.findFirst({ where: { driverId: driver.id, status: 'IN_PROGRESS', id: { not: op.tripId ?? '' } } });
    if (other) throw new BadRequestException('Vous avez déjà une mission en cours. Terminez-la avant d’en démarrer une autre.');
    const at = when(p.occurredAt);
    const lat = geo(p.lat, -90, 90), lng = geo(p.lng, -180, 180);
    const purposeType = ['MISSION', 'AUTRE', 'TRANSPORT'].includes(p.purposeType) ? (p.purposeType as string) : trip?.purposeType ?? (vehicle.vehicleType === 'TRUCK' ? 'TRANSPORT' : 'MISSION');
    const regions = Array.isArray(p.regions) ? p.regions.filter((r: unknown) => typeof r === 'string' && REGIONS.includes(r)) : [];
    const destination = str(p.destination, 200) ?? trip?.destination ?? undefined;
    const cargo = str(p.cargo, 120);
    const preCondition = p.preCondition === 'ANOMALIE' ? 'ANOMALIE' : 'RAS';
    const preAnomalies = str(p.preAnomalies, 1000);
    if (preCondition === 'ANOMALIE' && !preAnomalies) throw new BadRequestException("Décrivez l'anomalie constatée avant le départ.");
    if (purposeType === 'MISSION' && vehicle.vehicleType === 'SERVICE_VEHICLE' && !regions.length && !destination) throw new BadRequestException('Indiquez la région (ou la destination) de la mission.');
    const fiche = { destination, route: str(p.route, 300), startFuelLiters: tankLiters(p.fuelLiters), purposeType, regions, cargo, purpose: str(p.purpose, 300) ?? trip?.purpose ?? undefined, preCondition, preAnomalies };
    const tripId = trip ? trip.id : (op.tripId as string);
    const logs = this.prisma.tripLog.create({ data: { tripId, driverId: driver.id, eventType: 'START', latitude: lat, longitude: lng, mileage: odometer, syncedOffline: !!p.offline, clientOpId: op.clientOpId, occurredAt: at } });
    const vehUp = this.prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: 'ON_MISSION', currentMileage: odometer } });
    if (trip) {
      await this.prisma.$transaction([this.prisma.trip.update({ where: { id: trip.id }, data: { ...fiche, status: 'IN_PROGRESS', startMileage: odometer, startTime: at, startLat: lat, startLng: lng } }), vehUp, logs]);
    } else {
      const day = new Date(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()));
      await this.prisma.$transaction([
        this.prisma.trip.create({ data: { id: tripId, vehicleId: vehicle.id, driverId: driver.id, siteId: vehicle.siteId, tripDate: day, startTime: at, startMileage: odometer, status: 'IN_PROGRESS', createdById: userId, startLat: lat, startLng: lng, ...fiche } }),
        vehUp, logs,
      ]);
    }
    const where = destination ?? (regions.length ? regions.join(', ') : '—');
    await this.notify({ role: 'GESTIONNAIRE_FLOTTE', siteId: vehicle.siteId, severity: 'INFO', entity: 'Trip', entityId: tripId, title: `Départ — ${vehicle.internalNumber}${vehicle.registrationType === 'IT' ? ' (IT)' : ''}`, message: `${vehicle.registrationNumber}${vehicle.registrationType === 'IT' ? ' [plaque IT]' : ''} → ${where}${cargo ? ` (${cargo})` : ''}, compteur ${odometer} km.` });
    if (preCondition === 'ANOMALIE') {
      await this.notify({ role: 'GESTIONNAIRE_FLOTTE', siteId: vehicle.siteId, severity: 'WARNING', entity: 'Vehicle', entityId: vehicle.id, title: `Anomalie avant départ — ${vehicle.internalNumber}`, message: (preAnomalies as string).slice(0, 200) });
    }
    await this.audit.log({ userId, action: 'UPDATE', entity: 'Trip', entityId: tripId, newValue: { status: 'IN_PROGRESS', odometer, lat, lng, purposeType, destination } });
    return { tripId, status: 'IN_PROGRESS' };
  }

  private async arrive(driver: { id: string }, userId: string, op: SyncOpDto, p: P) {
    if (await this.prisma.tripLog.findUnique({ where: { clientOpId: op.clientOpId } })) return { duplicate: true };
    const trip = await this.tripOf(driver.id, op.tripId);
    if (trip.status !== 'IN_PROGRESS') throw new BadRequestException('Cette mission n’est pas en cours.');
    const odometer = num(p.odometer);
    if (odometer === undefined || !Number.isInteger(odometer)) throw new BadRequestException('Le kilométrage d’arrivée est obligatoire.');
    if (odometer < trip.startMileage) throw new BadRequestException(`Kilométrage d’arrivée (${odometer}) inférieur au départ (${trip.startMileage}).`);
    const at = when(p.occurredAt);
    const lat = geo(p.lat, -90, 90), lng = geo(p.lng, -180, 180);
    const condition = ['RAS', 'DOMMAGE_MINEUR', 'DOMMAGE_MAJEUR', 'PANNE'].includes(p.endCondition) ? (p.endCondition as string) : 'RAS';
    const signature = typeof p.signatureData === 'string' && p.signatureData.startsWith('data:image/') && p.signatureData.length <= 60000 ? p.signatureData : undefined;
    const late = trip.scheduledArrival && +at > +trip.scheduledArrival + LATE_TOLERANCE_MS;
    const delayReason = str(p.delayReason, 300);
    const maintenanceNeeded = p.maintenanceNeeded === true;
    const maintenanceReason = str(p.maintenanceReason, 500);
    if (maintenanceNeeded && !maintenanceReason) throw new BadRequestException('Indiquez le motif de la maintenance (ex. crevaison de pneu).');
    const distance = odometer - trip.startMileage;
    await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: trip.id },
        data: { status: 'COMPLETED', endTime: at, endMileage: odometer, distance, endLat: lat, endLng: lng, endFuelLiters: tankLiters(p.fuelLiters), endCondition: condition, delayReason, arrivalMileage: num(p.arrivalMileage) !== undefined && Number.isInteger(num(p.arrivalMileage)) && (num(p.arrivalMileage) as number) >= trip.startMileage ? num(p.arrivalMileage) : undefined, recipientName: str(p.recipientName, 120), signatureData: signature, tripsCount: num(p.tripsCount) !== undefined && Number.isInteger(num(p.tripsCount)) && (num(p.tripsCount) as number) >= 0 && (num(p.tripsCount) as number) <= 99 ? num(p.tripsCount) : undefined, maintenanceNeeded, maintenanceReason, observations: [trip.observations, str(p.observations)].filter(Boolean).join(' | ') || undefined },
      }),
      this.prisma.vehicle.update({ where: { id: trip.vehicleId }, data: { currentMileage: odometer, status: condition === 'PANNE' || condition === 'DOMMAGE_MAJEUR' ? 'MAINTENANCE' : 'AVAILABLE' } }),
      this.prisma.tripLog.create({ data: { tripId: trip.id, driverId: driver.id, eventType: 'ARRIVE', latitude: lat, longitude: lng, mileage: odometer, syncedOffline: !!p.offline, clientOpId: op.clientOpId, occurredAt: at } }),
    ]);

    // Rapport de fin de mission : consommation réelle et écart avec la référence constructeur
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: trip.vehicleId } });
    const fuel = await this.prisma.fuelTransaction.aggregate({ where: { tripId: trip.id }, _sum: { quantityLiters: true } });
    const liters = Number(fuel._sum.quantityLiters ?? 0);
    const consumption = distance >= 20 && liters > 0 ? Math.round((liters / distance) * 1000) / 10 : null;
    const ref = vehicle?.referenceConsumption ? Number(vehicle.referenceConsumption) : null;
    const gapPct = consumption !== null && ref ? Math.round((consumption / ref - 1) * 100) : null;
    const label = `${vehicle?.internalNumber ?? ''} → ${trip.destination ?? 'destination'}`;
    await this.notify({
      role: 'GESTIONNAIRE_FLOTTE', siteId: trip.siteId, severity: 'INFO', entity: 'Trip', entityId: trip.id, title: 'Mission terminée',
      message: `${label} : ${distance} km${consumption !== null ? `, ${consumption} L/100 km` : ''}${late ? ', arrivée en retard' : ''}${condition !== 'RAS' ? `, état : ${condition}` : ''}.`,
    });
    if (maintenanceNeeded) {
      await this.notify({ role: 'GESTIONNAIRE_FLOTTE', siteId: trip.siteId, severity: 'WARNING', entity: 'Vehicle', entityId: trip.vehicleId, title: `Maintenance demandée — ${vehicle?.internalNumber ?? ''}`, message: (maintenanceReason as string).slice(0, 200) });
    }
    if (late) {
      await this.notify({ role: 'GESTIONNAIRE_FLOTTE', siteId: trip.siteId, severity: 'WARNING', entity: 'Trip', entityId: trip.id, title: 'Livraison arrivée en retard', message: `${label} : ${delayReason ?? 'motif non précisé'}.` });
    }
    if (gapPct !== null && consumption !== null && ref && consumption > ref * CONSUMPTION_TOLERANCE) {
      await this.notify({ role: 'GESTIONNAIRE_FLOTTE', siteId: trip.siteId, severity: 'WARNING', entity: 'Vehicle', entityId: trip.vehicleId, title: 'Écart de consommation', message: `${label} : ${consumption} L/100 km pour ${ref} de référence (+${gapPct} %).` });
    }
    await this.audit.log({ userId, action: 'UPDATE', entity: 'Trip', entityId: trip.id, newValue: { status: 'COMPLETED', odometer, distance, condition } });
    return { tripId: trip.id, status: 'COMPLETED', distance, consumption, gapPct };
  }

  private async fuel(driver: { id: string; siteId: string }, userId: string, organizationId: string, op: SyncOpDto, p: P) {
    if (await this.prisma.fuelTransaction.findUnique({ where: { clientOpId: op.clientOpId } })) return { duplicate: true };
    const trip = op.tripId ? await this.tripOf(driver.id, op.tripId) : null;
    const vehicleId = trip?.vehicleId ?? (await this.prisma.vehicle.findFirst({ where: { assignedDriverId: driver.id, deletedAt: null } }))?.id;
    if (!vehicleId) throw new BadRequestException('Aucun véhicule associé à cette déclaration.');
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Véhicule introuvable.');
    const liters = num(p.liters);
    if (!liters || liters <= 0 || liters > 2000) throw new BadRequestException('Quantité de carburant invalide.');
    const receipt = str(p.receiptImageUrl, 300);
    if (receipt && !receipt.startsWith('/uploads/')) throw new BadRequestException('Justificatif invalide.');
    const declared = num(p.totalCost);
    const total = declared && declared > 0 ? declared : Number((liters * (await currentFuelPrice(this.prisma, organizationId))).toFixed(2));
    const price = Number((total / liters).toFixed(2));
    const odometer = num(p.odometer);
    const row = await this.prisma.fuelTransaction.create({
      data: {
        vehicleId, driverId: driver.id, siteId: vehicle.siteId, transactionDate: when(p.occurredAt), mileage: odometer !== undefined && Number.isInteger(odometer) ? odometer : vehicle.currentMileage,
        quantityLiters: liters, pricePerLiter: price, totalCost: total, station: str(p.station, 120), receiptImageUrl: receipt ?? null, observations: [str(p.voucherNo, 40) ? `Bon n° ${str(p.voucherNo, 40)}` : '', str(p.observations, 500)].filter(Boolean).join(' | ') || undefined, source: ['STATION', 'TANK', 'VOUCHER'].includes(p.source) ? (p.source as string) : 'STATION', tripId: trip?.id, clientOpId: op.clientOpId,
      },
    });
    if (trip) {
      await this.prisma.tripLog.create({ data: { tripId: trip.id, driverId: driver.id, eventType: 'FUEL', latitude: geo(p.lat, -90, 90), longitude: geo(p.lng, -180, 180), mileage: row.mileage, syncedOffline: !!p.offline, occurredAt: row.transactionDate } }).catch(() => undefined);
    }
    await this.audit.log({ userId, action: 'CREATE', entity: 'FuelTransaction', entityId: row.id, newValue: { liters, total, station: p.station, tripId: trip?.id } });
    return { fuelId: row.id, totalCost: total };
  }

  private async breakdown(driver: { id: string; siteId: string }, userId: string, op: SyncOpDto, p: P) {
    if (await this.prisma.vehicleDowntime.findUnique({ where: { clientOpId: op.clientOpId } })) return { duplicate: true };
    const trip = op.tripId ? await this.tripOf(driver.id, op.tripId) : null;
    const vehicleId = trip?.vehicleId ?? (await this.prisma.vehicle.findFirst({ where: { assignedDriverId: driver.id, deletedAt: null } }))?.id;
    if (!vehicleId) throw new BadRequestException('Aucun véhicule associé à cette déclaration.');
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Véhicule introuvable.');
    const description = str(p.description, 1000);
    if (!description) throw new BadRequestException('La description de la panne est obligatoire.');
    const severity = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(p.severity) ? (p.severity as string) : 'MEDIUM';
    const at = when(p.occurredAt);
    const lat = geo(p.lat, -90, 90), lng = geo(p.lng, -180, 180);
    const open = await this.prisma.vehicleDowntime.findFirst({ where: { vehicleId, endedAt: null } });
    let id: string;
    if (open) {
      id = open.id; // déjà immobilisé : on ne duplique pas, on alerte quand même l'atelier
    } else {
      const d = await this.prisma.vehicleDowntime.create({
        data: { vehicleId, siteId: vehicle.siteId, category: 'PANNE', reason: description, startedAt: at, createdById: userId, severity, photoUrls: urls(p.photoUrls), latitude: lat, longitude: lng, tripId: trip?.id, clientOpId: op.clientOpId },
      });
      id = d.id;
      await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { status: 'IMMOBILIZED' } });
    }
    if (trip) await this.prisma.tripLog.create({ data: { tripId: trip.id, driverId: driver.id, eventType: 'BREAKDOWN', latitude: lat, longitude: lng, mileage: vehicle.currentMileage, syncedOffline: !!p.offline, occurredAt: at } }).catch(() => undefined);
    await this.notify({
      role: 'GESTIONNAIRE_FLOTTE', siteId: vehicle.siteId, severity: severity === 'HIGH' || severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING', entity: 'VehicleDowntime', entityId: id,
      title: `Panne déclarée — ${vehicle.internalNumber}`, message: `${description.slice(0, 160)}${lat !== undefined && lng !== undefined ? ` (GPS ${lat.toFixed(5)}, ${lng.toFixed(5)})` : ''}.`,
    });
    await this.audit.log({ userId, action: 'CREATE', entity: 'VehicleDowntime', entityId: id, newValue: { severity, vehicleId, tripId: trip?.id } });
    return { downtimeId: id, vehicleStatus: 'IMMOBILIZED' };
  }

  private async incident(driver: { id: string; siteId: string }, userId: string, op: SyncOpDto, p: P) {
    if (await this.prisma.hseIncident.findUnique({ where: { clientOpId: op.clientOpId } })) return { duplicate: true };
    const trip = op.tripId ? await this.tripOf(driver.id, op.tripId) : null;
    const description = str(p.description, 1000);
    if (!description) throw new BadRequestException('La description de l’incident est obligatoire.');
    const kind = ['ACCIDENT', 'POLICE_CONTROL', 'ROAD_EVENT', 'OTHER'].includes(p.kind) ? (p.kind as string) : 'OTHER';
    const severity = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(p.severity) ? (p.severity as string) : kind === 'ACCIDENT' ? 'HIGH' : 'LOW';
    const labels: Record<string, string> = { ACCIDENT: 'Accident', POLICE_CONTROL: 'Contrôle de police', ROAD_EVENT: 'Événement routier', OTHER: 'Incident' };
    const at = when(p.occurredAt);
    const lat = geo(p.lat, -90, 90), lng = geo(p.lng, -180, 180);
    const year = at.getFullYear();
    const n = await this.prisma.hseIncident.count({ where: { reference: { startsWith: `HSE-${year}-` } } });
    const vehicleId = trip?.vehicleId;
    const inc = await this.prisma.hseIncident.create({
      data: {
        siteId: driver.siteId, reference: `HSE-${year}-${String(n + 1).padStart(4, '0')}`, occurredAt: at, type: kind === 'ACCIDENT' ? 'ACCIDENT' : 'OTHER', severity,
        description: `[${labels[kind]}] ${description}`, zone: lat !== undefined && lng !== undefined ? `GPS ${lat.toFixed(5)}, ${lng.toFixed(5)}` : undefined, vehicleId, reportedBy: userId,
        latitude: lat, longitude: lng, photoUrls: urls(p.photoUrls), clientOpId: op.clientOpId, persons: { create: [{ driverId: driver.id }] },
      },
    });
    if (trip) await this.prisma.tripLog.create({ data: { tripId: trip.id, driverId: driver.id, eventType: 'INCIDENT', latitude: lat, longitude: lng, syncedOffline: !!p.offline, occurredAt: at } }).catch(() => undefined);
    const sev = severity === 'HIGH' || severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
    await this.notify({ role: 'GESTIONNAIRE_FLOTTE', siteId: driver.siteId, severity: sev, entity: 'HseIncident', entityId: inc.id, title: `${labels[kind]} déclaré par un chauffeur`, message: `${inc.reference} : ${description.slice(0, 160)}` });
    if (sev === 'CRITICAL') await this.notify({ role: 'GESTIONNAIRE_HSE', siteId: driver.siteId, severity: 'CRITICAL', entity: 'HseIncident', entityId: inc.id, title: `${labels[kind]} grave`, message: `${inc.reference} : ${description.slice(0, 160)}` });
    await this.audit.log({ userId, action: 'CREATE', entity: 'HseIncident', entityId: inc.id, newValue: { kind, severity, tripId: trip?.id } });
    return { incidentId: inc.id, reference: inc.reference };
  }

  // Mise à jour du profil : le téléphone est modifiable (nom et véhicule restent ceux du bureau)
  async updateProfile(userId: string, phone: string) {
    const driver = await this.driverOf(userId);
    const clean = phone.trim();
    await this.prisma.driver.update({ where: { id: driver.id }, data: { phone: clean } });
    await this.prisma.user.update({ where: { id: userId }, data: { phone: clean } });
    await this.audit.log({ userId, action: 'UPDATE', entity: 'Driver', entityId: driver.id, newValue: { phone: clean } });
    return { phone: clean };
  }

  // Véhicules du site que le chauffeur peut prendre en charge (remplacement)
  async availableVehicles(userId: string) {
    const driver = await this.driverOf(userId);
    const vehicles = await this.prisma.vehicle.findMany({
      where: { siteId: driver.siteId, deletedAt: null, status: { in: ['AVAILABLE'] } },
      include: { assignedDriver: { select: { firstName: true, lastName: true } } },
      orderBy: { internalNumber: 'asc' },
    });
    return vehicles.map((v) => ({
      id: v.id, number: v.internalNumber, plate: v.registrationNumber, label: [v.brand, v.model].filter(Boolean).join(' '),
      type: v.vehicleType, currentDriver: v.assignedDriver ? `${v.assignedDriver.firstName} ${v.assignedDriver.lastName}` : null, mine: v.assignedDriverId === driver.id,
    }));
  }

  // Remplacement : le nouveau chauffeur prend le véhicule (maladie, congé…), ses informations remplacent celles de l'ancien ;
  // le gestionnaire de flotte est prévenu, les missions planifiées du véhicule passent au remplaçant.
  async takeover(userId: string, vehicleId: string, reason: string, note?: string) {
    const driver = await this.driverOf(userId);
    const v = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, include: { assignedDriver: true } });
    if (!v || v.deletedAt || v.siteId !== driver.siteId) throw new NotFoundException('Véhicule introuvable.');
    if (v.assignedDriverId === driver.id) throw new BadRequestException('Ce véhicule vous est déjà affecté.');
    const running = await this.prisma.trip.findFirst({ where: { vehicleId, status: 'IN_PROGRESS' } });
    if (running) throw new BadRequestException('Ce véhicule est en mission : le remplacement est possible après son arrêt.');
    const mine = await this.prisma.trip.findFirst({ where: { driverId: driver.id, status: 'IN_PROGRESS' } });
    if (mine) throw new BadRequestException('Terminez votre mission en cours avant de changer de véhicule.');
    const previous = v.assignedDriver;
    await this.prisma.$transaction([
      this.prisma.vehicle.updateMany({ where: { assignedDriverId: driver.id, id: { not: vehicleId } }, data: { assignedDriverId: null } }),
      this.prisma.vehicle.update({ where: { id: vehicleId }, data: { assignedDriverId: driver.id } }),
      this.prisma.trip.updateMany({ where: { vehicleId, status: 'PLANNED', ...(previous ? { driverId: previous.id } : {}) }, data: { driverId: driver.id } }),
    ]);
    const labels: Record<string, string> = { MALADIE: 'maladie', CONGE: 'congé', AUTRE: 'autre motif' };
    const msg = `${driver.firstName} ${driver.lastName} remplace ${previous ? previous.firstName + ' ' + previous.lastName : 'aucun chauffeur'} sur ${v.registrationNumber} (${labels[reason]})${note ? ' : ' + note : ''}.`;
    await this.notify({ role: 'GESTIONNAIRE_FLOTTE', siteId: v.siteId, severity: 'WARNING', entity: 'Vehicle', entityId: v.id, title: `Remplacement de chauffeur — ${v.internalNumber}`, message: msg });
    await this.audit.log({ userId, action: 'UPDATE', entity: 'Vehicle', entityId: v.id, oldValue: { assignedDriverId: v.assignedDriverId }, newValue: { assignedDriverId: driver.id }, reason: `Remplacement (${reason})${note ? ' : ' + note : ''}` });
    return { vehicleId: v.id, plate: v.registrationNumber };
  }

  async sheet(userId: string, date?: string) {
    const driver = await this.driverOf(userId);
    return this.sheets.build(driver.id, date);
  }

  async sendSheet(userId: string, date: string) {
    const driver = await this.driverOf(userId);
    return this.sheets.send(driver.id, userId, date);
  }

  // Maintenance effectuée : pneus, vidange (filtres, huile), freins… avec compteur, date et coût en GNF
  private async maintenance(driver: { id: string; siteId: string }, userId: string, op: SyncOpDto, p: P) {
    if (await this.prisma.driverMaintenance.findUnique({ where: { clientOpId: op.clientOpId } })) return { duplicate: true };
    const trip = op.tripId ? await this.tripOf(driver.id, op.tripId) : null;
    const vehicleId = trip?.vehicleId ?? (await this.prisma.vehicle.findFirst({ where: { assignedDriverId: driver.id, deletedAt: null } }))?.id;
    if (!vehicleId) throw new BadRequestException('Aucun véhicule associé à cette déclaration.');
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Véhicule introuvable.');
    const nature = ['PIECES', 'PNEUS', 'VIDANGE', 'FILTRE', 'HUILE', 'FREINS', 'BATTERIE', 'ELECTRICITE', 'ANOMALIE', 'AUTRE'].includes(p.nature) ? (p.nature as string) : 'AUTRE';
    const detail = str(p.detail, 500);
    if ((nature === 'AUTRE' || nature === 'ANOMALIE' || nature === 'PIECES') && !detail) throw new BadRequestException('Précisez la nature de la maintenance.');
    const mileage = num(p.mileage);
    const cost = num(p.cost);
    if (cost !== undefined && (cost < 0 || !Number.isFinite(cost))) throw new BadRequestException('Coût invalide.');
    const row = await this.prisma.driverMaintenance.create({
      data: { driverId: driver.id, vehicleId, tripId: trip?.id, date: when(p.occurredAt), nature, detail, mileage: mileage !== undefined && Number.isInteger(mileage) ? mileage : vehicle.currentMileage, cost: cost !== undefined ? Math.round(cost) : undefined, nextServiceKm: num(p.nextServiceKm) !== undefined && Number.isInteger(num(p.nextServiceKm)) && (num(p.nextServiceKm) as number) > 0 ? num(p.nextServiceKm) : undefined, observations: str(p.observations, 500), clientOpId: op.clientOpId },
    });
    const labels: Record<string, string> = { PIECES: 'Pièces / entretien', PNEUS: 'Pneus', VIDANGE: 'Vidange complète', FILTRE: 'Filtre', HUILE: 'Huile', ANOMALIE: 'Anomalie signalée', FREINS: 'Freins', BATTERIE: 'Batterie', ELECTRICITE: 'Électricité', AUTRE: 'Autre' };
    await this.notify({ role: 'GESTIONNAIRE_FLOTTE', siteId: vehicle.siteId, severity: nature === 'ANOMALIE' ? 'WARNING' : 'INFO', entity: 'Vehicle', entityId: vehicle.id, title: `${nature === 'ANOMALIE' ? 'Anomalie signalée' : 'Maintenance déclarée'} — ${vehicle.registrationNumber}`, message: `${labels[nature]}${detail ? ' (' + detail + ')' : ''}${row.mileage ? ', ' + row.mileage + ' km' : ''}${row.cost ? ', ' + row.cost + ' GNF' : ''}${row.nextServiceKm ? ', prochaine vidange à ' + row.nextServiceKm + ' km' : ''}.` });
    await this.audit.log({ userId, action: 'CREATE', entity: 'DriverMaintenance', entityId: row.id, newValue: { nature, detail, cost: row.cost } });
    return { maintenanceId: row.id };
  }
}
