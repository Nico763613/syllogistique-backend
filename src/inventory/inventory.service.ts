import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInventoryItemDto, StockInDto, StockOutDto } from './dto/inventory.dto';

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
    return this.prisma.$transaction(async (tx) => {
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
          reason: dto.observations,
          createdById: actorId,
        },
      });

      const updatedItem = await tx.inventoryItem.update({
        where: { id: dto.itemId },
        data: { currentQuantity: { increment: dto.quantity } },
      });

      await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'StockMovement', entityId: movement.id, newValue: dto });

      return { movement, item: updatedItem };
    });
  }

  // Sortie de stock : bloquée si quantité > stock disponible (sauf autorisation spéciale)
  async stockOut(dto: StockOutDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
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

      return { movement, item: updatedItem };
    });
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
}
