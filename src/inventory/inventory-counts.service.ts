import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { alertStockThresholds } from '../common/stock-alerts';
import { CloseInventoryCountDto, SaveCountLinesDto, StartInventoryCountDto } from './dto/inventory.dto';

// Inventaire physique : on fige le stock théorique, on saisit les quantités comptées, puis la validation
// (avec motif) ajuste le stock et trace chaque écart (mouvement ADJUSTMENT + journal d'audit).
@Injectable()
export class InventoryCountsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async start(dto: StartInventoryCountDto, actorId: string) {
    const location = dto.location?.trim() || undefined;
    const open = await this.prisma.inventoryCount.findFirst({
      where: { siteId: dto.siteId, status: 'OPEN', location: location ?? null },
    });
    if (open) throw new ConflictException('Un inventaire est déjà en cours pour ce site / cet emplacement.');

    const items = await this.prisma.inventoryItem.findMany({
      where: { siteId: dto.siteId, ...(location ? { location } : {}) },
    });
    if (items.length === 0) throw new BadRequestException('Aucun article à inventorier pour ce périmètre.');

    const count = await this.prisma.inventoryCount.create({
      data: {
        siteId: dto.siteId,
        location,
        note: dto.note,
        createdById: actorId,
        lines: { create: items.map((i) => ({ itemId: i.id, expectedQuantity: i.currentQuantity })) },
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entity: 'InventoryCount',
      entityId: count.id,
      newValue: { siteId: dto.siteId, location, articles: items.length },
    });
    return count;
  }

  list(siteId?: string) {
    return this.prisma.inventoryCount.findMany({
      where: siteId ? { siteId } : {},
      include: { _count: { select: { lines: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // Détail avec écarts et valorisation
  async findOne(id: string) {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id },
      include: {
        lines: { include: { item: { select: { sku: true, name: true, unit: true, unitPrice: true, location: true } } } },
      },
    });
    if (!count) throw new NotFoundException('Inventaire introuvable.');

    const lines = count.lines
      .map((l) => {
        const expected = Number(l.expectedQuantity);
        const counted = l.countedQuantity === null ? null : Number(l.countedQuantity);
        const variance = counted === null ? null : Number((counted - expected).toFixed(2));
        const price = Number(l.item.unitPrice ?? 0);
        return {
          itemId: l.itemId,
          sku: l.item.sku,
          name: l.item.name,
          unit: l.item.unit,
          location: l.item.location,
          expected,
          counted,
          variance,
          varianceValue: variance === null ? null : Math.round(variance * price),
          note: l.note,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const counted = lines.filter((l) => l.counted !== null);
    const withVariance = counted.filter((l) => (l.variance ?? 0) !== 0);
    return {
      id: count.id,
      siteId: count.siteId,
      location: count.location,
      status: count.status,
      note: count.note,
      createdAt: count.createdAt,
      validatedAt: count.validatedAt,
      summary: {
        articles: lines.length,
        counted: counted.length,
        notCounted: lines.length - counted.length,
        withVariance: withVariance.length,
        totalVarianceValue: withVariance.reduce((s, l) => s + (l.varianceValue ?? 0), 0),
      },
      lines,
    };
  }

  async saveLines(id: string, dto: SaveCountLinesDto) {
    const count = await this.prisma.inventoryCount.findUnique({ where: { id } });
    if (!count) throw new NotFoundException('Inventaire introuvable.');
    if (count.status !== 'OPEN') throw new BadRequestException('Cet inventaire est clos : les quantités ne peuvent plus être modifiées.');

    await this.prisma.$transaction(
      dto.lines.map((l) =>
        this.prisma.inventoryCountLine.updateMany({
          where: { countId: id, itemId: l.itemId },
          data: { countedQuantity: l.countedQuantity, note: l.note },
        }),
      ),
    );
    return this.findOne(id);
  }

  // Validation : le stock est ajusté pour chaque écart (variation appliquée sur le stock courant, donc
  // les mouvements intervenus pendant le comptage ne sont pas perdus). Motif obligatoire.
  async validate(id: string, dto: CloseInventoryCountDto, actorId: string) {
    const adjusted: Array<{ item: any; before: number; after: number }> = [];
    const summary = await this.prisma.$transaction(async (tx) => {
      const count = await tx.inventoryCount.findUnique({ where: { id }, include: { lines: true } });
      if (!count) throw new NotFoundException('Inventaire introuvable.');
      if (count.status !== 'OPEN') throw new BadRequestException('Cet inventaire est déjà clos.');

      let linesAdjusted = 0;
      let totalVarianceValue = 0;
      for (const line of count.lines) {
        if (line.countedQuantity === null) continue;
        const expected = Number(line.expectedQuantity);
        const counted = Number(line.countedQuantity);
        const variance = Number((counted - expected).toFixed(2));
        if (variance === 0) continue;

        const item = await tx.inventoryItem.findUnique({ where: { id: line.itemId } });
        if (!item) continue;
        const before = Number(item.currentQuantity);
        const after = Number((before + variance).toFixed(2));
        if (after < 0) {
          throw new BadRequestException(
            `Ajustement impossible pour « ${item.name} » : le stock deviendrait négatif (${after} ${item.unit}). Recomptez l'article.`,
          );
        }

        const updated = await tx.inventoryItem.update({ where: { id: item.id }, data: { currentQuantity: after } });
        const value = Math.round(Math.abs(variance) * Number(item.unitPrice ?? 0));
        await tx.stockMovement.create({
          data: {
            itemId: item.id,
            siteId: count.siteId,
            movementType: 'ADJUSTMENT',
            quantity: Math.abs(variance),
            unitPrice: item.unitPrice ?? undefined,
            totalValue: item.unitPrice ? value : undefined,
            reference: `INV-${count.id.slice(0, 8)}`,
            reason: `Inventaire physique : écart ${variance > 0 ? '+' : ''}${variance} (compté ${counted}, théorique ${expected}) — ${dto.reason.trim()}`,
            createdById: actorId,
          },
        });
        linesAdjusted += 1;
        totalVarianceValue += Math.round(variance * Number(item.unitPrice ?? 0));
        adjusted.push({ item: updated, before, after });
      }

      await tx.inventoryCount.update({
        where: { id },
        data: { status: 'VALIDATED', validatedById: actorId, validatedAt: new Date() },
      });
      return { linesAdjusted, totalVarianceValue };
    });

    for (const a of adjusted) await alertStockThresholds(this.prisma, a.item, a.before, a.after);

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'InventoryCount',
      entityId: id,
      newValue: { statut: 'VALIDATED', ...summary },
      reason: dto.reason.trim(),
    });
    return { id, status: 'VALIDATED', ...summary };
  }

  async cancel(id: string, dto: CloseInventoryCountDto, actorId: string) {
    const count = await this.prisma.inventoryCount.findUnique({ where: { id } });
    if (!count) throw new NotFoundException('Inventaire introuvable.');
    if (count.status !== 'OPEN') throw new BadRequestException('Cet inventaire est déjà clos.');
    await this.prisma.inventoryCount.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'InventoryCount',
      entityId: id,
      newValue: { statut: 'CANCELLED' },
      reason: dto.reason.trim(),
    });
    return { id, status: 'CANCELLED' };
  }
}
