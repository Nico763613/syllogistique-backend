import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Agrège les données pour le Dashboard global et les rapports périodiques (§19, §22)
@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async dashboard(siteId: string) {
    const [
      totalTrucks,
      availableTrucks,
      onMissionTrucks,
      immobilizedTrucks,
      totalServiceVehicles,
      availableServiceVehicles,
      maintenanceVehicles,
      itemsCount,
      items,
    ] = await Promise.all([
      this.prisma.vehicle.count({ where: { siteId, vehicleType: 'TRUCK', deletedAt: null } }),
      this.prisma.vehicle.count({ where: { siteId, vehicleType: 'TRUCK', status: 'AVAILABLE', deletedAt: null } }),
      this.prisma.vehicle.count({ where: { siteId, vehicleType: 'TRUCK', status: 'ON_MISSION', deletedAt: null } }),
      this.prisma.vehicle.count({ where: { siteId, vehicleType: 'TRUCK', status: 'IMMOBILIZED', deletedAt: null } }),
      this.prisma.vehicle.count({ where: { siteId, vehicleType: 'SERVICE_VEHICLE', deletedAt: null } }),
      this.prisma.vehicle.count({ where: { siteId, vehicleType: 'SERVICE_VEHICLE', status: 'AVAILABLE', deletedAt: null } }),
      this.prisma.vehicle.count({ where: { siteId, status: 'MAINTENANCE', deletedAt: null } }),
      this.prisma.inventoryItem.count({ where: { siteId } }),
      this.prisma.inventoryItem.findMany({ where: { siteId } }),
    ]);

    const stockValue = items.reduce((s, i) => s + Number(i.currentQuantity) * Number(i.unitPrice ?? 0), 0);
    const belowMinimum = items.filter((i) => Number(i.currentQuantity) < Number(i.minimumQuantity)).length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const [tripsToday, fuelToday] = await Promise.all([
      this.prisma.trip.findMany({ where: { siteId, tripDate: { gte: today, lt: tomorrow } } }),
      this.prisma.fuelTransaction.findMany({ where: { siteId, transactionDate: { gte: today, lt: tomorrow } } }),
    ]);

    return {
      fleet: {
        trucks: { total: totalTrucks, available: availableTrucks, onMission: onMissionTrucks, immobilized: immobilizedTrucks },
        serviceVehicles: { total: totalServiceVehicles, available: availableServiceVehicles },
        inMaintenance: maintenanceVehicles,
      },
      stock: { itemsCount, stockValue, belowMinimum },
      today: {
        trips: tripsToday.length,
        kilometers: tripsToday.reduce((s, t) => s + (t.distance ?? 0), 0),
        fuelLiters: fuelToday.reduce((s, f) => s + Number(f.quantityLiters), 0),
        fuelCost: fuelToday.reduce((s, f) => s + Number(f.totalCost), 0),
      },
    };
  }

  async periodReport(siteId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const [trips, fuel, maintenance, movements] = await Promise.all([
      this.prisma.trip.findMany({ where: { siteId, tripDate: { gte: fromDate, lte: toDate } } }),
      this.prisma.fuelTransaction.findMany({ where: { siteId, transactionDate: { gte: fromDate, lte: toDate } } }),
      this.prisma.maintenance.findMany({
        where: { vehicle: { siteId }, maintenanceDate: { gte: fromDate, lte: toDate } },
        include: { maintenanceType: true, vehicle: { select: { internalNumber: true } } },
      }),
      this.prisma.stockMovement.findMany({ where: { siteId, createdAt: { gte: fromDate, lte: toDate } } }),
    ]);

    return {
      period: { from, to },
      trips: { count: trips.length, totalKm: trips.reduce((s, t) => s + (t.distance ?? 0), 0) },
      fuel: {
        totalLiters: fuel.reduce((s, f) => s + Number(f.quantityLiters), 0),
        totalCost: fuel.reduce((s, f) => s + Number(f.totalCost), 0),
      },
      maintenance: {
        count: maintenance.length,
        totalCost: maintenance.reduce((s, m) => s + Number(m.cost ?? 0), 0),
        items: maintenance.map((m) => ({
          vehicle: m.vehicle.internalNumber,
          type: m.maintenanceType.label,
          date: m.maintenanceDate,
          cost: m.cost,
        })),
      },
      stock: {
        entries: movements.filter((m) => m.movementType === 'IN').length,
        exits: movements.filter((m) => m.movementType === 'OUT').length,
      },
    };
  }
}
