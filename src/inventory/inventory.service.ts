import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransferStockDto, CorrectStockMovementDto, CreateInventoryItemDto, StockInDto, StockOutDto, UpdateInventoryItemDto } from './dto/inventory.dto';
import { getIssuer } from '../common/issuer';
import { startDoc, keyValues, signatures, NAVY, GOLD, fmtN } from '../common/pdf-doc';
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

      // Lot (traçabilité / péremption) : un même numéro de lot s'additionne
      let lotId: string | undefined;
      if (dto.lotNumber?.trim()) {
        const lotNumber = dto.lotNumber.trim();
        const lot = await tx.stockLot.findFirst({ where: { itemId: dto.itemId, siteId: dto.siteId, lotNumber } });
        if (lot) {
          await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: { increment: dto.quantity } } });
          lotId = lot.id;
        } else {
          const created = await tx.stockLot.create({
            data: {
              itemId: dto.itemId, siteId: dto.siteId, locationId: dto.locationId ?? item.locationId, lotNumber,
              quantity: dto.quantity, unitCost: dto.unitPrice ?? Number(item.unitPrice ?? 0),
              expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
            },
          });
          lotId = created.id;
        }
      } else if (item.hasExpiry) {
        throw new BadRequestException('Article périssable : indiquez le numéro de lot et la date de péremption.');
      }

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
          reasonCode: dto.reasonCode ?? 'RECEIPT',
          lotId,
          toLocationId: dto.locationId ?? item.locationId ?? undefined,
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

      // Consommation des lots : le plus proche de la péremption d'abord (FEFO), sinon FIFO — ou LIFO si l'article l'exige
      let lotId: string | undefined;
      const lots = await tx.stockLot.findMany({ where: { itemId: dto.itemId, siteId: dto.siteId, quantity: { gt: 0 } } });
      if (lots.length) {
        const far = 8.64e15;
        const ordered = [...lots].sort((a, b) => {
          const ea = a.expiryDate ? +a.expiryDate : far;
          const eb = b.expiryDate ? +b.expiryDate : far;
          if (ea !== eb) return ea - eb;
          return item.valuationMethod === 'LIFO' ? +b.receivedAt - +a.receivedAt : +a.receivedAt - +b.receivedAt;
        });
        let left = dto.quantity;
        for (const lot of ordered) {
          if (left <= 0) break;
          const take = Math.min(Number(lot.quantity), left);
          await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: { decrement: take } } });
          lotId ??= lot.id;
          left -= take;
        }
      }

      const movement = await tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          siteId: dto.siteId,
          movementType: 'OUT',
          quantity: dto.quantity,
          vehicleId: dto.vehicleId,
          reason: dto.reason,
          reasonCode: dto.reasonCode ?? 'CONSUMPTION',
          lotId,
          fromLocationId: dto.locationId ?? item.locationId ?? undefined,
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

  // ---- Journal des mouvements (fiche de stock) ----

  async movements(params: { siteId?: string; itemId?: string; type?: string; from?: string; to?: string; limit?: number }) {
    return this.prisma.stockMovement.findMany({
      where: {
        ...(params.siteId ? { siteId: params.siteId } : {}),
        ...(params.itemId ? { itemId: params.itemId } : {}),
        ...(params.type ? { movementType: params.type as any } : {}),
        ...(params.from || params.to
          ? {
              createdAt: {
                ...(params.from ? { gte: new Date(params.from) } : {}),
                ...(params.to ? { lt: new Date(new Date(params.to).getTime() + 86400000) } : {}),
              },
            }
          : {}),
      },
      include: {
        item: { select: { sku: true, name: true, unit: true, location: true } },
        vehicle: { select: { internalNumber: true, registrationNumber: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(params.limit ?? 100, 1), 2000),
    });
  }

  async movementsExcel(params: { siteId?: string; itemId?: string; type?: string; from?: string; to?: string }): Promise<Buffer> {
    const rows = await this.movements({ ...params, limit: 2000 });
    const labels: Record<string, string> = { IN: 'Entrée', OUT: 'Sortie', ADJUSTMENT: 'Ajustement', TRANSFER: 'Transfert' };
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SYL LOGISTIQUE';
    const sheet = workbook.addWorksheet('Mouvements de stock');
    sheet.addRow(['Date', 'Type', 'Code', 'Article', 'Quantité', 'Unité', 'Entrepôt', 'Véhicule', 'Référence', 'Motif', 'Saisi par']);
    sheet.getRow(1).font = { bold: true };
    for (const m of rows) {
      sheet.addRow([
        new Date(m.createdAt).toLocaleString('fr-FR'),
        labels[m.movementType] ?? m.movementType,
        m.item.sku,
        m.item.name,
        Number(m.quantity),
        m.item.unit,
        m.item.location ?? '',
        m.vehicle?.internalNumber ?? '',
        m.reference ?? '',
        m.reason ?? '',
        m.createdBy ? `${m.createdBy.firstName} ${m.createdBy.lastName}` : '',
      ]);
    }
    [20, 12, 14, 30, 12, 10, 16, 12, 16, 50, 24].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // ---- Analyse : consommation, couverture en jours, état et quantité conseillée à commander ----

  async analysis(siteId: string, days = 30) {
    if (!siteId) throw new BadRequestException('Le site (siteId) est obligatoire.');
    const period = Math.min(Math.max(Math.round(days) || 30, 1), 365);
    const since = new Date(Date.now() - period * 86400000);
    const [items, outs] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { siteId },
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.stockMovement.groupBy({
        by: ['itemId'],
        where: { siteId, movementType: 'OUT', createdAt: { gte: since } },
        _sum: { quantity: true },
      }),
    ]);
    const consumedBy = new Map(outs.map((o) => [o.itemId, Number(o._sum.quantity ?? 0)]));

    return items.map((i) => {
      const current = Number(i.currentQuantity);
      const min = Number(i.minimumQuantity);
      const max = i.maximumQuantity === null ? null : Number(i.maximumQuantity);
      const consumed = consumedBy.get(i.id) ?? 0;
      const avgDaily = Number((consumed / period).toFixed(2));
      const coverageDays = avgDaily > 0 ? Number((current / avgDaily).toFixed(1)) : null;
      const state =
        current <= 0 ? 'RUPTURE' : current < min ? 'SOUS_SEUIL' : max !== null && current > max ? 'SURSTOCK' : 'OK';
      // À commander : sous le seuil minimum, ou moins de 7 jours de couverture
      const needsOrder = state === 'RUPTURE' || state === 'SOUS_SEUIL' || (coverageDays !== null && coverageDays < 7);
      const target = max ?? Math.max(min * 2, avgDaily * 30);
      const suggestedQuantity = needsOrder ? Math.max(0, Math.ceil(target - current)) : 0;
      return {
        itemId: i.id,
        sku: i.sku,
        name: i.name,
        unit: i.unit,
        location: i.location,
        supplierId: i.supplierId,
        supplierName: i.supplier?.name ?? null,
        currentQuantity: current,
        minimumQuantity: min,
        maximumQuantity: max,
        unitPrice: Number(i.unitPrice ?? 0),
        consumed,
        avgDaily,
        coverageDays,
        state,
        suggestedQuantity,
      };
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

  // Catégories de stock pour les formulaires et filtres
  categories() {
    return this.prisma.stockCategory.findMany({ orderBy: { name: 'asc' } });
  }

  // Bon de sortie / de livraison : sorties de stock d'une période, à faire signer par le bénéficiaire
  async deliveryNotePdf(params: { siteId: string; from?: string; to?: string; beneficiary?: string }, userId: string): Promise<Buffer> {
    if (!params.siteId) throw new BadRequestException('Le site (siteId) est obligatoire.');
    const site = await this.prisma.site.findUnique({ where: { id: params.siteId }, include: { organization: true } });
    if (!site) throw new NotFoundException('Site introuvable.');
    const rows = (await this.movements({ siteId: params.siteId, type: 'OUT', from: params.from, to: params.to, limit: 500 })).reverse();
    if (rows.length === 0) throw new BadRequestException('Aucune sortie de stock sur cette période.');
    const issuer = await getIssuer(this.prisma, userId);
    const d = (v?: string) => (v ? new Date(v).toLocaleDateString('fr-FR') : '');

    const { doc, done } = startDoc(site.organization?.name ?? 'SYL LOGISTIQUE', 'BON DE SORTIE / LIVRAISON');
    keyValues(doc, [
      ['Site', site.name],
      ['Période', params.from || params.to ? `${d(params.from) || '…'} au ${d(params.to) || '…'}` : 'Toutes les sorties récentes'],
      ['Bénéficiaire', params.beneficiary ?? ''],
    ]);
    doc.moveDown();
    const x = [50, 105, 260, 330, 400];
    let y = doc.y;
    doc.fillColor(NAVY);
    ['Date', 'Article', 'Qté', 'Véhicule', 'Motif'].forEach((h, i) => doc.text(h, x[i], y));
    y += 16;
    doc.moveTo(50, y - 2).lineTo(545, y - 2).strokeColor(GOLD).stroke();
    doc.fillColor('#000000');
    let total = 0;
    for (const m of rows) {
      if (y > 700) { doc.addPage(); y = 50; }
      total += Number(m.totalValue ?? 0);
      doc.text(new Date(m.createdAt).toLocaleDateString('fr-FR'), x[0], y, { width: 52 });
      doc.text(`${m.item.sku} ${m.item.name}`, x[1], y, { width: 150 });
      doc.text(`${fmtN(Number(m.quantity))} ${m.item.unit}`, x[2], y, { width: 68 });
      doc.text(m.vehicle?.internalNumber ?? '', x[3], y, { width: 68 });
      doc.text(m.reason ?? '', x[4], y, { width: 145 });
      y += 22;
    }
    doc.moveTo(50, y).lineTo(545, y).strokeColor(GOLD).stroke();
    if (total) doc.fillColor(NAVY).text(`Valeur totale : ${fmtN(total)} GNF`, 50, y + 8, { align: 'right', width: 495 });
    doc.fillColor('#000000');
    doc.y = y + 30;
    signatures(doc, issuer, 'Reçu par (nom, signature)');
    doc.end();
    return done;
  }

  // Transfert entre sites / entrepôts : sortie à la source + entrée à la destination, atomiques.
  // L'article est créé à destination (même code) s'il n'y existe pas encore ; les valeurs totales restent cohérentes.
  async transfer(dto: TransferStockDto, actorId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const source = await tx.inventoryItem.findUnique({ where: { id: dto.itemId }, include: { site: true } });
      if (!source) throw new NotFoundException('Article introuvable.');
      if (source.siteId === dto.toSiteId) throw new BadRequestException('Le site de destination doit être différent de la source.');
      const target = await tx.site.findUnique({ where: { id: dto.toSiteId } });
      if (!target || target.organizationId !== source.site.organizationId) {
        throw new BadRequestException('Site de destination invalide.');
      }
      if (Number(source.currentQuantity) < dto.quantity) {
        throw new BadRequestException(`Stock insuffisant. Disponible : ${source.currentQuantity} ${source.unit}, demandé : ${dto.quantity}.`);
      }

      let dest = await tx.inventoryItem.findFirst({ where: { siteId: dto.toSiteId, sku: source.sku } });
      if (!dest) {
        dest = await tx.inventoryItem.create({
          data: {
            siteId: dto.toSiteId,
            sku: source.sku,
            name: source.name,
            description: source.description,
            brand: source.brand,
            reference: source.reference,
            unit: source.unit,
            unitPrice: source.unitPrice,
            supplierId: source.supplierId,
            categoryId: source.categoryId,
            qrCode: source.sku,
          },
        });
      }
      const destBefore = Number(dest.currentQuantity);
      const ref = `TR-${Date.now().toString(36).toUpperCase()}`;
      const totalValue = source.unitPrice ? Number((Number(source.unitPrice) * dto.quantity).toFixed(2)) : undefined;

      const out = await tx.stockMovement.create({
        data: { itemId: source.id, siteId: source.siteId, movementType: 'TRANSFER', quantity: dto.quantity, reference: ref, unitPrice: source.unitPrice ?? undefined, totalValue, reason: `Transfert vers ${target.name} — ${dto.reason.trim()}`, createdById: actorId },
      });
      await tx.stockMovement.create({
        data: { itemId: dest.id, siteId: dto.toSiteId, movementType: 'TRANSFER', quantity: dto.quantity, reference: ref, unitPrice: source.unitPrice ?? undefined, totalValue, reason: `Transfert depuis ${source.site.name} — ${dto.reason.trim()}`, createdById: actorId },
      });
      const updatedSource = await tx.inventoryItem.update({ where: { id: source.id }, data: { currentQuantity: { decrement: dto.quantity } } });
      const updatedDest = await tx.inventoryItem.update({ where: { id: dest.id }, data: { currentQuantity: { increment: dto.quantity } } });
      await this.audit.log({
        userId: actorId, action: 'CREATE', entity: 'StockMovement', entityId: out.id,
        newValue: { reference: ref, article: source.sku, quantite: dto.quantity, de: source.site.name, vers: target.name }, reason: dto.reason.trim(),
      });
      return { ref, updatedSource, updatedDest, sourceBefore: Number(source.currentQuantity), destBefore, from: source.site.name, to: target.name };
    });
    await alertStockThresholds(this.prisma, result.updatedSource, result.sourceBefore, Number(result.updatedSource.currentQuantity));
    await alertStockThresholds(this.prisma, result.updatedDest, result.destBefore, Number(result.updatedDest.currentQuantity));
    return { reference: result.ref, from: result.from, to: result.to, sourceQuantity: Number(result.updatedSource.currentQuantity), destinationQuantity: Number(result.updatedDest.currentQuantity) };
  }
}
