import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface AuditLogInput {
  userId?: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  deviceId?: string;
  ipAddress?: string;
}

// Traçabilité : chaque opération critique doit être enregistrée
// (utilisateur, date, heure, ancienne/nouvelle valeur — voir cahier des charges §18)
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(input: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        oldValue: input.oldValue as any,
        newValue: input.newValue as any,
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
}
