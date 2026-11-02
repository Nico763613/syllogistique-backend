import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CorrectStockMovementDto, CreateInventoryItemDto, StockInDto, StockOutDto, UpdateInventoryItemDto } from './dto/inventory.dto';
import { alertStockThresholds } from '../common/stock-alerts';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async createItem(dto: CreateInventoryItemDto, actorId: string) {
    const existing = await this.prisma.inventoryItem.findFirst({ where: { siteId: dto.siteId, sku: dto.sku } });
    if (existing) throw new ConflictException('Ce code article existe déjà sur ce site.');

    const item = await this.prisma.inventoryItem.create({
      data: { ...dto, qrCode: dto.sku },
    });
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'InventoryItem', entityId: item.id, newValue: dto });
    return item;
  }

  // Modification d'un article et de ses seuils d'alerte (minimum / maximum) — motif obligatoire.
  async updateItem(id: string, dto: UpdateInventoryItemDto, actorId: string) {
    const before = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Article introuvable.');

    const min = dto.minimumQuantity ?? Number(before.minimumQuantity);
    const max = dto.maximumQuantity ?? (before.maximumQuantity === null ? undefined : Number(before.maximumQuantity));
    if (max !== undefined && max < min) {
      throw new BadRequestException('Le seuil maximum ne peut pas être inférieur au seuil minimum.');
    }

    const { reason, ...fields } = dto;
    const updated = await this.prisma.inventoryItem.update({ where: { id }, data: fields });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'InventoryItem',
      entityId: id,
      oldValue: before,
      newValue: updated,
      reason: reason.trim(),
    });
    return updated;
  }

  findAll(params: { siteId?: string; categoryId?: string; belowMinimum?: boolean }) {
    return this.prisma.inventoryItem.findMany({
      where: {
        ...(params.siteId ? { siteId: params.siteId } : {}),
        ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      },
      include: { category: true, supplier: true },
      orderBy: { name: 'asc' },
    }).then((items) =>
      params.belowMinimum
        ? items.filter((i) => Number(i.currentQuantity) < Number(i.minimumQuantity))
        : items,
    );
  }

  async findOne(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: { movements: { take: 20, orderBy: { createdAt: 'desc' } }, category: true, supplier: true },
    });
    if (!item) throw new NotFoundException('Article introuvable.');
    return item;
  }

  // Entrée de stock : Stock final = Stock initial + Entrée
  async stockIn(dto: StockInDto, actorId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({ where: { id: dto.itemId } });
      if (!item) throw new NotFoundException('Article introuvable.');

      const totalValue = dto.unitPrice ? Number((dto.unitPrice * dto.quantity).toFixed(2)) : undefined;

      const movement = await tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          siteId: dto.siteId,
          movementType: 'IN',
          quantity: dto.quantity,
          supplierId: dto.supplierId,
          reference: dto.reference,
          unitPrice: dto.unitPrice,
          totalValue,
          reason: dto.reason ?? dto.observations,
          createdById: actorId,
        },
      });

      const updatedItem = await tx.inventoryItem.update({
        where: { id: dto.itemId },
        data: { currentQuantity: { increment: dto.quantity } },
      });

      await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'StockMovement', entityId: movement.id, newValue: dto });

      return { movement, item: updatedItem, before: Number(item.currentQuantity) };
    });
    // Alerte instantanée si un seuil (rupture / minimum / maximum) vient d'être franchi
    await alertStockThresholds(this.prisma, result.item, result.before, Number(result.item.currentQuantity));
    return { movement: result.movement, item: result.item };
  }

  // Sortie de stock : bloquée si quantité > stock disponible (sauf autorisation spéciale)
  async stockOut(dto: StockOutDto, actorId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({ where: { id: dto.itemId } });
      if (!item) throw new NotFoundException('Article introuvable.');

      if (!dto.allowNegative && Number(item.currentQuantity) < dto.quantity) {
        throw new BadRequestException(
          `Stock insuffisant. Disponible : ${item.currentQuantity} ${item.unit}, demandé : ${dto.quantity}.`,
        );
      }

      const totalValue = item.unitPrice ? Number((Number(item.unitPrice) * dto.quantity).toFixed(2)) : undefined;

      const movement = await tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          siteId: dto.siteId,
          movementType: 'OUT',
          quantity: dto.quantity,
          vehicleId: dto.vehicleId,
          reason: dto.reason,
          unitPrice: item.unitPrice ?? undefined,
          totalValue,
          createdById: actorId,
        },
      });

      const updatedItem = await tx.inventoryItem.update({
        where: { id: dto.itemId },
        data: { currentQuantity: { decrement: dto.quantity } },
      });

      await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'StockMovement', entityId: movement.id, newValue: dto });

      return { movement, item: updatedItem, before: Number(item.currentQuantity) };
    });
    // Alerte instantanée si un seuil (rupture / minimum / maximum) vient d'être franchi
    await alertStockThresholds(this.prisma, result.item, result.before, Number(result.item.currentQuantity));
    return { movement: result.movement, item: result.item };
  }

  // Correction d'une erreur de saisie (quantité d'une entrée ou d'une sortie) : le stock est
  // recalculé automatiquement, l'ancienne et la nouvelle valeur sont journalisées avec le motif.
  async correctMovement(id: string, dto: CorrectStockMovementDto, actorId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.findUnique({ where: { id } });
      if (!movement) throw new NotFoundException('Mouvement introuvable.');
      if (movement.movementType !== 'IN' && movement.movementType !== 'OUT') {
        throw new BadRequestException('Seuls les mouvements d\'entrée et de sortie peuvent être corrigés.');
      }
      const item = await tx.inventoryItem.findUnique({ where: { id: movement.itemId } });
      if (!item) throw new NotFoundException('Article introuvable.');

      const oldQuantity = Number(movement.quantity);
      const delta = (dto.quantity - oldQuantity) * (movement.movementType === 'IN' ? 1 : -1);
      const newStock = Number(item.currentQuantity) + delta;
      if (!dto.allowNegative && newStock < 0) {
        throw new BadRequestException(
          `Correction impossible : le stock deviendrait négatif (${newStock} ${item.unit}).`,
        );
      }

      const totalValue = movement.unitPrice ? Number((Number(movement.unitPrice) * dto.quantity).toFixed(2)) : undefined;
      const updatedMovement = await tx.stockMovement.update({
        where: { id },
        data: { quantity: dto.quantity, totalValue },
      });
      const updatedItem = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { currentQuantity: { increment: delta } },
      });
      return { movement, updatedMovement, item, updatedItem };
    });

    await alertStockThresholds(
      this.prisma,
      result.updatedItem,
      Number(result.item.currentQuantity),
      Number(result.updatedItem.currentQuantity),
    );

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'StockMovement',
      entityId: id,
      oldValue: { quantity: result.movement.quantity, stockArticle: result.item.currentQuantity },
      newValue: { quantity: result.updatedMovement.quantity, stockArticle: result.updatedItem.currentQuantity },
      reason: dto.reason.trim(),
    });
    return { movement: result.updatedMovement, item: result.updatedItem };
  }

  async valuation(siteId: string) {
    const items = await this.prisma.inventoryItem.findMany({ where: { siteId } });
    const totalValue = items.reduce(
      (sum, i) => sum + Number(i.currentQuantity) * Number(i.unitPrice ?? 0),
      0,
    );
    const belowMinimum = items.filter((i) => Number(i.currentQuantity) < Number(i.minimumQuantity)).length;
    return { totalItems: items.length, totalValue, belowMinimum };
  }

  // Catégories de stock pour les formulaires et filtres
  categories() {
    return this.prisma.stockCategory.findMany({ orderBy: { name: 'asc' } });
  }
}
