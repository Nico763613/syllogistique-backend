import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDocumentDto, RenewDocumentDto, UpdateDocumentDto } from './dto/document.dto';
import { Actor } from '../common/actor';

// Documents des véhicules (§28) : carte grise, assurance, visite technique, etc.
// Les dates d'expiration alimentent les alertes (voir NotificationsService).
const SINGLE = ['CARTE_GRISE', 'ASSURANCE', 'VISITE_TECHNIQUE', 'PERMIS'];

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private outOfScope(actor: Actor, siteId: string) {
    return actor.role !== 'SUPER_ADMIN' && !!actor.siteId && siteId !== actor.siteId;
  }

  async create(dto: CreateDocumentDto, actor: Actor) {
    const actorId = actor.userId;
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle || this.outOfScope(actor, vehicle.siteId)) throw new BadRequestException('Véhicule inexistant.');
    const doc = await this.prisma.document.create({
      data: {
        vehicleId: dto.vehicleId,
        type: dto.type,
        fileUrl: dto.fileUrl,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      },
    });
    // Un seul document actif par type (assurance, visite technique, carte grise) : l'ancien passe dans l'historique.
    if (SINGLE.includes(dto.type)) {
      await this.prisma.document.updateMany({
        where: { vehicleId: dto.vehicleId, type: dto.type, id: { not: doc.id }, replacedAt: null },
        data: { replacedAt: new Date(), replacedById: doc.id },
      });
    }
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Document', entityId: doc.id, newValue: dto });
    return doc;
  }

  findAll(actor: Actor, params: { vehicleId?: string; type?: string; expiringInDays?: number; history?: boolean }) {
    const scoped = actor.role !== 'SUPER_ADMIN' && actor.siteId;
    const limit = params.expiringInDays != null ? new Date(Date.now() + params.expiringInDays * 86400000) : undefined;
    return this.prisma.document.findMany({
      where: {
        ...(scoped ? { vehicle: { siteId: actor.siteId } } : {}),
        ...(params.history ? {} : { replacedAt: null }),
        ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
        ...(params.type ? { type: params.type } : {}),
        ...(limit ? { expiryDate: { lte: limit } } : {}),
      },
      include: { vehicle: { select: { internalNumber: true, registrationNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateDocumentDto, actor: Actor) {
    const actorId = actor.userId;
    const old = await this.prisma.document.findUnique({ where: { id }, include: { vehicle: { select: { siteId: true } } } });
    if (!old || this.outOfScope(actor, old.vehicle.siteId)) throw new NotFoundException('Document introuvable.');
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

  // Renouvellement : crée le nouveau document, archive l'ancien (jamais supprimé), journalise.
  async renew(id: string, dto: RenewDocumentDto, actor: Actor) {
    const old = await this.prisma.document.findUnique({ where: { id }, include: { vehicle: { select: { siteId: true } } } });
    if (!old || this.outOfScope(actor, old.vehicle.siteId)) throw new NotFoundException('Document introuvable.');
    if (old.replacedAt) throw new BadRequestException('Ce document a déjà été renouvelé.');
    const expiry = new Date(dto.expiryDate);
    if (old.expiryDate && expiry <= old.expiryDate) throw new BadRequestException("La nouvelle échéance doit être postérieure à l'ancienne.");
    const doc = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: { vehicleId: old.vehicleId, type: old.type, fileUrl: dto.fileUrl?.trim() || old.fileUrl, expiryDate: expiry, note: dto.note?.trim() || null },
      });
      await tx.document.update({ where: { id }, data: { replacedAt: new Date(), replacedById: created.id } });
      return created;
    });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'Document', entityId: id, oldValue: { expiryDate: old.expiryDate }, newValue: { renewedBy: doc.id, expiryDate: expiry }, reason: 'Renouvellement' });
    return doc;
  }

  // Conformité du parc : pour chaque véhicule, l'état des 3 documents obligatoires.
  async compliance(actor: Actor) {
    const scoped = actor.role !== 'SUPER_ADMIN' && actor.siteId;
    const vehicles = await this.prisma.vehicle.findMany({
      where: { deletedAt: null, ...(scoped ? { siteId: actor.siteId } : {}) },
      select: { id: true, internalNumber: true, registrationNumber: true, documents: { where: { replacedAt: null }, select: { id: true, type: true, expiryDate: true } } },
    });
    const now = Date.now();
    const state = (d?: { expiryDate: Date | null }) => {
      if (!d) return 'MANQUANT';
      if (!d.expiryDate) return 'OK';
      const days = Math.ceil((+d.expiryDate - now) / 86400000);
      return days < 0 ? 'EXPIRE' : days <= 7 ? 'URGENT' : days <= 30 ? 'BIENTOT' : 'OK';
    };
    return vehicles.map((v) => {
      const by = (t: string) => v.documents.filter((d) => d.type === t).sort((a, b) => +(b.expiryDate ?? 0) - +(a.expiryDate ?? 0))[0];
      const items = { ASSURANCE: state(by('ASSURANCE')), VISITE_TECHNIQUE: state(by('VISITE_TECHNIQUE')), CARTE_GRISE: state(by('CARTE_GRISE')) };
      const bad = Object.values(items).some((x) => x === 'EXPIRE' || x === 'MANQUANT');
      return { vehicleId: v.id, internalNumber: v.internalNumber, registrationNumber: v.registrationNumber, items, compliant: !bad };
    });
  }
}
