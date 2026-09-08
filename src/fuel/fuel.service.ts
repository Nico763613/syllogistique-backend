import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateFuelTransactionDto } from './dto/fuel.dto';

@Injectable()
export class FuelService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async defaultPriceFor(vehicleType: 'TRUCK' | 'SERVICE_VEHICLE', organizationId: string) {
    const key = vehicleType === 'TRUCK' ? 'TRUCK_FUEL_PRICE' : 'SERVICE_VEHICLE_FUEL_PRICE';
    const setting = await this.prisma.setting.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
    return setting ? Number(setting.value) : vehicleType === 'TRUCK' ? 10000 : 12000;
  }

  async create(dto: CreateFuelTransactionDto, actorId: string, organizationId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new BadRequestException('Véhicule inexistant.');

    if (dto.quantityLiters <= 0) throw new BadRequestException('La quantité de carburant doit être positive.');

    const pricePerLiter =
      dto.pricePerLiter ?? (await this.defaultPriceFor(vehicle.vehicleType, organizationId));
    const totalCost = Number((dto.quantityLiters * pricePerLiter).toFixed(2));

    const tx = await this.prisma.fuelTransaction.create({
      data: {
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        siteId: dto.siteId,
        transactionDate: new Date(dto.transactionDate),
        mileage: dto.mileage,
        quantityLiters: dto.quantityLiters,
        pricePerLiter,
        totalCost,
        station: dto.station,
        receiptNumber: dto.receiptNumber,
        receiptImageUrl: dto.receiptImageUrl,
        observations: dto.observations,
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entity: 'FuelTransaction',
      entityId: tx.id,
      newValue: { ...dto, pricePerLiter, totalCost },
    });

    return tx;
  }

  findAll(params: { siteId?: string; vehicleId?: string; from?: string; to?: string }) {
    return this.prisma.fuelTransaction.findMany({
      where: {
        ...(params.siteId ? { siteId: params.siteId } : {}),
        ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
        ...(params.from || params.to
          ? {
              transactionDate: {
                ...(params.from ? { gte: new Date(params.from) } : {}),
                ...(params.to ? { lte: new Date(params.to) } : {}),
              },
            }
          : {}),
      },
      include: { vehicle: { select: { internalNumber: true, registrationNumber: true } } },
      orderBy: { transactionDate: 'desc' },
    });
  }

  // Statistiques de consommation par véhicule sur une période
  async consumptionStats(vehicleId: string, from: string, to: string) {
    const transactions = await this.prisma.fuelTransaction.findMany({
      where: { vehicleId, transactionDate: { gte: new Date(from), lte: new Date(to) } },
      orderBy: { transactionDate: 'asc' },
    });
    if (transactions.length === 0) throw new NotFoundException('Aucune transaction sur cette période.');

    const totalLiters = transactions.reduce((sum, t) => sum + Number(t.quantityLiters), 0);
    const totalCost = transactions.reduce((sum, t) => sum + Number(t.totalCost), 0);

    const firstMileage = transactions[0].mileage;
    const lastMileage = transactions[transactions.length - 1].mileage;
    const distance = lastMileage - firstMileage;

    const avgConsumptionPer100Km = distance > 0 ? Number(((totalLiters / distance) * 100).toFixed(1)) : null;
    const costPerKm = distance > 0 ? Number((totalCost / distance).toFixed(0)) : null;

    return { totalLiters, totalCost, distance, avgConsumptionPer100Km, costPerKm };
  }
}
