import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

// Contrôle des fiches de bord des camions : mouvements et tonnes déclarés par les chauffeurs, comparés aux totaux des pointeurs
@Injectable()
export class DriverPointersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private bounds(date?: string) {
    const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
    const from = new Date(d + 'T00:00:00.000Z');
    return { d, from, to: new Date(+from + 86400000) };
  }

  async day(siteId: string | undefined, date?: string) {
    const { d, from, to } = this.bounds(date);
    const trips = await this.prisma.trip.findMany({
      where: { ...(siteId ? { siteId } : {}), vehicle: { vehicleType: 'TRUCK' }, startTime: { gte: from, lt: to }, status: { not: 'CANCELLED' } },
      include: { vehicle: { select: { id: true, internalNumber: true, registrationNumber: true } }, driver: { select: { firstName: true, lastName: true } } },
      orderBy: { startTime: 'asc' },
    });
    const counts = await this.prisma.pointerCount.findMany({ where: { ...(siteId ? { siteId } : {}), day: from } });
    const price = await this.tonPrice(siteId);
    const byVeh = new Map<string, { vehicleId: string; vehicle: string; driver: string; movements: number; tons: number; missingTonnage: boolean }>();
    for (const t of trips) {
      const row = byVeh.get(t.vehicleId) ?? { vehicleId: t.vehicleId, vehicle: `${t.vehicle.internalNumber} — ${t.vehicle.registrationNumber}`, driver: `${t.driver.lastName} ${t.driver.firstName}`, movements: 0, tons: 0, missingTonnage: false };
      const n = t.tripsCount ?? 0;
      row.movements += n;
      if (t.tonnagePerTrip) row.tons += t.tonnagePerTrip * n; else if (n > 0) row.missingTonnage = true;
      byVeh.set(t.vehicleId, row);
    }
    const rows = [...byVeh.values()].map((r) => {
      const p = counts.find((c) => c.vehicleId === r.vehicleId);
      const tons = Math.round(r.tons * 10) / 10;
      return {
        ...r, tons, amount: Math.round(tons * price),
        pointer: p ? { movements: p.movements, tons: p.tons, note: p.note } : null,
        gapMovements: p ? r.movements - p.movements : null,
        gapTons: p ? Math.round((tons - p.tons) * 10) / 10 : null,
      };
    });
    return { date: d, pricePerTon: price, rows };
  }

  // Prix par tonne : paramètre du site (réglage « TON_PRICE »), fixé par le responsable logistique
  private async tonPrice(siteId?: string) {
    try {
      const s = await this.prisma.setting.findFirst({ where: { key: 'TON_PRICE' } });
      const v = Number(s?.value);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch { return 0; }
  }

  async save(siteId: string | undefined, dto: { vehicleId: string; day: string; movements: number; tons: number; note?: string }, userId: string) {
    const { from } = this.bounds(dto.day);
    const v = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!v) throw new BadRequestException('Camion introuvable.');
    const row = await this.prisma.pointerCount.upsert({
      where: { vehicleId_day: { vehicleId: v.id, day: from } },
      create: { siteId: siteId ?? v.siteId, vehicleId: v.id, day: from, movements: dto.movements, tons: dto.tons, note: dto.note?.trim() || null, createdBy: userId },
      update: { movements: dto.movements, tons: dto.tons, note: dto.note?.trim() || null, createdBy: userId },
    });
    await this.audit.log({ userId, action: 'UPDATE', entity: 'PointerCount', entityId: row.id, newValue: { vehicle: v.internalNumber, day: dto.day, movements: dto.movements, tons: dto.tons } });
    return row;
  }
}
