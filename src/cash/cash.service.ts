import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor, toNumber } from '../common/actor';
import { sessionTotals } from './cash-math';
import { CashExpenseDto, CloseCashSessionDto, OpenCashSessionDto } from './dto/cash.dto';

// Rôles qui voient toutes les caisses du site (validation et rapprochement)
const CASH_VIEWERS = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_COMMERCIAL', 'RESPONSABLE_OPERATIONS', 'COMPTABLE', 'DIRECTEUR_GENERAL', 'LECTEUR'];
const canSeeAllCash = (actor: { role: string }) => CASH_VIEWERS.includes(actor.role);

@Injectable()
export class CashService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Caisse ouverte de l'utilisateur (null s'il n'en a pas)
  findOpenSession(userId: string) {
    return this.prisma.cashSession.findFirst({ where: { cashierId: userId, closedAt: null } });
  }

  private async load(id: string, actor: Actor) {
    const s = await this.prisma.cashSession.findUnique({ where: { id }, include: { cashier: { select: { firstName: true, lastName: true } } } });
    if (!s) throw new NotFoundException('Session de caisse introuvable.');
    if (!canSeeAllCash(actor) && s.cashierId !== actor.userId) {
      throw new ForbiddenException('Cette caisse appartient à un autre utilisateur.');
    }
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && s.siteId !== actor.siteId) {
      throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
    }
    return s;
  }

  private async withSummary(s: any) {
    const totals = await sessionTotals(this.prisma, s.id, toNumber(s.openingFloat));
    return { ...s, summary: totals };
  }

  async open(actor: Actor, dto: OpenCashSessionDto) {
    const siteId = dto.siteId ?? actor.siteId;
    if (!siteId) throw new BadRequestException('Site requis pour ouvrir la caisse.');
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && siteId !== actor.siteId) {
      throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
    }
    if (await this.findOpenSession(actor.userId)) {
      throw new BadRequestException("Vous avez déjà une caisse ouverte : clôturez-la avant d'en ouvrir une autre.");
    }
    const session = await this.prisma.cashSession.create({
      data: { siteId, cashierId: actor.userId, openingFloat: Math.round(dto.openingFloat ?? 0) },
    });
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'CashSession', entityId: session.id, newValue: { event: 'OPEN', openingFloat: dto.openingFloat ?? 0 } });
    return session;
  }

  async current(actor: Actor) {
    const s = await this.findOpenSession(actor.userId);
    return s ? this.withSummary(s) : null;
  }

  async get(id: string, actor: Actor) {
    const s = await this.load(id, actor);
    const expenses = await this.prisma.cashExpense.findMany({ where: { cashSessionId: id }, orderBy: { createdAt: 'desc' } });
    return { ...(await this.withSummary(s)), expenses };
  }

  list(actor: Actor, params: { siteId?: string; from?: string; to?: string }) {
    const siteId = actor.role === 'SUPER_ADMIN' ? params.siteId : actor.siteId ?? params.siteId;
    return this.prisma.cashSession.findMany({
      where: {
        ...(siteId ? { siteId } : {}),
        ...(canSeeAllCash(actor) ? {} : { cashierId: actor.userId }),
        ...(params.from || params.to
          ? { openedAt: { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lte: new Date(params.to) } : {}) } }
          : {}),
      },
      include: { cashier: { select: { firstName: true, lastName: true } } },
      orderBy: { openedAt: 'desc' },
      take: 200,
    });
  }

  async addExpense(id: string, dto: CashExpenseDto, actor: Actor) {
    const s = await this.load(id, actor);
    if (s.closedAt) throw new BadRequestException('Cette caisse est déjà clôturée.');
    const totals = await sessionTotals(this.prisma, id, toNumber(s.openingFloat));
    if (Math.round(dto.amount) > totals.expectedCash) {
      throw new BadRequestException(`Décaissement supérieur aux espèces disponibles en caisse (${totals.expectedCash} GNF).`);
    }
    const expense = await this.prisma.cashExpense.create({
      data: { cashSessionId: id, amount: Math.round(dto.amount), reason: dto.reason, createdBy: actor.userId },
    });
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'CashExpense', entityId: expense.id, newValue: dto });
    return expense;
  }

  async close(id: string, dto: CloseCashSessionDto, actor: Actor) {
    const s = await this.load(id, actor);
    if (s.closedAt) throw new BadRequestException('Cette caisse est déjà clôturée.');
    const totals = await sessionTotals(this.prisma, id, toNumber(s.openingFloat));
    const counted = Math.round(dto.countedCash);
    const gap = counted - totals.expectedCash;
    const updated = await this.prisma.cashSession.update({
      where: { id },
      data: { closedAt: new Date(), countedCash: counted, expectedCash: totals.expectedCash, gapAmount: gap, note: dto.note },
    });
    await this.audit.log({
      userId: actor.userId, action: 'UPDATE', entity: 'CashSession', entityId: id,
      newValue: { event: 'CLOSE', counted, expected: totals.expectedCash, gap },
    });
    return { ...updated, summary: totals };
  }

  // Validation de la clôture par la direction commerciale (un écart doit être justifié dans la note)
  async validate(id: string, actor: Actor, note?: string) {
    const s = await this.load(id, actor);
    if (!s.closedAt) throw new BadRequestException("La caisse n'est pas encore clôturée.");
    if (s.validatedBy) throw new BadRequestException('Cette clôture est déjà validée.');
    if (s.opsAt) throw new BadRequestException('Cette caisse est déjà validée par les opérations.');
    const fullNote = [s.note, note && note.trim() ? 'Responsable commercial : ' + note.trim() : null].filter(Boolean).join(' — ') || null;
    if (toNumber(s.gapAmount) !== 0 && !fullNote) {
      throw new BadRequestException("Un écart de caisse doit être justifié dans la note avant validation.");
    }
    const updated = await this.prisma.cashSession.update({ where: { id }, data: { validatedBy: actor.userId, note: fullNote, rejectedAt: null, rejectedBy: null, rejectNote: null } });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'CashSession', entityId: id, newValue: { event: 'VALIDATE' } });
    return updated;
  }

  // Rejet (Responsable commercial ou Responsable des opérations) : motif obligatoire
  async reject(id: string, actor: Actor, note?: string) {
    const s = await this.load(id, actor);
    if (!s.closedAt) throw new BadRequestException("La caisse n'est pas encore clôturée.");
    if (s.opsAt) throw new BadRequestException('Cette caisse est déjà validée par les opérations.');
    if (!note || note.trim().length < 3) throw new BadRequestException('Indiquez le motif du rejet.');
    const updated = await this.prisma.cashSession.update({
      where: { id },
      data: { rejectedAt: new Date(), rejectedBy: actor.userId, rejectNote: note.trim(), validatedBy: null },
    });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'CashSession', entityId: id, newValue: { event: 'REJECT', note } });
    return updated;
  }

  // Validation finale par le Responsable des opérations (après le Responsable commercial)
  async opsValidate(id: string, actor: Actor) {
    const s = await this.load(id, actor);
    if (!s.validatedBy) throw new BadRequestException("Le Responsable commercial doit d'abord vérifier cette caisse.");
    if (s.opsAt) throw new BadRequestException('Cette caisse est déjà validée.');
    const updated = await this.prisma.cashSession.update({ where: { id }, data: { opsAt: new Date(), opsBy: actor.userId } });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'CashSession', entityId: id, newValue: { event: 'OPS_VALIDATE' } });
    return updated;
  }
}
