import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVehicleDto, UpdateVehicleDto } from './dto/vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: CreateVehicleDto, actorId: string) {
    const existing = await this.prisma.vehicle.findFirst({
      where: { siteId: dto.siteId, registrationNumber: dto.registrationNumber },
    });
    if (existing) throw new ConflictException('Cette plaque est déjà enregistrée sur ce site.');

    const vehicle = await this.prisma.vehicle.create({ data: dto });
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Vehicle', entityId: vehicle.id, newValue: dto });
    return vehicle;
  }

  findAll(params: { siteId?: string; vehicleType?: VehicleType; status?: string }) {
    return this.prisma.vehicle.findMany({
      where: {
        deletedAt: null,
        ...(params.siteId ? { siteId: params.siteId } : {}),
        ...(params.vehicleType ? { vehicleType: params.vehicleType } : {}),
        ...(params.status ? { status: params.status as any } : {}),
      },
      include: { assignedDriver: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { internalNumber: 'asc' },
    });
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

    const vehicle = await this.prisma.vehicle.update({ where: { id }, data: dto });
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
}
