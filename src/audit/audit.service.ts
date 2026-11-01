import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface AuditLogInput {
  userId?: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  // Motif obligatoire pour toute correction d'erreur (conservé dans newValue.motif)
  reason?: string;
  deviceId?: string;
  ipAddress?: string;
}

// Traçabilité : chaque opération critique doit être enregistrée
// (utilisateur, date, heure, ancienne/nouvelle valeur, motif — voir cahier des charges §18)
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // Les Decimal/Date Prisma sont convertis en JSON pur avant d'être stockés
  private clean(v: unknown) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  async log(input: AuditLogInput) {
    let newValue: unknown = this.clean(input.newValue);
    if (input.reason) {
      const base =
        input.newValue && typeof input.newValue === 'object' && !Array.isArray(input.newValue)
          ? (newValue as Record<string, unknown>)
          : input.newValue !== undefined
            ? { valeur: newValue }
            : {};
      newValue = { ...base, motif: input.reason };
    }
    return this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        oldValue: this.clean(input.oldValue) as any,
        newValue: newValue as any,
        deviceId: input.deviceId,
        ipAddress: input.ipAddress,
      },
    });
  }

  async findForEntity(entity: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Consultation du journal (Administrateur) avec filtres
  async search(params: { entity?: string; entityId?: string; userId?: string; from?: string; to?: string; limit?: number }) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(params.entity ? { entity: params.entity } : {}),
        ...(params.entityId ? { entityId: params.entityId } : {}),
        ...(params.userId ? { userId: params.userId } : {}),
        ...(params.from || params.to
          ? {
              createdAt: {
                ...(params.from ? { gte: new Date(params.from) } : {}),
                ...(params.to ? { lte: new Date(params.to) } : {}),
              },
            }
          : {}),
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(params.limit ?? 100, 1), 500),
    });
  }
}
