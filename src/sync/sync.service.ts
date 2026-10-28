import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { SyncOperationDto } from './sync.dto';

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

@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async push(operations: SyncOperationDto[], actorId: string) {
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

        // Déduplication : si cette opération (même client entityId + device) a déjà réussi, on l'ignore.
        const alreadySynced = await this.prisma.syncQueueEntry.findFirst({
          where: {
            entity: op.entity,
            entityId: op.entityId,
            deviceId: op.deviceId,
            status: 'SUCCESS',
            id: { not: queueEntry.id },
          },
        });

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
            await model.updateMany({ where: { id: op.entityId }, data: { deletedAt: new Date() } }).catch(() => {});
            serverId = op.entityId;
          } else {
            // CREATE / UPDATE traités comme un upsert générique
            const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...safePayload } = op.payload as any;
            const created = await model.upsert({
              where: { id: op.entityId },
              create: { id: op.entityId, ...safePayload },
              update: { ...safePayload },
            });
            serverId = created.id;
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
          data: { status: 'FAILED', lastError: err.message, retryCount: { increment: 1 } },
        });
        results.push({ entityId: op.entityId, entity: op.entity, status: 'FAILED', error: err.message });
      }
    }

    const success = results.filter((r) => r.status === 'SUCCESS').length;
    const conflicts = results.filter((r) => r.status === 'CONFLICT').length;
    return {
      summary: `Synchronisation terminée — ${success}/${results.length}` + (conflicts ? ` (${conflicts} conflit(s) à résoudre)` : ''),
      results,
    };
  }

  async pendingCount(deviceId?: string) {
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
