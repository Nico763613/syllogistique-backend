import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { PartsReceivedDto, PartsRequestDto, QualifyDowntimeDto, ReportDowntimeDto, ResolveDowntimeDto } from './dto/downtime.dto';

const DAY = 86400000;

export const STAGE_LABEL: Record<string, string> = {
  DECLAREE: 'Déclarée',
  QUALIFIEE: 'Qualifiée',
  EN_REPARATION: 'En réparation',
  EN_ATTENTE_PIECES: 'En attente de pièces',
  REMISE_EN_SERVICE: 'Remise en service',
};

type Actor = { userId: string; role?: string };
type Sev = 'INFO' | 'WARNING' | 'CRITICAL';

// Circuit « panne → réparation → remise en service » :
// Chauffeur déclare → Logistique qualifie (priorité, délai) → Mécanicien prend en charge (le premier arrivé) →
// (pièces demandées aux Achats → pièces reçues) → réparation terminée → véhicule remis en service.
// Chaque étape notifie le bon rôle, est historisée (journal d'étapes + audit) et les retards sont alertés (RoleAlertsService).
@Injectable()
export class DowntimesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // --- Outils internes ---

  private async notify(a: { roles: string[]; siteId: string; title: string; message: string; severity: Sev; entityId: string }) {
    const roles = a.severity === 'CRITICAL' && !a.roles.includes('SUPER_ADMIN') ? [...a.roles, 'SUPER_ADMIN'] : a.roles;
    for (const roleName of roles) {
      await this.prisma.notification
        .create({ data: { title: a.title, message: a.message, severity: a.severity, entity: 'VehicleDowntime', entityId: a.entityId, siteId: a.siteId, roleName } })
        .catch(() => undefined);
    }
  }

  private logEntry(dt: { stageLog: unknown }, stage: string, actor: Actor, note?: string): Prisma.InputJsonValue {
    const prev = Array.isArray(dt.stageLog) ? (dt.stageLog as Prisma.InputJsonValue[]) : [];
    return [...prev, { stage, at: new Date().toISOString(), by: actor.userId, role: actor.role ?? null, note: note?.trim() || null }];
  }

  private async load(id: string) {
    const dt = await this.prisma.vehicleDowntime.findUnique({ where: { id }, include: { vehicle: { select: { internalNumber: true, registrationNumber: true } } } });
    if (!dt) throw new NotFoundException('Immobilisation introuvable.');
    if (dt.endedAt) throw new BadRequestException('Cette immobilisation est déjà clôturée.');
    return dt;
  }

  private async mechanicName(userId: string | null) {
    if (!userId) return null;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    return u ? `${u.firstName} ${u.lastName}` : null;
  }

  // Prochaine étape à indiquer à chaque intervenant (guidage de bout en bout)
  static nextStep(i: { stage: string; mechanicId: string | null; endedAt: Date | null }): { who: string; text: string } | null {
    if (i.endedAt) return null;
    switch (i.stage) {
      case 'DECLAREE':
        return { who: 'Responsable logistique', text: 'Qualifier la panne : priorité et délai de remise en service.' };
      case 'QUALIFIEE':
        return { who: 'Mécanicien', text: 'Prendre en charge la réparation (le premier arrivé).' };
      case 'EN_REPARATION':
        return { who: 'Mécanicien', text: 'Réparer, demander des pièces si besoin, puis déclarer « Réparation terminée ».' };
      case 'EN_ATTENTE_PIECES':
        return { who: 'Achats / Magasinier', text: 'Fournir les pièces demandées, puis confirmer « Pièces reçues ».' };
      default:
        return null;
    }
  }

  // --- Déclaration (par la logistique) ---

  // Déclare une panne / immobilisation : le véhicule passe en IMMOBILIZED
  async report(dto: ReportDowntimeDto, actorId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle || vehicle.deletedAt) throw new NotFoundException('Véhicule introuvable.');
    const open = await this.prisma.vehicleDowntime.findFirst({ where: { vehicleId: dto.vehicleId, endedAt: null } });
    if (open) throw new BadRequestException('Ce véhicule a déjà une immobilisation en cours.');

    const downtime = await this.prisma.vehicleDowntime.create({
      data: {
        vehicleId: dto.vehicleId,
        siteId: vehicle.siteId,
        category: dto.category ?? 'PANNE',
        reason: dto.reason.trim(),
        estimatedCost: dto.estimatedCost,
        createdById: actorId,
        stageLog: [{ stage: 'DECLAREE', at: new Date().toISOString(), by: actorId, role: null, note: dto.reason.trim() }],
      },
    });
    await this.prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: 'IMMOBILIZED' } });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Vehicle',
      entityId: vehicle.id,
      oldValue: { status: vehicle.status },
      newValue: { status: 'IMMOBILIZED', categorie: downtime.category },
      reason: dto.reason.trim(),
    });
    await this.notify({
      roles: ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE'], siteId: vehicle.siteId, severity: 'WARNING', entityId: downtime.id,
      title: `Véhicule immobilisé — ${vehicle.internalNumber}`, message: `${dto.reason.trim().slice(0, 160)}. À qualifier : priorité et délai de remise en service.`,
    });
    return downtime;
  }

  // --- Étape 2 : qualification par la logistique ---

  async qualify(id: string, dto: QualifyDowntimeDto, actor: Actor) {
    const dt = await this.load(id);
    if (dt.stage !== 'DECLAREE') throw new BadRequestException('Cette panne est déjà qualifiée.');
    let expectedEndAt: Date | undefined;
    if (dto.expectedEndAt) {
      expectedEndAt = new Date(dto.expectedEndAt);
      if (Number.isNaN(+expectedEndAt) || +expectedEndAt < Date.now() - 60_000) throw new BadRequestException('Le délai de remise en service doit être dans le futur.');
    } else {
      // Délai par défaut selon la priorité : 24 h (urgente) ou 72 h (normale)
      expectedEndAt = new Date(Date.now() + (dto.priority === 'URGENTE' ? 1 : 3) * DAY);
    }
    const updated = await this.prisma.vehicleDowntime.update({
      where: { id },
      data: {
        stage: 'QUALIFIEE', priority: dto.priority, qualifiedAt: new Date(), qualifiedById: actor.userId, expectedEndAt,
        ...(dto.estimatedCost !== undefined ? { estimatedCost: dto.estimatedCost } : {}),
        stageLog: this.logEntry(dt, 'QUALIFIEE', actor, dto.note),
      },
    });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'VehicleDowntime', entityId: id, oldValue: { stage: dt.stage }, newValue: { stage: 'QUALIFIEE', priorite: dto.priority }, reason: dto.note?.trim() });
    await this.notify({
      roles: ['MECANICIEN'], siteId: dt.siteId, severity: dto.priority === 'URGENTE' ? 'CRITICAL' : 'WARNING', entityId: id,
      title: `${dto.priority === 'URGENTE' ? 'Réparation URGENTE' : 'Réparation à prendre en charge'} — ${dt.vehicle.internalNumber}`,
      message: `${dt.reason.slice(0, 140)}. Remise en service attendue avant le ${expectedEndAt.toLocaleDateString('fr-FR')}.${dto.note?.trim() ? ` Consigne : ${dto.note.trim().slice(0, 120)}` : ''}`,
    });
    return updated;
  }

  // --- Étape 3 : prise en charge par le mécanicien (attribution sécurisée : le premier arrivé) ---

  async take(id: string, actor: Actor) {
    const dt = await this.load(id);
    if (dt.mechanicId && dt.mechanicId !== actor.userId) {
      throw new ConflictException(`Cette réparation est déjà prise en charge par ${(await this.mechanicName(dt.mechanicId)) ?? 'un autre mécanicien'}.`);
    }
    if (dt.mechanicId === actor.userId) return dt; // déjà à lui : rien à refaire
    // Verrou : un seul mécanicien peut s'attribuer la panne, même si deux appuient en même temps
    const claimed = await this.prisma.vehicleDowntime.updateMany({
      where: { id, mechanicId: null, endedAt: null },
      data: { mechanicId: actor.userId, repairStartedAt: new Date(), stage: 'EN_REPARATION' },
    });
    if (claimed.count === 0) throw new ConflictException('Cette réparation vient d\'être prise en charge par un autre mécanicien.');
    const updated = await this.prisma.vehicleDowntime.update({
      where: { id },
      data: { stageLog: this.logEntry(dt, 'EN_REPARATION', actor, dt.stage === 'DECLAREE' ? 'Prise en charge directe (sans qualification préalable)' : undefined) },
    });
    const name = await this.mechanicName(actor.userId);
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'VehicleDowntime', entityId: id, oldValue: { stage: dt.stage }, newValue: { stage: 'EN_REPARATION', mecanicien: name } });
    await this.notify({
      roles: ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE'], siteId: dt.siteId, severity: 'INFO', entityId: id,
      title: `Réparation commencée — ${dt.vehicle.internalNumber}`, message: `Prise en charge par ${name ?? 'le mécanicien'}.`,
    });
    return updated;
  }

  // --- Étape 4 : pièces nécessaires → état des besoins envoyé aux Achats ---

  async requestParts(id: string, dto: PartsRequestDto, actor: Actor) {
    const dt = await this.load(id);
    this.assertMechanicOwns(dt, actor);
    if (dt.stage === 'EN_ATTENTE_PIECES') throw new BadRequestException('Des pièces sont déjà demandées pour cette panne.');
    const year = new Date().getFullYear();
    const count = await this.prisma.needRequest.count({ where: { reference: { startsWith: `EB-${year}-` } } });
    const reference = `EB-${year}-${String(count + 1).padStart(4, '0')}`;
    const need = await this.prisma.needRequest.create({
      data: {
        siteId: dt.siteId, reference, title: `Pièces — réparation ${dt.vehicle.internalNumber}`,
        priority: dt.priority === 'URGENTE' ? 'URGENTE' : 'NORMALE', status: 'ENVOYE', recipient: 'Achats / Responsable logistique',
        justification: `Panne : ${dt.reason.slice(0, 300)}${dto.note?.trim() ? ` — ${dto.note.trim()}` : ''}`, createdById: actor.userId,
        lines: { create: dto.lines.map((l) => ({ vehicleId: dt.vehicleId, designation: l.designation.trim(), quantity: l.quantity, unit: l.unit })) },
      },
    });
    const updated = await this.prisma.vehicleDowntime.update({
      where: { id },
      data: { stage: 'EN_ATTENTE_PIECES', needRequestId: need.id, partsRequestedAt: new Date(), stageLog: this.logEntry(dt, 'EN_ATTENTE_PIECES', actor, `${reference} : ${dto.lines.map((l) => `${l.quantity} × ${l.designation}`).join(', ').slice(0, 300)}`) },
    });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'VehicleDowntime', entityId: id, oldValue: { stage: dt.stage }, newValue: { stage: 'EN_ATTENTE_PIECES', etatDesBesoins: reference } });
    await this.notify({
      roles: ['ADMIN_LOGISTIQUE', 'MAGASINIER'], siteId: dt.siteId, severity: dt.priority === 'URGENTE' ? 'CRITICAL' : 'WARNING', entityId: id,
      title: `Pièces demandées — ${dt.vehicle.internalNumber}`, message: `État des besoins ${reference} (${dto.lines.length} ligne(s)) à traiter pour remettre le véhicule en service.`,
    });
    return { ...updated, needReference: reference };
  }

  // --- Étape 5 : pièces reçues → la réparation reprend ---

  async partsReceived(id: string, dto: PartsReceivedDto, actor: Actor) {
    const dt = await this.load(id);
    if (dt.stage !== 'EN_ATTENTE_PIECES') throw new BadRequestException('Aucune pièce n\'est en attente pour cette panne.');
    const updated = await this.prisma.vehicleDowntime.update({
      where: { id },
      data: { stage: 'EN_REPARATION', stageLog: this.logEntry(dt, 'EN_REPARATION', actor, dto.note?.trim() || 'Pièces reçues') },
    });
    if (dt.needRequestId) await this.prisma.needRequest.update({ where: { id: dt.needRequestId }, data: { status: 'SATISFAIT' } }).catch(() => undefined);
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'VehicleDowntime', entityId: id, oldValue: { stage: dt.stage }, newValue: { stage: 'EN_REPARATION' }, reason: dto.note?.trim() || 'Pièces reçues' });
    await this.notify({
      roles: ['MECANICIEN'], siteId: dt.siteId, severity: 'INFO', entityId: id,
      title: `Pièces reçues — ${dt.vehicle.internalNumber}`, message: 'Les pièces demandées sont disponibles : la réparation peut reprendre.',
    });
    return updated;
  }

  private assertMechanicOwns(dt: { mechanicId: string | null }, actor: Actor) {
    if (actor.role === 'MECANICIEN' && dt.mechanicId && dt.mechanicId !== actor.userId) {
      throw new ForbiddenException('Cette réparation est suivie par un autre mécanicien.');
    }
    if (actor.role === 'MECANICIEN' && !dt.mechanicId) {
      throw new BadRequestException('Prenez d\'abord la réparation en charge.');
    }
  }

  // --- Étape finale : remise en service ---

  // Remise en service : clôture l'immobilisation, calcule la durée, libère le véhicule
  async resolve(id: string, dto: ResolveDowntimeDto, actorId: string, actorRole?: string) {
    const downtime = await this.prisma.vehicleDowntime.findUnique({ where: { id }, include: { vehicle: { select: { internalNumber: true } } } });
    if (!downtime) throw new NotFoundException('Immobilisation introuvable.');
    if (downtime.endedAt) throw new BadRequestException('Cette immobilisation est déjà clôturée.');
    if (actorRole === 'MECANICIEN') {
      if (downtime.mechanicId && downtime.mechanicId !== actorId) throw new ForbiddenException('Cette réparation est suivie par un autre mécanicien.');
      if (downtime.stage === 'EN_ATTENTE_PIECES') throw new BadRequestException('Des pièces sont encore attendues : attendez leur réception avant de clôturer.');
      if (dto.actualCost === undefined || dto.actualCost === null) throw new BadRequestException('Indiquez le coût de la réparation (0 si aucun).');
      if (!dto.resolutionNote?.trim()) throw new BadRequestException('Indiquez les travaux réalisés.');
      if (dto.actualCost > 0 && !dto.invoiceUrl) throw new BadRequestException('La photo de la facture est obligatoire quand un coût est indiqué.');
    }
    const endedAt = new Date();
    const updated = await this.prisma.vehicleDowntime.update({
      where: { id },
      data: {
        endedAt, actualCost: dto.actualCost, resolutionNote: dto.resolutionNote?.trim(), resolvedById: actorId, invoiceUrl: dto.invoiceUrl || undefined,
        stage: 'REMISE_EN_SERVICE',
        stageLog: this.logEntry(downtime, 'REMISE_EN_SERVICE', { userId: actorId, role: actorRole }, dto.resolutionNote),
      },
    });
    await this.prisma.vehicle.update({ where: { id: downtime.vehicleId }, data: { status: 'AVAILABLE' } });
    const days = Math.max(1, Math.ceil((endedAt.getTime() - downtime.startedAt.getTime()) / DAY));
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Vehicle',
      entityId: downtime.vehicleId,
      oldValue: { status: 'IMMOBILIZED' },
      newValue: { status: 'AVAILABLE', joursImmobilises: days, coutReel: dto.actualCost ?? null },
      reason: dto.resolutionNote?.trim() || 'Remise en service',
    });
    await this.notify({
      roles: ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'RESPONSABLE_OPERATIONS'], siteId: downtime.siteId, severity: 'INFO', entityId: id,
      title: `Véhicule remis en service — ${downtime.vehicle.internalNumber}`,
      message: `Immobilisé ${days} jour(s)${dto.actualCost ? `, coût ${Number(dto.actualCost).toLocaleString('fr-FR')} GNF` : ''}. Le véhicule est de nouveau disponible pour les missions.`,
    });
    return updated;
  }

  // Historique + indicateurs (durée, coût) + étape en cours et prochaine action
  async list(siteId: string, params: { vehicleId?: string; open?: string }, actor?: { userId?: string; role?: string }) {
    if (!siteId) throw new BadRequestException('Le site (siteId) est obligatoire.');
    const rows = await this.prisma.vehicleDowntime.findMany({
      where: {
        siteId,
        ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
        ...(params.open === 'true' ? { endedAt: null } : {}),
      },
      include: { vehicle: { select: { internalNumber: true, registrationNumber: true, brand: true, model: true } } },
      orderBy: { startedAt: 'desc' },
      take: 300,
    });
    const now = Date.now();
    const mechIds = [...new Set(rows.map((r) => r.mechanicId).filter((x): x is string => !!x))];
    const mechs = mechIds.length ? await this.prisma.user.findMany({ where: { id: { in: mechIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const mechName = new Map(mechs.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));
    const needIds = rows.map((r) => r.needRequestId).filter((x): x is string => !!x);
    const needs = needIds.length ? await this.prisma.needRequest.findMany({ where: { id: { in: needIds } }, select: { id: true, reference: true, status: true } }) : [];
    const needBy = new Map(needs.map((n) => [n.id, n]));
    const items = rows.map((r) => ({
      id: r.id,
      vehicleId: r.vehicleId,
      vehicle: `${r.vehicle.internalNumber} — ${r.vehicle.registrationNumber}`,
      category: r.category,
      reason: r.reason,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      days: Math.max(1, Math.ceil(((r.endedAt?.getTime() ?? now) - r.startedAt.getTime()) / DAY)),
      // Le mécanicien ne voit les coûts que de ses propres interventions
      estimatedCost: r.estimatedCost === null || (actor?.role === 'MECANICIEN' && r.resolvedById !== actor.userId) ? null : Number(r.estimatedCost),
      actualCost: r.actualCost === null || (actor?.role === 'MECANICIEN' && r.resolvedById !== actor.userId) ? null : Number(r.actualCost),
      resolutionNote: r.resolutionNote,
      invoiceUrl: r.invoiceUrl,
      mine: r.resolvedById === actor?.userId,
      // Circuit
      stage: r.stage,
      stageLabel: STAGE_LABEL[r.stage] ?? r.stage,
      priority: r.priority,
      severity: r.severity,
      expectedEndAt: r.expectedEndAt,
      late: !r.endedAt && !!r.expectedEndAt && +r.expectedEndAt < now,
      mechanicId: r.mechanicId,
      mechanicName: r.mechanicId ? mechName.get(r.mechanicId) ?? null : null,
      mineToRepair: !!r.mechanicId && r.mechanicId === actor?.userId,
      need: r.needRequestId ? needBy.get(r.needRequestId) ?? null : null,
      next: DowntimesService.nextStep(r),
      history: Array.isArray(r.stageLog) ? r.stageLog : [],
    }));
    return {
      items,
      summary: {
        open: items.filter((i) => !i.endedAt).length,
        late: items.filter((i) => i.late).length,
        toQualify: items.filter((i) => !i.endedAt && i.stage === 'DECLAREE').length,
        waitingParts: items.filter((i) => !i.endedAt && i.stage === 'EN_ATTENTE_PIECES').length,
        totalDays: items.reduce((s, i) => s + i.days, 0),
        totalCost: items.reduce((s, i) => s + (i.actualCost ?? i.estimatedCost ?? 0), 0),
      },
    };
  }
}
