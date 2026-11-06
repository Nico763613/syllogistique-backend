import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { currentFuelPrice } from '../common/fuel-price';
import { SyncOpDto } from './driver.dto';

type P = Record<string, any>;
const BLOCKED_VEHICLE = ['IMMOBILIZED', 'MAINTENANCE', 'OUT_OF_SERVICE'];
const LATE_TOLERANCE_MS = 15 * 60_000;
const CONSUMPTION_TOLERANCE = 1.15;

const str = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const geo = (v: unknown, lo: number, hi: number) => { const n = num(v); return n !== undefined && n >= lo && n <= hi ? n : undefined; };
const urls = (v: unknown): string[] => (Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && u.startsWith('/uploads/')).slice(0, 8) : []);
const when = (v: unknown): Date => {
  const d = typeof v === 'string' ? new Date(v) : new Date(NaN);
  const now = Date.now();
  return Number.isNaN(+d) || +d > now + 10 * 60_000 ? new Date(now) : d;
};

@Injectable()
export class DriverAppService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

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
    });
    return {
      driver: { id: driver.id, name: `${driver.firstName} ${driver.lastName}`, phone: driver.phone, siteId: driver.siteId },
      device: { id: device.id, model: device.model, activatedAt: device.activatedAt },
      vehicle: vehicleRow
        ? { id: vehicleRow.id, plate: vehicleRow.registrationNumber, number: vehicleRow.internalNumber, label: [vehicleRow.brand, vehicleRow.model].filter(Boolean).join(' '), status: vehicleRow.status, mileage: vehicleRow.currentMileage, capacity: vehicleRow.capacity, equipment: vehicleRow.observations, immobilized: !!downtime || BLOCKED_VEHICLE.includes(vehicleRow.status), downtimeReason: downtime?.reason ?? null }
        : null,
      activeTrip: active ? fmtTrip(active) : null,
      trips: trips.map(fmtTrip),
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
        let r: { duplicate?: boolean; [k: string]: unknown };
        if (op.type === 'start') r = await this.start(driver, userId, op, p);
        else if (op.type === 'arrive') r = await this.arrive(driver, userId, op, p);
        else if (op.type === 'fuel') r = await this.fuel(driver, userId, organizationId, op, p);
        else if (op.type === 'breakdown') r = await this.breakdown(driver, userId, op, p);
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
    const trip = await this.tripOf(driver.id, op.tripId);
    if (trip.status !== 'PLANNED') throw new BadRequestException(trip.status === 'IN_PROGRESS' ? 'Cette mission est déjà démarrée.' : 'Cette mission ne peut plus être démarrée.');
    const odometer = num(p.odometer);
    if (odometer === undefined || !Number.isInteger(odometer) || odometer < 0) throw new BadRequestException('Le kilométrage de départ est obligatoire.');
    const vehicle = await this.assertVehicleUsable(trip.vehicleId);
    if (odometer < vehicle.currentMileage) throw new BadRequestException(`Kilométrage de départ (${odometer}) inférieur au compteur enregistré (${vehicle.currentMileage}).`);
    const other = await this.prisma.trip.findFirst({ where: { driverId: driver.id, status: 'IN_PROGRESS', id: { not: trip.id } } });
    if (other) throw new BadRequestException('Vous avez déjà une mission en cours. Terminez-la avant d’en démarrer une autre.');
    const at = when(p.occurredAt);
    const lat = geo(p.lat, -90, 90), lng = geo(p.lng, -180, 180);
    await this.prisma.$transaction([
      this.prisma.trip.update({ where: { id: trip.id }, data: { status: 'IN_PROGRESS', startMileage: odometer, startTime: at, startLat: lat, startLng: lng } }),
      this.prisma.vehicle.update({ where: { id: trip.vehicleId }, data: { status: 'ON_MISSION', currentMileage: odometer } }),
      this.prisma.tripLog.create({ data: { tripId: trip.id, driverId: driver.id, eventType: 'START', latitude: lat, longitude: lng, mileage: odometer, syncedOffline: !!p.offline, clientOpId: op.clientOpId, occurredAt: at } }),
    ]);
    await this.audit.log({ userId, action: 'UPDATE', entity: 'Trip', entityId: trip.id, newValue: { status: 'IN_PROGRESS', odometer, lat, lng } });
    return { tripId: trip.id, status: 'IN_PROGRESS' };
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
    const distance = odometer - trip.startMileage;
    await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: trip.id },
        data: { status: 'COMPLETED', endTime: at, endMileage: odometer, distance, endLat: lat, endLng: lng, endCondition: condition, delayReason, recipientName: str(p.recipientName, 120), signatureData: signature, observations: [trip.observations, str(p.observations)].filter(Boolean).join(' | ') || undefined },
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
    if (!receipt || !receipt.startsWith('/uploads/')) throw new BadRequestException('La photo du reçu est obligatoire.');
    const declared = num(p.totalCost);
    const total = declared && declared > 0 ? declared : Number((liters * (await currentFuelPrice(this.prisma, organizationId))).toFixed(2));
    const price = Number((total / liters).toFixed(2));
    const odometer = num(p.odometer);
    const row = await this.prisma.fuelTransaction.create({
      data: {
        vehicleId, driverId: driver.id, siteId: vehicle.siteId, transactionDate: when(p.occurredAt), mileage: odometer !== undefined && Number.isInteger(odometer) ? odometer : vehicle.currentMileage,
        quantityLiters: liters, pricePerLiter: price, totalCost: total, station: str(p.station, 120), receiptImageUrl: receipt, observations: str(p.observations, 500), source: 'STATION', tripId: trip?.id, clientOpId: op.clientOpId,
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
}
