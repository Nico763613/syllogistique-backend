import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateMaintenanceDto } from './dto/maintenance.dto';

@Injectable()
export class MaintenanceService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: CreateMaintenanceDto, actorId: string) {
    const type = await this.prisma.maintenanceType.findUnique({ where: { code: dto.maintenanceTypeCode } });
    if (!type) throw new BadRequestException('Type de maintenance inconnu.');

    const record = await this.prisma.maintenance.create({
      data: {
        vehicleId: dto.vehicleId,
        maintenanceTypeId: type.id,
        maintenanceDate: new Date(dto.maintenanceDate),
        mileage: dto.mileage,
        description: dto.description,
        supplierId: dto.supplierId,
        cost: dto.cost,
        nextDate: dto.nextDate ? new Date(dto.nextDate) : undefined,
        nextMileage: dto.nextMileage,
        invoiceNumber: dto.invoiceNumber,
        invoiceUrl: dto.invoiceUrl,
        status: 'COMPLETED',
      },
    });

    // Le véhicule redevient disponible après l'entretien (s'il était en maintenance)
    await this.prisma.vehicle.updateMany({
      where: { id: dto.vehicleId, status: 'MAINTENANCE' },
      data: { status: 'AVAILABLE' },
    });

    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Maintenance', entityId: record.id, newValue: dto });
    return record;
  }

  findAll(params: { vehicleId?: string }) {
    return this.prisma.maintenance.findMany({
      where: { ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}) },
      include: { maintenanceType: true, vehicle: { select: { internalNumber: true } }, supplier: true },
      orderBy: { maintenanceDate: 'desc' },
    });
  }

  // Alertes : entretiens en retard ou bientôt dus (par date ou kilométrage)
  async alerts(siteId: string, mileageThreshold = 500) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { siteId, deletedAt: null },
      include: { maintenance: { orderBy: { maintenanceDate: 'desc' }, take: 1 } },
    });

    const now = new Date();
    const soon = new Date();
    soon.setDate(now.getDate() + 7);

    return vehicles
      .map((v) => {
        const last = v.maintenance[0];
        if (!last) return null;
        let level: 'OVERDUE' | 'SOON' | 'OK' = 'OK';

        if (last.nextDate && last.nextDate < now) level = 'OVERDUE';
        else if (last.nextMileage && v.currentMileage >= last.nextMileage) level = 'OVERDUE';
        else if (last.nextDate && last.nextDate <= soon) level = 'SOON';
        else if (last.nextMileage && v.currentMileage >= last.nextMileage - mileageThreshold) level = 'SOON';

        return level === 'OK'
          ? null
          : {
              vehicleId: v.id,
              internalNumber: v.internalNumber,
              level,
              nextDate: last.nextDate,
              nextMileage: last.nextMileage,
              currentMileage: v.currentMileage,
            };
      })
      .filter(Boolean);
  }

  // Liste des types d'entretien (vidange, pneus, freins…) pour les formulaires
  types() {
    return this.prisma.maintenanceType.findMany({ orderBy: { label: 'asc' } });
  }
}
