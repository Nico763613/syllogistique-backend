import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReportDowntimeDto, ResolveDowntimeDto } from './dto/downtime.dto';

const DAY = 86400000;

@Injectable()
export class DowntimesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Déclare une panne / immobilisation : le véhicule passe en IMMOBILIZED
  async report(dto: ReportDowntimeDto, actorId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle || vehicle.deletedAt) throw new NotFoundException('Véhicule introuvable.');
    const open = await this.prisma.vehicleDowntime.findFirst({ where: { vehicleId: dto.vehicleId, endedAt: null } });
    if (open) throw new BadRequestException('Ce véhicule a déjà une immobilisation en cours.');

    const downtime = await this.prisma.vehicleDowntime.create({
      data: {
        vehicleId: dto.vehicleId,
        siteId: vehicle.siteId,
        category: dto.category ?? 'PANNE',
        reason: dto.reason.trim(),
        estimatedCost: dto.estimatedCost,
        createdById: actorId,
      },
    });
    await this.prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: 'IMMOBILIZED' } });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Vehicle',
      entityId: vehicle.id,
      oldValue: { status: vehicle.status },
      newValue: { status: 'IMMOBILIZED', categorie: downtime.category },
      reason: dto.reason.trim(),
    });
    return downtime;
  }

  // Remise en service : clôture l'immobilisation, calcule la durée, libère le véhicule
  async resolve(id: string, dto: ResolveDowntimeDto, actorId: string, actorRole?: string) {
    const downtime = await this.prisma.vehicleDowntime.findUnique({ where: { id } });
    if (!downtime) throw new NotFoundException('Immobilisation introuvable.');
    if (downtime.endedAt) throw new BadRequestException('Cette immobilisation est déjà clôturée.');
    if (actorRole === 'MECANICIEN') {
      if (dto.actualCost === undefined || dto.actualCost === null) throw new BadRequestException('Indiquez le coût de la réparation (0 si aucun).');
      if (!dto.resolutionNote?.trim()) throw new BadRequestException('Indiquez les travaux réalisés.');
      if (dto.actualCost > 0 && !dto.invoiceUrl) throw new BadRequestException('La photo de la facture est obligatoire quand un coût est indiqué.');
    }
    const endedAt = new Date();
    const updated = await this.prisma.vehicleDowntime.update({
      where: { id },
      data: { endedAt, actualCost: dto.actualCost, resolutionNote: dto.resolutionNote?.trim(), resolvedById: actorId, invoiceUrl: dto.invoiceUrl || undefined },
    });
    await this.prisma.vehicle.update({ where: { id: downtime.vehicleId }, data: { status: 'AVAILABLE' } });
    const days = Math.max(1, Math.ceil((endedAt.getTime() - downtime.startedAt.getTime()) / DAY));
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Vehicle',
      entityId: downtime.vehicleId,
      oldValue: { status: 'IMMOBILIZED' },
      newValue: { status: 'AVAILABLE', joursImmobilises: days, coutReel: dto.actualCost ?? null },
      reason: dto.resolutionNote?.trim() || 'Remise en service',
    });
    return updated;
  }

  // Historique + indicateurs (durée, coût)
  async list(siteId: string, params: { vehicleId?: string; open?: string }, actor?: { userId?: string; role?: string }) {
    if (!siteId) throw new BadRequestException('Le site (siteId) est obligatoire.');
    const rows = await this.prisma.vehicleDowntime.findMany({
      where: {
        siteId,
        ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
        ...(params.open === 'true' ? { endedAt: null } : {}),
      },
      include: { vehicle: { select: { internalNumber: true, registrationNumber: true, brand: true, model: true } } },
      orderBy: { startedAt: 'desc' },
      take: 300,
    });
    const now = Date.now();
    const items = rows.map((r) => ({
      id: r.id,
      vehicleId: r.vehicleId,
      vehicle: `${r.vehicle.internalNumber} — ${r.vehicle.registrationNumber}`,
      category: r.category,
      reason: r.reason,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      days: Math.max(1, Math.ceil(((r.endedAt?.getTime() ?? now) - r.startedAt.getTime()) / DAY)),
      // Le mécanicien ne voit les coûts que de ses propres interventions
      estimatedCost: r.estimatedCost === null || (actor?.role === 'MECANICIEN' && r.resolvedById !== actor.userId) ? null : Number(r.estimatedCost),
      actualCost: r.actualCost === null || (actor?.role === 'MECANICIEN' && r.resolvedById !== actor.userId) ? null : Number(r.actualCost),
      resolutionNote: r.resolutionNote,
      invoiceUrl: r.invoiceUrl,
      mine: r.resolvedById === actor?.userId,
    }));
    return {
      items,
      summary: {
        open: items.filter((i) => !i.endedAt).length,
        totalDays: items.reduce((s, i) => s + i.days, 0),
        totalCost: items.reduce((s, i) => s + (i.actualCost ?? i.estimatedCost ?? 0), 0),
      },
    };
  }
}
