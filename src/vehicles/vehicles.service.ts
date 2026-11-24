import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVehicleDto, UpdateVehicleDto } from './dto/vehicle.dto';
import { assignmentHistory, recordAssignment, releaseOtherVehicles } from './assignments';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Séparation stricte : un chauffeur de camion ne peut être affecté qu'à un camion, un chauffeur de véhicule de service qu'à un véhicule de service
  private async checkDriverKind(driverId: string | undefined | null, vehicleType: string | undefined | null) {
    if (!driverId || !vehicleType) return;
    const d = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { firstName: true, lastName: true, activity: true } });
    if (!d) throw new NotFoundException('Chauffeur introuvable.');
    if (d.activity && d.activity !== vehicleType) {
      throw new BadRequestException(`${d.firstName} ${d.lastName} est un chauffeur de ${d.activity === 'TRUCK' ? 'camion' : 'véhicule de service'} : il ne peut pas être affecté à un ${vehicleType === 'TRUCK' ? 'camion' : 'véhicule de service'}.`);
    }
  }

  async create(dto: CreateVehicleDto, actorId: string) {
    await this.checkDriverKind(dto.assignedDriverId, (dto as any).vehicleType);
    const existing = await this.prisma.vehicle.findFirst({
      where: { siteId: dto.siteId, registrationNumber: dto.registrationNumber },
    });
    if (existing) throw new ConflictException('Cette plaque est déjà enregistrée sur ce site.');

    const vehicle = await this.prisma.vehicle.create({ data: dto });
    if (dto.assignedDriverId) {
      await releaseOtherVehicles(this.prisma, dto.assignedDriverId, vehicle.id, actorId);
      await recordAssignment(this.prisma, { vehicleId: vehicle.id, newDriverId: dto.assignedDriverId, by: actorId, source: 'MANUEL' });
    }
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Vehicle', entityId: vehicle.id, newValue: dto });
    return vehicle;
  }

  async findAll(params: { siteId?: string; vehicleType?: VehicleType; status?: string }) {
    const rows = await this.prisma.vehicle.findMany({
      where: {
        deletedAt: null,
        ...(params.siteId ? { siteId: params.siteId } : {}),
        ...(params.vehicleType ? { vehicleType: params.vehicleType } : {}),
        ...(params.status ? { status: params.status as any } : {}),
      },
      include: {
        assignedDriver: { select: { id: true, firstName: true, lastName: true, phone: true, licenseNumber: true } },
        documents: { where: { type: 'ASSURANCE' }, select: { id: true, expiryDate: true, fileUrl: true } },
      },
      orderBy: { internalNumber: 'asc' },
    });
    // Assurance : une seule source (les documents du véhicule), reprise ici automatiquement
    const now = Date.now();
    return rows.map(({ documents, ...v }) => {
      const dated = documents.filter((d) => d.expiryDate).sort((a, b) => +(b.expiryDate as Date) - +(a.expiryDate as Date));
      const last = dated[0] ?? documents[0];
      let status: 'NONE' | 'VALID' | 'EXPIRING' | 'EXPIRED' = 'NONE';
      let daysLeft: number | null = null;
      if (last) {
        if (!last.expiryDate) status = 'VALID';
        else {
          daysLeft = Math.ceil((+last.expiryDate - now) / 86400000);
          status = daysLeft < 0 ? 'EXPIRED' : daysLeft <= 7 ? 'EXPIRING' : 'VALID';
        }
      }
      return { ...v, insurance: { status, expiryDate: last?.expiryDate ?? null, reference: last && last.fileUrl !== '—' ? last.fileUrl : null, daysLeft } };
    });
  }

  // Périmètre : un utilisateur rattaché à un site reste sur son site (le Super Admin choisit)
  private scopeSite(actor: any, siteId?: string): string | undefined {
    return actor && actor.role !== 'SUPER_ADMIN' && actor.siteId ? actor.siteId : siteId || undefined;
  }

  async fleetOverview(actor: any, siteId?: string, vehicleType?: VehicleType) {
    const site = this.scopeSite(actor, siteId);
    const base: any[] = await this.findAll({ siteId: site, vehicleType });
    const ids = base.map((v) => v.id);
    if (!ids.length) return [];
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [live, downs, maint, tripsM, fuelM] = await Promise.all([
      this.prisma.trip.findMany({ where: { vehicleId: { in: ids }, status: 'IN_PROGRESS' }, orderBy: { startTime: 'desc' }, select: { vehicleId: true, reference: true, destination: true, startTime: true, driver: { select: { firstName: true, lastName: true } } } }),
      this.prisma.vehicleDowntime.findMany({ where: { vehicleId: { in: ids }, endedAt: null }, orderBy: { startedAt: 'desc' }, select: { vehicleId: true, category: true, reason: true, startedAt: true } }),
      this.prisma.maintenance.findMany({ where: { vehicleId: { in: ids } }, orderBy: { maintenanceDate: 'desc' }, take: 3000, select: { vehicleId: true, maintenanceDate: true, nextDate: true, nextMileage: true } }),
      this.prisma.trip.groupBy({ by: ['vehicleId'], where: { vehicleId: { in: ids }, tripDate: { gte: monthStart }, status: 'COMPLETED' }, _count: true, _sum: { distance: true } }),
      this.prisma.fuelTransaction.groupBy({ by: ['vehicleId'], where: { vehicleId: { in: ids }, transactionDate: { gte: monthStart } }, _sum: { quantityLiters: true, totalCost: true } }),
    ]);
    const first = <T extends { vehicleId: string }>(rows: T[]) => { const m = new Map<string, T>(); for (const r of rows) if (!m.has(r.vehicleId)) m.set(r.vehicleId, r); return m; };
    const liveM = first(live), downM = first(downs), maintM = first(maint);
    const tM = new Map(tripsM.map((t) => [t.vehicleId, t])), fM = new Map(fuelM.map((f) => [f.vehicleId, f]));
    return base.map((v) => {
      const lm = maintM.get(v.id), t = tM.get(v.id), f = fM.get(v.id), l = liveM.get(v.id), d = downM.get(v.id);
      return {
        ...v,
        currentTrip: l ? { reference: l.reference, destination: l.destination, since: l.startTime, driver: l.driver ? `${l.driver.firstName} ${l.driver.lastName}` : null } : null,
        openDowntime: d ? { category: d.category, reason: d.reason, since: d.startedAt } : null,
        lastMaintenanceAt: lm ? lm.maintenanceDate : null,
        nextMaintenanceDate: lm ? lm.nextDate : null,
        nextMaintenanceMileage: lm ? lm.nextMileage : null,
        month: { trips: t ? (t._count as number) : 0, km: t ? t._sum.distance ?? 0 : 0, liters: f ? Number(f._sum.quantityLiters ?? 0) : 0, fuelCost: f ? Number(f._sum.totalCost ?? 0) : 0 },
      };
    });
  }

  async dossier(id: string, actor: any) {
    const v = await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null },
      include: { assignedDriver: { select: { id: true, firstName: true, lastName: true, phone: true, licenseNumber: true } }, documents: { where: { replacedAt: null }, select: { id: true, type: true, expiryDate: true } } },
    });
    if (!v) throw new NotFoundException('Véhicule introuvable.');
    if (actor && actor.role !== 'SUPER_ADMIN' && actor.siteId && v.siteId !== actor.siteId) throw new ForbiddenException("Ce véhicule n'est pas dans votre périmètre.");
    const [trips, fuel, maint, downs, incidents, tripTot, fuelTot, maintTot] = await Promise.all([
      this.prisma.trip.findMany({ where: { vehicleId: id }, orderBy: { tripDate: 'desc' }, take: 15, select: { id: true, reference: true, tripDate: true, status: true, destination: true, distance: true, driver: { select: { firstName: true, lastName: true } } } }),
      this.prisma.fuelTransaction.findMany({ where: { vehicleId: id }, orderBy: { transactionDate: 'desc' }, take: 15, select: { id: true, transactionDate: true, quantityLiters: true, totalCost: true, station: true, source: true, mileage: true, receiptImageUrl: true, driver: { select: { firstName: true, lastName: true } } } }),
      this.prisma.maintenance.findMany({ where: { vehicleId: id }, orderBy: { maintenanceDate: 'desc' }, take: 15, select: { id: true, maintenanceDate: true, kind: true, status: true, description: true, cost: true, mileage: true, invoiceUrl: true, maintenanceType: { select: { label: true } }, supplier: { select: { name: true } } } }),
      this.prisma.vehicleDowntime.findMany({ where: { vehicleId: id }, orderBy: { startedAt: 'desc' }, take: 15, select: { id: true, category: true, reason: true, severity: true, startedAt: true, endedAt: true, actualCost: true, estimatedCost: true } }),
      this.prisma.hseIncident.findMany({ where: { vehicleId: id }, orderBy: { occurredAt: 'desc' }, take: 10, select: { id: true, occurredAt: true, type: true, severity: true, status: true, description: true } }),
      this.prisma.trip.aggregate({ where: { vehicleId: id, status: 'COMPLETED' }, _count: true, _sum: { distance: true } }),
      this.prisma.fuelTransaction.aggregate({ where: { vehicleId: id }, _sum: { quantityLiters: true, totalCost: true } }),
      this.prisma.maintenance.aggregate({ where: { vehicleId: id }, _sum: { cost: true }, _count: true }),
    ]);
    const n = (x: any) => Number(x ?? 0);
    const assignments = await assignmentHistory(this.prisma, id).catch(() => []);
    return {
      vehicle: v,
      assignments,
      trips,
      fuel: fuel.map((f) => ({ ...f, quantityLiters: n(f.quantityLiters), totalCost: n(f.totalCost) })),
      maintenance: maint.map((m) => ({ ...m, cost: n(m.cost) })),
      downtimes: downs.map((d) => ({ ...d, actualCost: d.actualCost == null ? null : n(d.actualCost), estimatedCost: d.estimatedCost == null ? null : n(d.estimatedCost) })),
      incidents,
      totals: {
        completedTrips: tripTot._count as number,
        km: tripTot._sum.distance ?? 0,
        liters: n(fuelTot._sum.quantityLiters),
        fuelCost: n(fuelTot._sum.totalCost),
        maintenanceCost: n(maintTot._sum.cost),
        interventions: maintTot._count as number,
      },
    };
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        assignedDriver: true,
        trips: { take: 10, orderBy: { tripDate: 'desc' } },
        fuelTransactions: { take: 10, orderBy: { transactionDate: 'desc' } },
        maintenance: { take: 10, orderBy: { maintenanceDate: 'desc' }, include: { maintenanceType: true } },
        documents: true,
      },
    });
    if (!vehicle) throw new NotFoundException('Véhicule introuvable.');
    return vehicle;
  }

  async update(id: string, dto: UpdateVehicleDto, actorId: string) {
    const before = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Véhicule introuvable.');
    await this.checkDriverKind(dto.assignedDriverId, before.vehicleType);

    const vehicle = await this.prisma.vehicle.update({ where: { id }, data: dto });
    if (dto.assignedDriverId !== undefined && (dto.assignedDriverId || null) !== before.assignedDriverId) {
      if (dto.assignedDriverId) await releaseOtherVehicles(this.prisma, dto.assignedDriverId, id, actorId);
      await recordAssignment(this.prisma, { vehicleId: id, newDriverId: dto.assignedDriverId || null, by: actorId, source: 'MANUEL' });
    }
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'Vehicle', entityId: id, oldValue: before, newValue: dto });
    return vehicle;
  }

  async remove(id: string, actorId: string) {
    await this.prisma.vehicle.update({ where: { id }, data: { deletedAt: new Date(), status: 'OUT_OF_SERVICE' } });
    await this.audit.log({ userId: actorId, action: 'DELETE', entity: 'Vehicle', entityId: id });
    return { success: true };
  }

  // KPI simple : taux de disponibilité de la flotte
  async fleetAvailability(siteId: string, vehicleType?: VehicleType) {
    const where = { siteId, deletedAt: null, ...(vehicleType ? { vehicleType } : {}) };
    const total = await this.prisma.vehicle.count({ where });
    const available = await this.prisma.vehicle.count({ where: { ...where, status: 'AVAILABLE' } });
    return {
      total,
      available,
      availabilityRate: total > 0 ? Math.round((available / total) * 100) : 0,
    };
  }

  async assignments(id: string, actor?: any) {
    const v = await this.prisma.vehicle.findFirst({ where: { id, deletedAt: null }, select: { siteId: true } });
    if (!v) throw new NotFoundException('Véhicule introuvable.');
    if (actor && actor.role !== 'SUPER_ADMIN' && actor.siteId && v.siteId !== actor.siteId) throw new ForbiddenException("Ce véhicule n'est pas dans votre périmètre.");
    return assignmentHistory(this.prisma, id);
  }
}
