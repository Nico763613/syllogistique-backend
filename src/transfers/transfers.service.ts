import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { CancelTransferDto, CreateTransferDto, ReceiveTransferDto } from './dto/transfer.dto';

// Transferts inter-sites : l'expédition sort le stock du site d'origine (statut EN TRANSIT),
// la réception l'entre dans le site de destination. Tant que le transfert n'est pas reçu,
// la marchandise n'est comptée dans aucun des deux sites.
@Injectable()
export class TransfersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async nextReference() {
    const year = new Date().getFullYear();
    const count = await this.prisma.stockTransfer.count({ where: { reference: { startsWith: `TR-${year}-` } } });
    return `TR-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private assertSite(actor: Actor, siteId: string) {
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && actor.siteId !== siteId) {
      throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
    }
  }

  // Expédie : crée le transfert et sort le stock de l'origine
  async create(dto: CreateTransferDto, actor: Actor) {
    if (dto.fromSiteId === dto.toSiteId) throw new BadRequestException("Les sites d'origine et de destination doivent être différents.");
    this.assertSite(actor, dto.fromSiteId);
    const reference = await this.nextReference();

    return this.prisma.$transaction(async (tx) => {
      const sites = await tx.site.count({ where: { id: { in: [dto.fromSiteId, dto.toSiteId] } } });
      if (sites !== 2) throw new NotFoundException('Site introuvable.');

      const transfer = await tx.stockTransfer.create({
        data: {
          reference,
          fromSiteId: dto.fromSiteId,
          toSiteId: dto.toSiteId,
          fromLocationId: dto.fromLocationId,
          toLocationId: dto.toLocationId,
          status: 'IN_TRANSIT',
          shippedAt: new Date(),
          createdBy: actor.userId,
          lines: { create: dto.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })) },
        },
        include: { lines: true },
      });

      for (const l of dto.lines) {
        const item = await tx.inventoryItem.findUnique({ where: { id: l.itemId } });
        if (!item || item.siteId !== dto.fromSiteId) throw new BadRequestException(`Article introuvable sur le site d'origine : ${l.itemId}`);
        if (Number(item.currentQuantity) < l.quantity) {
          throw new BadRequestException(`Stock insuffisant pour ${item.name} : ${item.currentQuantity} ${item.unit} disponible(s).`);
        }
        await tx.inventoryItem.update({ where: { id: item.id }, data: { currentQuantity: { decrement: l.quantity } } });
        await tx.stockMovement.create({
          data: {
            itemId: item.id, siteId: dto.fromSiteId, movementType: 'TRANSFER', quantity: l.quantity,
            unitPrice: item.unitPrice ?? undefined,
            totalValue: item.unitPrice ? Number((Number(item.unitPrice) * l.quantity).toFixed(2)) : undefined,
            reason: `Transfert sortant ${reference}`, reference, transferId: transfer.id,
            fromLocationId: dto.fromLocationId, createdById: actor.userId,
          },
        });
      }
      await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'StockTransfer', entityId: transfer.id, newValue: dto });
      return transfer;
    });
  }

  // Réceptionne : entre le stock sur le site de destination (article homologue par SKU, créé au besoin)
  async receive(id: string, _dto: ReceiveTransferDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: { lines: { include: { item: true } } } });
      if (!transfer) throw new NotFoundException('Transfert introuvable.');
      this.assertSite(actor, transfer.toSiteId);
      if (transfer.status !== 'IN_TRANSIT') throw new BadRequestException("Ce transfert n'est pas en transit.");

      for (const l of transfer.lines) {
        let target = await tx.inventoryItem.findFirst({ where: { siteId: transfer.toSiteId, sku: l.item.sku, deletedAt: null } });
        if (!target) {
          target = await tx.inventoryItem.create({
            data: {
              siteId: transfer.toSiteId, categoryId: l.item.categoryId, sku: l.item.sku, name: l.item.name,
              description: l.item.description, brand: l.item.brand, reference: l.item.reference, unit: l.item.unit,
              unitPrice: l.item.unitPrice ?? undefined, minimumQuantity: 0, currentQuantity: 0,
              valuationMethod: l.item.valuationMethod, hasExpiry: l.item.hasExpiry, isHazardous: l.item.isHazardous,
            },
          });
        }
        await tx.inventoryItem.update({ where: { id: target.id }, data: { currentQuantity: { increment: Number(l.quantity) } } });
        await tx.stockMovement.create({
          data: {
            itemId: target.id, siteId: transfer.toSiteId, movementType: 'TRANSFER', quantity: Number(l.quantity),
            unitPrice: l.item.unitPrice ?? undefined,
            totalValue: l.item.unitPrice ? Number((Number(l.item.unitPrice) * Number(l.quantity)).toFixed(2)) : undefined,
            reason: `Transfert entrant ${transfer.reference}`, reference: transfer.reference ?? undefined,
            transferId: transfer.id, toLocationId: transfer.toLocationId, createdById: actor.userId,
          },
        });
      }
      const updated = await tx.stockTransfer.update({
        where: { id }, data: { status: 'RECEIVED', receivedAt: new Date(), receivedBy: actor.userId },
      });
      await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'StockTransfer', entityId: id, newValue: { status: 'RECEIVED' } });
      return updated;
    });
  }

  // Annule un transfert en transit : la marchandise retourne au stock d'origine
  async cancel(id: string, dto: CancelTransferDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: { lines: true } });
      if (!transfer) throw new NotFoundException('Transfert introuvable.');
      this.assertSite(actor, transfer.fromSiteId);
      if (transfer.status !== 'IN_TRANSIT') throw new BadRequestException("Seul un transfert en transit peut être annulé.");
      for (const l of transfer.lines) {
        await tx.inventoryItem.update({ where: { id: l.itemId }, data: { currentQuantity: { increment: Number(l.quantity) } } });
        await tx.stockMovement.create({
          data: {
            itemId: l.itemId, siteId: transfer.fromSiteId, movementType: 'TRANSFER', quantity: Number(l.quantity),
            reason: `Annulation transfert ${transfer.reference} : ${dto.reason.trim()}`, reference: transfer.reference ?? undefined,
            transferId: transfer.id, createdById: actor.userId,
          },
        });
      }
      const updated = await tx.stockTransfer.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'StockTransfer', entityId: id, newValue: { status: 'CANCELLED' }, reason: dto.reason.trim() });
      return updated;
    });
  }

  findAll(actor: Actor, params: { siteId?: string; status?: string }) {
    const scope = actor.role !== 'SUPER_ADMIN' && actor.siteId ? actor.siteId : params.siteId;
    return this.prisma.stockTransfer.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(scope ? { OR: [{ fromSiteId: scope }, { toSiteId: scope }] } : {}),
      },
      include: { lines: { include: { item: { select: { name: true, unit: true } } } }, fromSite: { select: { name: true } }, toSite: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, actor: Actor) {
    const t = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { lines: { include: { item: { select: { name: true, unit: true } } } }, fromSite: true, toSite: true },
    });
    if (!t) throw new NotFoundException('Transfert introuvable.');
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && actor.siteId !== t.fromSiteId && actor.siteId !== t.toSiteId) {
      throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
    }
    return t;
  }
}
