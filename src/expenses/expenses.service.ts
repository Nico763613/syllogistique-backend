import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateExpenseDto } from './dto/expense.dto';

// Gestion des coûts (§30) : dépenses diverses + synthèse des coûts par véhicule.
@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: CreateExpenseDto, actorId: string) {
    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
      if (!vehicle) throw new BadRequestException('Véhicule inexistant.');
    }
    const expense = await this.prisma.expense.create({
      data: {
        vehicleId: dto.vehicleId,
        category: dto.category,
        amount: dto.amount,
        expenseDate: new Date(dto.expenseDate),
        description: dto.description,
      },
    });
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Expense', entityId: expense.id, newValue: dto });
    return expense;
  }

  findAll(params: { vehicleId?: string; category?: string; from?: string; to?: string }) {
    return this.prisma.expense.findMany({
      where: {
        ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
        ...(params.category ? { category: params.category } : {}),
        ...(params.from || params.to
          ? {
              expenseDate: {
                ...(params.from ? { gte: new Date(params.from) } : {}),
                ...(params.to ? { lte: new Date(params.to) } : {}),
              },
            }
          : {}),
      },
      include: { vehicle: { select: { internalNumber: true, registrationNumber: true } } },
      orderBy: { expenseDate: 'desc' },
    });
  }

  // Coût total par véhicule, coût/km et coût/mission sur une période (carburant + maintenance + pièces sorties + autres dépenses)
  async costSummary(siteId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate > toDate) {
      throw new BadRequestException('Période invalide.');
    }

    const [vehicles, fuel, maintenance, parts, expenses, trips] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { siteId, deletedAt: null }, select: { id: true, internalNumber: true, registrationNumber: true, vehicleType: true } }),
      this.prisma.fuelTransaction.findMany({ where: { siteId, transactionDate: { gte: fromDate, lte: toDate } } }),
      this.prisma.maintenance.findMany({ where: { vehicle: { siteId }, maintenanceDate: { gte: fromDate, lte: toDate } } }),
      this.prisma.stockMovement.findMany({ where: { siteId, movementType: 'OUT', vehicleId: { not: null }, createdAt: { gte: fromDate, lte: toDate } } }),
      this.prisma.expense.findMany({ where: { vehicle: { siteId }, expenseDate: { gte: fromDate, lte: toDate } } }),
      this.prisma.trip.findMany({ where: { siteId, tripDate: { gte: fromDate, lte: toDate } } }),
    ]);

    const rows = vehicles.map((v) => {
      const fuelCost = fuel.filter((f) => f.vehicleId === v.id).reduce((s, f) => s + Number(f.totalCost), 0);
      const maintenanceCost = maintenance.filter((m) => m.vehicleId === v.id).reduce((s, m) => s + Number(m.cost ?? 0), 0);
      const partsCost = parts.filter((p) => p.vehicleId === v.id).reduce((s, p) => s + Number(p.totalValue ?? 0), 0);
      const otherCost = expenses.filter((e) => e.vehicleId === v.id).reduce((s, e) => s + Number(e.amount), 0);
      const vTrips = trips.filter((t) => t.vehicleId === v.id);
      const km = vTrips.reduce((s, t) => s + (t.distance ?? 0), 0);
      const total = fuelCost + maintenanceCost + partsCost + otherCost;
      return {
        vehicleId: v.id,
        internalNumber: v.internalNumber,
        registrationNumber: v.registrationNumber,
        vehicleType: v.vehicleType,
        fuelCost,
        maintenanceCost,
        partsCost,
        otherCost,
        totalCost: total,
        kilometers: km,
        missions: vTrips.length,
        costPerKm: km > 0 ? Math.round(total / km) : null,
        costPerMission: vTrips.length > 0 ? Math.round(total / vTrips.length) : null,
      };
    });

    const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
    const totalKm = rows.reduce((s, r) => s + r.kilometers, 0);
    const totalMissions = rows.reduce((s, r) => s + r.missions, 0);

    return {
      period: { from, to },
      totals: {
        fuelCost: rows.reduce((s, r) => s + r.fuelCost, 0),
        maintenanceCost: rows.reduce((s, r) => s + r.maintenanceCost, 0),
        partsCost: rows.reduce((s, r) => s + r.partsCost, 0),
        otherCost: rows.reduce((s, r) => s + r.otherCost, 0),
        totalCost,
        kilometers: totalKm,
        missions: totalMissions,
        costPerKm: totalKm > 0 ? Math.round(totalCost / totalKm) : null,
        costPerMission: totalMissions > 0 ? Math.round(totalCost / totalMissions) : null,
      },
      vehicles: rows.sort((a, b) => b.totalCost - a.totalCost),
    };
  }
}
