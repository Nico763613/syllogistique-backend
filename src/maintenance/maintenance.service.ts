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
        cost: dto.cost ?? ((dto.partsCost ?? 0) + (dto.laborCost ?? 0) || undefined),
        kind: dto.kind ?? 'CORRECTIVE',
        partsCost: Math.round(dto.partsCost ?? 0),
        laborCost: Math.round(dto.laborCost ?? 0),
        nextHours: dto.nextHours,
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
      include: { maintenanceType: true, vehicle: { select: { internalNumber: true, registrationNumber: true, vehicleType: true } }, supplier: true },
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

  // Récapitulatif des coûts de maintenance par véhicule, type et mois + prochaines échéances.
  // Coût d'une intervention = coût saisi, sinon pièces + main-d'œuvre. Camions / véhicules de service séparés.
  async recap(siteId: string, kind: string, months = 6) {
    const vtype = kind === 'TRUCK' ? 'TRUCK' : 'SERVICE_VEHICLE';
    const nb = Math.min(Math.max(Math.floor(Number(months)) || 6, 1), 24);
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (nb - 1), 1));
    const monthKeys: string[] = [];
    for (let i = 0; i < nb; i++) monthKeys.push(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1)).toISOString().slice(0, 7));

    const vehicles = await this.prisma.vehicle.findMany({
      where: { siteId, vehicleType: vtype as any, deletedAt: null },
      select: { id: true, internalNumber: true, registrationNumber: true, currentMileage: true },
      orderBy: { internalNumber: 'asc' },
    });
    const ids = vehicles.map((v) => v.id);
    const all = ids.length
      ? await this.prisma.maintenance.findMany({
          where: { vehicleId: { in: ids } },
          include: { maintenanceType: { select: { id: true, label: true } } },
          orderBy: { maintenanceDate: 'desc' },
        })
      : [];
    const costOf = (m: any) => (m.cost != null ? Number(m.cost) : Number(m.partsCost ?? 0) + Number(m.laborCost ?? 0));

    const byType = new Map<string, { label: string; count: number; cost: number }>();
    const byMonth: Record<string, { count: number; cost: number }> = Object.fromEntries(monthKeys.map((k) => [k, { count: 0, cost: 0 }]));
    const rows = vehicles.map((v) => {
      const mine = all.filter((m) => m.vehicleId === v.id);
      const inPeriod = mine.filter((m) => m.maintenanceDate >= from);
      let preventive = 0, corrective = 0;
      for (const m of inPeriod) {
        const c = costOf(m);
        if (m.kind === 'PREVENTIVE') preventive += c; else corrective += c;
        const t = byType.get(m.maintenanceType.id) ?? { label: m.maintenanceType.label, count: 0, cost: 0 };
        t.count++; t.cost += c; byType.set(m.maintenanceType.id, t);
        const k = m.maintenanceDate.toISOString().slice(0, 7);
        if (byMonth[k]) { byMonth[k].count++; byMonth[k].cost += c; }
      }
      // Prochaine échéance : dernier entretien de chaque type qui définit une date ou un kilométrage suivant
      const seen = new Set<string>();
      const dues: any[] = [];
      for (const m of mine) {
        if (seen.has(m.maintenanceTypeId)) continue;
        seen.add(m.maintenanceTypeId);
        if (!m.nextDate && m.nextMileage == null) continue;
        const kmLeft = m.nextMileage != null ? m.nextMileage - v.currentMileage : null;
        const daysLeft = m.nextDate ? Math.ceil((m.nextDate.getTime() - now.getTime()) / 86400000) : null;
        let level: 'OVERDUE' | 'SOON' | 'OK' = 'OK';
        if ((daysLeft != null && daysLeft < 0) || (kmLeft != null && kmLeft <= 0)) level = 'OVERDUE';
        else if ((daysLeft != null && daysLeft <= 7) || (kmLeft != null && kmLeft <= 500)) level = 'SOON';
        dues.push({ type: m.maintenanceType.label, nextDate: m.nextDate, nextMileage: m.nextMileage, daysLeft, kmLeft, level });
      }
      const rank = { OVERDUE: 0, SOON: 1, OK: 2 } as Record<string, number>;
      dues.sort((a, b) => rank[a.level] - rank[b.level] || (a.daysLeft ?? 9e9) - (b.daysLeft ?? 9e9));
      return {
        id: v.id, number: v.internalNumber, registration: v.registrationNumber, odometer: v.currentMileage,
        count: inPeriod.length, periodCost: Math.round(preventive + corrective), preventive: Math.round(preventive), corrective: Math.round(corrective),
        cumulCost: Math.round(mine.reduce((a, m) => a + costOf(m), 0)), cumulCount: mine.length,
        lastDate: mine[0]?.maintenanceDate ?? null, nextDue: dues[0] ?? null,
      };
    });
    return {
      kind: vtype, months: monthKeys, vehicles: rows,
      total: { count: rows.reduce((a, r) => a + r.count, 0), periodCost: rows.reduce((a, r) => a + r.periodCost, 0), cumulCost: rows.reduce((a, r) => a + r.cumulCost, 0), overdue: rows.filter((r) => r.nextDue?.level === 'OVERDUE').length, soon: rows.filter((r) => r.nextDue?.level === 'SOON').length },
      byType: [...byType.values()].map((t) => ({ ...t, cost: Math.round(t.cost) })).sort((a, b) => b.cost - a.cost),
      byMonth: monthKeys.map((k) => ({ month: k, count: byMonth[k].count, cost: Math.round(byMonth[k].cost) })),
    };
  }

  // Liste des types d'entretien (vidange, pneus, freins…) pour les formulaires
  types() {
    return this.prisma.maintenanceType.findMany({ orderBy: { label: 'asc' } });
  }
}
