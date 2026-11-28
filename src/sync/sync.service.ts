import { assertNoConflict } from './versioning';
import { conflictAppliers } from './conflicts.service';
import { Injectable, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { SyncOperationDto } from './sync.dto';
import { currentFuelPrice } from '../common/fuel-price';
import { alertStockThresholds } from '../common/stock-alerts';
import { ENTITY_DEPARTMENTS, departmentAllows } from '../common/departments';

// Moteur de synchronisation Offline → Online (§14-15 du cahier des charges).
// Le client envoie un lot d'opérations enregistrées hors connexion ; chacune
// est rejouée côté serveur, historisée dans sync_queue, et déduplicable via
// (entity, entityId, deviceId).
const ENTITY_MODELS: Record<string, keyof PrismaService> = {
  Trip: 'trip',
  FuelTransaction: 'fuelTransaction',
  Maintenance: 'maintenance',
  DriverAttendance: 'driverAttendance',
  InventoryItem: 'inventoryItem',
  StockMovement: 'stockMovement',
  Vehicle: 'vehicle',
  Driver: 'driver',
};

// Champs que le client hors ligne n'a JAMAIS le droit d'écrire : ils ne changent que par les flux métier
// (stock via mouvements, facturation via factures, périmètre via le site de l'utilisateur).
const PROTECTED_FIELDS: Record<string, string[]> = {
  _all: ['organizationId', 'siteId', 'version'],
  Trip: ['billedInvoiceId', 'createdById', 'reference'],
  InventoryItem: ['currentQuantity'],
  StockMovement: ['createdById'],
  FuelTransaction: ['createdById'],
  Vehicle: ['currentMileage'],
};

@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService, private audit: AuditService) {
    // Arbitrage « appliquer la saisie » d'un conflit venu de la synchronisation du bureau.
    conflictAppliers.set('SYNC_BUREAU', async (c: any, resolverId: string) => {
      const { baseVersion: _v, baseUpdatedAt: _u, ...op } = c.client_payload || {};
      return this.push([op], resolverId, c.organization_id);
    });
  }

  async push(
    operations: SyncOperationDto[],
    actorId: string,
    organizationId?: string,
    actor?: { role?: string; department?: string | null; siteId?: string | null },
  ) {
    const results: Array<{
      entityId: string;
      entity: string;
      status: string;
      serverId?: string;
      error?: string;
      serverVersion?: unknown;
    }> = [];

    for (const op of operations) {
      const queueEntry = await this.prisma.syncQueueEntry.create({
        data: {
          entity: op.entity,
          entityId: op.entityId,
          operation: op.operation,
          payload: op.payload as any,
          deviceId: op.deviceId,
          status: 'SYNCING',
        },
      });

      try {
        const modelKey = ENTITY_MODELS[op.entity];
        if (!modelKey) throw new BadRequestException(`Entité de synchronisation inconnue : ${op.entity}`);

        // Cloisonnement par département : on ne synchronise que les entités de son département.
        const allowedDepartments = ENTITY_DEPARTMENTS[op.entity];
        if (actor && allowedDepartments && !departmentAllows(actor, allowedDepartments)) {
          throw new ForbiddenException(`Action réservée au département : ${allowedDepartments.join(' / ')}.`);
        }

        // Déduplication : si cette opération (même client entityId + device) a déjà réussi, on l'ignore.
        // Seul un RENVOI à l'identique (même appareil, même opération, même contenu) est ignoré :
        // sans identifiant d'appareil, ou avec un contenu différent, l'opération est bien traitée
        // (sinon une 2e modification de la même fiche serait perdue sans prévenir).
        const sameContent = (a: unknown) => JSON.stringify(a ?? null) === JSON.stringify(op.payload ?? null);
        const alreadySynced = op.deviceId
          ? (await this.prisma.syncQueueEntry.findMany({
              where: {
                entity: op.entity,
                entityId: op.entityId,
                deviceId: op.deviceId,
                operation: op.operation,
                status: 'SUCCESS',
                id: { not: queueEntry.id },
              },
              select: { payload: true },
              take: 20,
              orderBy: { createdAt: 'desc' },
            })).find((e: any) => sameContent(e.payload))
          : undefined;

        // Conflit par numéro de version : une autre personne a modifié la fiche depuis la version connue
        // du client → rien n'est écrasé, la saisie est conservée pour arbitrage.
        if (!alreadySynced && op.operation === 'UPDATE' && op.baseVersion && organizationId) {
          try {
            await assertNoConflict(this.prisma, { entity: op.entity, entityId: op.entityId, baseVersion: op.baseVersion, userId: actorId, organizationId, source: 'SYNC_BUREAU', payload: op });
          } catch (e: any) {
            if (!(e instanceof ConflictException)) throw e;
            const body: any = e.getResponse();
            await this.prisma.syncQueueEntry.update({ where: { id: queueEntry.id }, data: { status: 'FAILED', lastError: 'CONFLICT : ' + body.conflictId } });
            results.push({ entityId: op.entityId, entity: op.entity, status: 'CONFLICT', error: body.message, conflictId: body.conflictId, serverVersion: body.currentVersion } as any);
            continue;
          }
        }
        // Détection de conflit (§26) : si la fiche a été modifiée sur le serveur après la version
        // connue du client, on ne l'écrase PAS silencieusement — on la signale pour résolution.
        if (!alreadySynced && op.operation === 'UPDATE' && op.baseUpdatedAt) {
          const current = await (this.prisma[modelKey] as any).findUnique({ where: { id: op.entityId } });
          const base = new Date(op.baseUpdatedAt);
          if (current?.updatedAt && !isNaN(base.getTime()) && new Date(current.updatedAt) > base) {
            await this.prisma.syncQueueEntry.update({
              where: { id: queueEntry.id },
              data: { status: 'FAILED', lastError: 'CONFLICT : fiche modifiée sur le serveur depuis la dernière synchronisation.' },
            });
            results.push({
              entityId: op.entityId,
              entity: op.entity,
              status: 'CONFLICT',
              error: 'Fiche modifiée par un autre utilisateur — résolution requise.',
              serverVersion: current,
            });
            continue;
          }
        }

        let serverId: string | undefined;
        if (alreadySynced) {
          serverId = op.entityId;
        } else {
          const model = this.prisma[modelKey] as any;
          if (op.operation === 'DELETE') {
            const scopeWhere = actor?.role !== 'SUPER_ADMIN' && actor?.siteId && op.entity !== 'Maintenance'
              ? { id: op.entityId, siteId: actor.siteId } : { id: op.entityId };
            await model.updateMany({ where: scopeWhere, data: { deletedAt: new Date() } }).catch(() => {});
            serverId = op.entityId;
          } else {
            // CREATE / UPDATE traités comme un upsert générique
            const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...safePayload } = op.payload as any;

            // Liste noire de champs sensibles (voir PROTECTED_FIELDS) — jamais pris du client.
            for (const f of [...PROTECTED_FIELDS._all, ...(PROTECTED_FIELDS[op.entity] || [])]) delete safePayload[f];

            // Le tarif carburant central fait foi : prix et total sont recalculés côté serveur.
            if (op.entity === 'FuelTransaction' && organizationId && Number(safePayload.quantityLiters) > 0) {
              const price = await currentFuelPrice(this.prisma, organizationId);
              safePayload.pricePerLiter = price;
              safePayload.totalCost = Number((Number(safePayload.quantityLiters) * price).toFixed(2));
            }
            if (op.entity === 'StockMovement') safePayload.createdById = actorId;

            // Un mouvement de stock créé hors ligne doit mettre à jour le stock de l'article (une seule fois).
            const existingRecord = await model.findUnique({ where: { id: op.entityId } });

            // Périmètre : un utilisateur rattaché à un site ne touche que les fiches de son site.
            const scoped = actor?.role !== 'SUPER_ADMIN' && !!actor?.siteId;
            if (existingRecord && scoped && existingRecord.siteId && existingRecord.siteId !== actor!.siteId) {
              throw new ForbiddenException("Cette fiche n'appartient pas à votre site.");
            }
            if (existingRecord && scoped && op.entity === 'Maintenance') {
              const v = await this.prisma.vehicle.findUnique({ where: { id: existingRecord.vehicleId } });
              if (v && v.siteId !== actor!.siteId) throw new ForbiddenException("Cette fiche n'appartient pas à votre site.");
            }
            // Les mouvements de stock sont immuables : on ne les réécrit pas (correction = flux dédié).
            if (op.entity === 'StockMovement' && existingRecord) {
              throw new BadRequestException('Un mouvement de stock enregistré ne peut pas être modifié par synchronisation.');
            }
            // Un trajet déjà facturé ne se modifie plus.
            if (op.entity === 'Trip' && existingRecord?.billedInvoiceId) {
              throw new BadRequestException('Ce trajet est déjà facturé : modification refusée.');
            }
            // Création : le site est celui de l'utilisateur (jamais celui envoyé par le client).
            if (!existingRecord && actor?.siteId && op.entity !== 'Maintenance') safePayload.siteId = actor.siteId;
            if (!existingRecord && op.entity === 'FuelTransaction' && !safePayload.createdById) safePayload.createdById = actorId;
            if (!existingRecord && op.entity === 'Trip' && !safePayload.createdById) safePayload.createdById = actorId;
            // Sortie de stock hors ligne : jamais en dessous de zéro.
            if (op.entity === 'StockMovement' && safePayload.movementType === 'OUT') {
              const it = await this.prisma.inventoryItem.findUnique({ where: { id: safePayload.itemId } });
              if (!it) throw new BadRequestException('Article introuvable.');
              if (scoped && it.siteId !== actor!.siteId) throw new ForbiddenException("Cet article n'appartient pas à votre site.");
              if (Number(it.currentQuantity) < Number(safePayload.quantity)) {
                throw new BadRequestException(`Stock insuffisant pour « ${it.name} » (disponible : ${it.currentQuantity}).`);
              }
            }

            // Fiche existante : simple mise à jour des seuls champs envoyés (une modification partielle
            // faite hors ligne ne doit pas exiger tous les champs obligatoires d'une création).
            const created = existingRecord
              ? await model.update({ where: { id: op.entityId }, data: { ...safePayload } })
              : await model.upsert({
                  where: { id: op.entityId },
                  create: { id: op.entityId, ...safePayload },
                  update: { ...safePayload },
                });
            serverId = created.id;

            if (op.entity === 'StockMovement' && !existingRecord && op.operation === 'CREATE') {
              const qty = Number(created.quantity);
              if (created.movementType === 'IN' || created.movementType === 'OUT') {
                const updatedItem = await this.prisma.inventoryItem.update({
                  where: { id: created.itemId },
                  data: { currentQuantity: created.movementType === 'IN' ? { increment: qty } : { decrement: qty } },
                });
                const afterQty = Number(updatedItem.currentQuantity);
                await alertStockThresholds(this.prisma, updatedItem, created.movementType === 'IN' ? afterQty - qty : afterQty + qty, afterQty);
              }
            }
          }
        }

        await this.prisma.syncQueueEntry.update({
          where: { id: queueEntry.id },
          data: { status: 'SUCCESS', syncedAt: new Date() },
        });

        await this.audit.log({
          userId: actorId,
          action: op.operation,
          entity: op.entity,
          entityId: serverId ?? op.entityId,
          newValue: op.payload,
          deviceId: op.deviceId,
        });

        results.push({ entityId: op.entityId, entity: op.entity, status: 'SUCCESS', serverId });
      } catch (err: any) {
        await this.prisma.syncQueueEntry.update({
          where: { id: queueEntry.id },
          data: { status: 'FAILED', lastError: String(err.message || 'Erreur').slice(0, 500), retryCount: { increment: 1 } },
        });
        const safeMsg = err?.getStatus ? err.message : 'Opération refusée ou invalide (données incorrectes).';
        results.push({ entityId: op.entityId, entity: op.entity, status: 'FAILED', error: safeMsg });
      }
    }

    const success = results.filter((r) => r.status === 'SUCCESS').length;
    const conflicts = results.filter((r) => r.status === 'CONFLICT').length;
    return {
      summary: `Synchronisation terminée — ${success}/${results.length}` + (conflicts ? ` (${conflicts} conflit(s) à résoudre)` : ''),
      results,
    };
  }

  async pendingCount(deviceId?: string, isAdmin = true) {
    if (!isAdmin && !deviceId) return 0;
    return this.prisma.syncQueueEntry.count({
      where: { status: { in: ['PENDING', 'FAILED'] }, ...(deviceId ? { deviceId } : {}) },
    });
  }

  async log(deviceId?: string, limit = 50) {
    return this.prisma.syncQueueEntry.findMany({
      where: deviceId ? { deviceId } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
