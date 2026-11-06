import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

// Historique complet par véhicule ou par chauffeur : missions, pleins, pannes, incidents + écarts de consommation
@Injectable()
export class DriverHistoryService {
  constructor(private prisma: PrismaService) {}

  async forVehicle(vehicleId: string) {
    const v = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!v) throw new NotFoundException('Véhicule introuvable.');
    const [trips, fuel, downtimes, incidents] = await Promise.all([
      this.prisma.trip.findMany({ where: { vehicleId }, orderBy: { startTime: 'desc' }, take: 100, include: { driver: { select: { firstName: true, lastName: true } } } }),
      this.prisma.fuelTransaction.findMany({ where: { vehicleId }, orderBy: { transactionDate: 'desc' }, take: 100 }),
      this.prisma.vehicleDowntime.findMany({ where: { vehicleId }, orderBy: { startedAt: 'desc' }, take: 100 }),
      this.prisma.hseIncident.findMany({ where: { vehicleId }, orderBy: { occurredAt: 'desc' }, take: 100 }),
    ]);
    return this.pack(
      { vehicle: `${v.internalNumber} — ${v.registrationNumber}`, status: v.status, mileage: v.currentMileage, referenceConsumption: v.referenceConsumption ? Number(v.referenceConsumption) : null },
      trips.map((t) => ({ ...t, who: `${t.driver.firstName} ${t.driver.lastName}` })), fuel, downtimes, incidents, v.referenceConsumption ? Number(v.referenceConsumption) : null,
    );
  }

  async forDriver(driverId: string) {
    const d = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!d) throw new NotFoundException('Chauffeur introuvable.');
    const [trips, fuel, downtimes] = await Promise.all([
      this.prisma.trip.findMany({ where: { driverId }, orderBy: { startTime: 'desc' }, take: 100, include: { vehicle: { select: { internalNumber: true } } } }),
      this.prisma.fuelTransaction.findMany({ where: { driverId }, orderBy: { transactionDate: 'desc' }, take: 100 }),
      this.prisma.vehicleDowntime.findMany({ where: { tripId: { in: (await this.prisma.trip.findMany({ where: { driverId }, select: { id: true }, take: 500 })).map((t) => t.id) } }, orderBy: { startedAt: 'desc' }, take: 100 }),
    ]);
    const incidents = await this.prisma.hseIncident.findMany({ where: { persons: { some: { driverId } } }, orderBy: { occurredAt: 'desc' }, take: 100 });
    return this.pack({ driver: `${d.firstName} ${d.lastName}` }, trips.map((t) => ({ ...t, who: t.vehicle.internalNumber })), fuel, downtimes, incidents, null);
  }

  private pack(header: Record<string, unknown>, trips: any[], fuel: any[], downtimes: any[], incidents: any[], ref: number | null) {
    const done = trips.filter((t) => t.status === 'COMPLETED');
    const km = done.reduce((s, t) => s + n(t.distance), 0);
    const liters = fuel.reduce((s, f) => s + n(f.quantityLiters), 0);
    const consumption = km >= 50 && liters > 0 ? Math.round((liters / km) * 1000) / 10 : null;
    const late = done.filter((t) => t.scheduledArrival && t.endTime && +t.endTime > +t.scheduledArrival + 15 * 60_000).length;
    return {
      ...header,
      summary: { missions: trips.length, completed: done.length, km, liters: Math.round(liters * 10) / 10, cost: fuel.reduce((s, f) => s + n(f.totalCost), 0), consumption, referenceConsumption: ref, gapPct: consumption !== null && ref ? Math.round((consumption / ref - 1) * 100) : null, breakdowns: downtimes.length, incidents: incidents.length, late },
      trips: trips.map((t) => ({ id: t.id, who: t.who, status: t.status, destination: t.destination, startTime: t.startTime, scheduledArrival: t.scheduledArrival, endTime: t.endTime, distance: t.distance, delayReason: t.delayReason, signed: !!t.signatureData })),
      fuel: fuel.map((f) => ({ id: f.id, date: f.transactionDate, liters: n(f.quantityLiters), cost: n(f.totalCost), station: f.station, receipt: f.receiptImageUrl })),
      downtimes: downtimes.map((x) => ({ id: x.id, startedAt: x.startedAt, endedAt: x.endedAt, reason: x.reason, severity: x.severity, photos: x.photoUrls })),
      incidents: incidents.map((i) => ({ id: i.id, reference: i.reference, occurredAt: i.occurredAt, severity: i.severity, description: i.description, photos: i.photoUrls })),
    };
  }
}
