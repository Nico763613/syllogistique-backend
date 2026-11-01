import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateFuelTransactionDto, CorrectFuelTransactionDto } from './dto/fuel.dto';
import { currentFuelPrice } from '../common/fuel-price';

@Injectable()
export class FuelService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: CreateFuelTransactionDto, actorId: string, organizationId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new BadRequestException('Véhicule inexistant.');

    if (dto.quantityLiters <= 0) throw new BadRequestException('La quantité de carburant doit être positive.');

    // Le tarif central fait foi (modifiable dans Paramètres) : le total se calcule automatiquement.
    const pricePerLiter = await currentFuelPrice(this.prisma, organizationId);
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

  // Correction d'une erreur de saisie : motif obligatoire, ancien/nouveau enregistrés dans le journal.
  async correct(id: string, dto: CorrectFuelTransactionDto, actorId: string) {
    const existing = await this.prisma.fuelTransaction.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ravitaillement introuvable.');

    const quantityLiters = dto.quantityLiters ?? Number(existing.quantityLiters);
    const pricePerLiter = dto.pricePerLiter ?? Number(existing.pricePerLiter);
    const totalCost = Number((quantityLiters * pricePerLiter).toFixed(2));

    const updated = await this.prisma.fuelTransaction.update({
      where: { id },
      data: {
        quantityLiters,
        pricePerLiter,
        totalCost,
        ...(dto.mileage !== undefined ? { mileage: dto.mileage } : {}),
        ...(dto.transactionDate ? { transactionDate: new Date(dto.transactionDate) } : {}),
        ...(dto.station !== undefined ? { station: dto.station } : {}),
        ...(dto.receiptNumber !== undefined ? { receiptNumber: dto.receiptNumber } : {}),
        ...(dto.observations !== undefined ? { observations: dto.observations } : {}),
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'FuelTransaction',
      entityId: id,
      oldValue: existing,
      newValue: updated,
      reason: dto.reason.trim(),
    });
    return updated;
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
