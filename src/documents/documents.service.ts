import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';

// Documents des véhicules (§28) : carte grise, assurance, visite technique, etc.
// Les dates d'expiration alimentent les alertes (voir NotificationsService).
@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: CreateDocumentDto, actorId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new BadRequestException('Véhicule inexistant.');
    const doc = await this.prisma.document.create({
      data: {
        vehicleId: dto.vehicleId,
        type: dto.type,
        fileUrl: dto.fileUrl,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      },
    });
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Document', entityId: doc.id, newValue: dto });
    return doc;
  }

  findAll(params: { vehicleId?: string; type?: string; expiringInDays?: number }) {
    const limit = params.expiringInDays != null ? new Date(Date.now() + params.expiringInDays * 86400000) : undefined;
    return this.prisma.document.findMany({
      where: {
        ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
        ...(params.type ? { type: params.type } : {}),
        ...(limit ? { expiryDate: { lte: limit } } : {}),
      },
      include: { vehicle: { select: { internalNumber: true, registrationNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateDocumentDto, actorId: string) {
    const old = await this.prisma.document.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Document introuvable.');
    const doc = await this.prisma.document.update({
      where: { id },
      data: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.fileUrl ? { fileUrl: dto.fileUrl } : {}),
        ...(dto.expiryDate ? { expiryDate: new Date(dto.expiryDate) } : {}),
      },
    });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'Document', entityId: id, oldValue: old, newValue: dto });
    return doc;
  }
}
