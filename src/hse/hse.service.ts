import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import * as D from './hse.dto';

@Injectable()
export class HseService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private scope(actor: Actor, requested?: string): string | undefined {
    if (actor.role === 'SUPER_ADMIN') return requested;
    return actor.siteId ?? requested;
  }

  private async nextRef(): Promise<string> {
    const year = new Date().getFullYear();
    const n = await this.prisma.hseIncident.count({ where: { reference: { startsWith: `HSE-${year}-` } } });
    return `HSE-${year}-${String(n + 1).padStart(4, '0')}`;
  }

  async createIncident(dto: D.CreateIncidentDto, actor: Actor) {
    if (dto.clientOpId) {
      const ex = await this.prisma.hseIncident.findUnique({ where: { clientOpId: dto.clientOpId } });
      if (ex) return ex;
    }
    const lostDays = dto.lostDays ?? 0;
    const inc = await this.prisma.hseIncident.create({
      data: {
        siteId: dto.siteId, reference: await this.nextRef(), occurredAt: new Date(dto.occurredAt), type: dto.type, severity: dto.severity,
        description: dto.description, zone: dto.zone, locationId: dto.locationId, riskCategory: dto.riskCategory, vehicleId: dto.vehicleId,
        itemId: dto.itemId, lostTime: dto.lostTime ?? lostDays > 0, lostDays, immediateAction: dto.immediateAction, reportedBy: actor.userId,
        clientOpId: dto.clientOpId,
        persons: dto.persons?.length ? { create: dto.persons } : undefined,
      },
    });
    // Un accident grave alerte immédiatement la direction
    if (dto.severity === 'HIGH' || dto.severity === 'CRITICAL') {
      await this.prisma.notification.create({
        data: { title: `Incident HSE ${dto.severity === 'CRITICAL' ? 'critique' : 'grave'}`, message: `${inc.reference} : ${dto.description.slice(0, 140)}`, severity: 'CRITICAL', entity: 'HseIncident', entityId: inc.id, siteId: dto.siteId, roleName: 'GESTIONNAIRE_HSE' },
      }).catch(() => undefined);
    }
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'HseIncident', entityId: inc.id, newValue: dto });
    return inc;
  }

  listIncidents(actor: Actor, siteId?: string, status?: string) {
    const s = this.scope(actor, siteId);
    return this.prisma.hseIncident.findMany({
      where: { ...(s ? { siteId: s } : {}), ...(status ? { status } : {}) },
      include: { persons: true }, orderBy: { occurredAt: 'desc' }, take: 200,
    });
  }

  async closeIncident(id: string, dto: D.CloseIncidentDto, actor: Actor) {
    const inc = await this.prisma.hseIncident.findUnique({ where: { id } });
    if (!inc) throw new NotFoundException('Incident introuvable.');
    if (inc.status === 'CLOSED') throw new BadRequestException('Incident déjà clos.');
    const open = await this.prisma.hseCorrectiveAction.count({ where: { incidentId: id, status: { not: 'DONE' } } });
    if (open > 0) throw new BadRequestException(`${open} action(s) corrective(s) ne sont pas soldées.`);
    const upd = await this.prisma.hseIncident.update({ where: { id }, data: { status: 'CLOSED', rootCause: dto.rootCause, closedBy: actor.userId, closedAt: new Date() } });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'HseIncident', entityId: id, newValue: { status: 'CLOSED' }, reason: dto.rootCause });
    return upd;
  }

  async createAction(dto: D.CreateActionDto, actor: Actor) {
    const a = await this.prisma.hseCorrectiveAction.create({
      data: { siteId: dto.siteId, title: dto.title, dueDate: new Date(dto.dueDate), incidentId: dto.incidentId, inspectionId: dto.inspectionId, responsibleId: dto.responsibleId },
    });
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'HseCorrectiveAction', entityId: a.id, newValue: dto });
    return a;
  }

  listActions(actor: Actor, siteId?: string, status?: string) {
    const s = this.scope(actor, siteId);
    return this.prisma.hseCorrectiveAction.findMany({
      where: { ...(s ? { siteId: s } : {}), ...(status ? { status } : {}) }, orderBy: { dueDate: 'asc' }, take: 200,
    });
  }

  async completeAction(id: string, actor: Actor) {
    const a = await this.prisma.hseCorrectiveAction.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Action introuvable.');
    const upd = await this.prisma.hseCorrectiveAction.update({ where: { id }, data: { status: 'DONE', doneAt: new Date() } });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'HseCorrectiveAction', entityId: id, newValue: { status: 'DONE' } });
    return upd;
  }

  createTalk(dto: D.CreateTalkDto) {
    return this.prisma.hseToolboxTalk.create({ data: { siteId: dto.siteId, theme: dto.theme, plannedAt: new Date(dto.plannedAt), locationId: dto.locationId } });
  }

  listTalks(actor: Actor, siteId?: string) {
    const s = this.scope(actor, siteId);
    return this.prisma.hseToolboxTalk.findMany({ where: s ? { siteId: s } : {}, include: { attendees: true }, orderBy: { plannedAt: 'desc' }, take: 100 });
  }

  async holdTalk(id: string, dto: D.HoldTalkDto, actor: Actor) {
    const t = await this.prisma.hseToolboxTalk.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Causerie introuvable.');
    if (t.status === 'DONE') throw new BadRequestException('Causerie déjà tenue.');
    const upd = await this.prisma.hseToolboxTalk.update({
      where: { id },
      data: { status: 'DONE', heldAt: new Date(), facilitatorId: actor.userId, notes: dto.notes, attendees: { create: dto.attendees } },
    });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'HseToolboxTalk', entityId: id, newValue: { status: 'DONE', attendees: dto.attendees.length } });
    return upd;
  }

  async createInspection(dto: D.CreateInspectionDto, actor: Actor) {
    const i = await this.prisma.hseInspection.create({
      data: { siteId: dto.siteId, type: dto.type, locationId: dto.locationId, vehicleId: dto.vehicleId, inspectorId: actor.userId, score: dto.score, compliant: dto.compliant, notes: dto.notes },
    });
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'HseInspection', entityId: i.id, newValue: dto });
    return i;
  }

  listInspections(actor: Actor, siteId?: string) {
    const s = this.scope(actor, siteId);
    return this.prisma.hseInspection.findMany({ where: s ? { siteId: s } : {}, orderBy: { inspectedAt: 'desc' }, take: 100 });
  }

  createPpe(dto: D.CreatePpeDto) {
    if (!dto.userId && !dto.driverId) throw new BadRequestException('Indiquez le bénéficiaire (utilisateur ou chauffeur).');
    return this.prisma.ppeIssuance.create({
      data: { siteId: dto.siteId, ppeType: dto.ppeType, issuedAt: new Date(dto.issuedAt), userId: dto.userId, driverId: dto.driverId, renewalDue: dto.renewalDue ? new Date(dto.renewalDue) : undefined, compliant: dto.compliant ?? true, checkedAt: new Date() },
    });
  }

  createTraining(dto: D.CreateTrainingDto) {
    if (!dto.userId && !dto.driverId) throw new BadRequestException('Indiquez la personne formée (utilisateur ou chauffeur).');
    return this.prisma.hseTraining.create({
      data: { title: dto.title, obtainedAt: new Date(dto.obtainedAt), expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined, userId: dto.userId, driverId: dto.driverId },
    });
  }

  setWorkedHours(dto: D.SetWorkedHoursDto) {
    const d = new Date(dto.period);
    const period = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    return this.prisma.hseWorkedHours.upsert({
      where: { siteId_period: { siteId: dto.siteId, period } },
      create: { siteId: dto.siteId, period, hours: dto.hours }, update: { hours: dto.hours },
    });
  }
}
