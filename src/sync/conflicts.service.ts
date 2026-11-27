import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

// Arbitrage des conflits de synchronisation (table sync_conflicts, migration 0002).
// La table est lue en SQL direct : chaque requête filtre explicitement l'entreprise et le site.

export type ConflictApplier = (conflict: any, resolverId: string) => Promise<unknown>;
/** Fonctions de réapplication d'une saisie, enregistrées par les modules concernés (ex. application chauffeur). */
export const conflictAppliers = new Map<string, ConflictApplier>();

const MANAGERS = ['SUPER_ADMIN', 'DIRECTEUR_GENERAL', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_OPERATIONS', 'GESTIONNAIRE_FLOTTE', 'MAGASINIER'];
interface Actor { userId: string; organizationId: string; siteId?: string | null; role: string }

@Injectable()
export class ConflictsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private scope(actor: Actor, alias = '') {
    const p = alias ? alias + '.' : '';
    const site = actor.role !== 'SUPER_ADMIN' && actor.siteId ? actor.siteId : null;
    return { sql: `${p}"organization_id" = $1` + (site ? ` AND (${p}"site_id" = $2 OR ${p}"site_id" IS NULL)` : ''), args: site ? [actor.organizationId, site] : [actor.organizationId] };
  }

  async list(actor: Actor, status?: string) {
    const s = this.scope(actor, 'c');
    const own = !MANAGERS.includes(actor.role);
    const args: any[] = [...s.args];
    let sql = `SELECT c.*, u."first_name" AS "requester_first_name", u."last_name" AS "requester_last_name"
      FROM "sync_conflicts" c LEFT JOIN "users" u ON u."id" = c."requested_by" WHERE ${s.sql}`;
    if (own) { args.push(actor.userId); sql += ` AND c."requested_by" = $${args.length}`; }
    if (status) { args.push(status); sql += ` AND c."status" = $${args.length}`; }
    sql += ' ORDER BY c."created_at" DESC LIMIT 200';
    return this.prisma.$queryRawUnsafe(sql, ...args);
  }

  async count(actor: Actor) {
    if (!MANAGERS.includes(actor.role)) return { open: 0 };
    const s = this.scope(actor);
    const r = (await this.prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "sync_conflicts" WHERE ${s.sql} AND "status" = 'OUVERT'`, ...s.args)) as any[];
    return { open: Number(r[0]?.n ?? 0) };
  }

  async resolve(id: string, choice: string, note: string | undefined, actor: Actor) {
    if (!MANAGERS.includes(actor.role) || actor.role === 'DIRECTEUR_GENERAL') throw new ForbiddenException("Seul un responsable peut arbitrer un conflit.");
    if (!['SERVEUR', 'SAISIE'].includes(choice)) throw new BadRequestException('Choix attendu : SERVEUR (garder la fiche actuelle) ou SAISIE (appliquer la saisie en attente).');
    const s = this.scope(actor);
    const rows = (await this.prisma.$queryRawUnsafe(`SELECT * FROM "sync_conflicts" WHERE "id" = $${s.args.length + 1} AND ${s.sql}`, ...s.args, id)) as any[];
    const c = rows[0];
    if (!c) throw new NotFoundException('Conflit introuvable.');
    if (c.status !== 'OUVERT') throw new BadRequestException('Ce conflit a déjà été arbitré.');
    if (c.requested_by === actor.userId) throw new ForbiddenException("L'auteur de la saisie ne peut pas arbitrer son propre conflit.");
    if (choice === 'SAISIE' && !conflictAppliers.get(c.source)) {
      throw new BadRequestException("Cette saisie a été faite depuis le bureau : rouvrez la fiche pour la reprendre (elle n'est pas appliquée automatiquement).");
    }
    // Réservation : un double arbitrage simultané échoue proprement (un seul responsable gagne).
    const reserved = await this.prisma.$executeRawUnsafe(`UPDATE "sync_conflicts" SET "status" = 'EN_COURS' WHERE "id" = $1 AND "status" = 'OUVERT'`, id);
    if (!reserved) throw new BadRequestException('Ce conflit a déjà été arbitré.');
    let applied: unknown = null;
    try {
      if (choice === 'SAISIE') applied = await conflictAppliers.get(c.source)!(c, actor.userId);
    } catch (e) {
      await this.prisma.$executeRawUnsafe(`UPDATE "sync_conflicts" SET "status" = 'OUVERT' WHERE "id" = $1`, id);
      throw e;
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE "sync_conflicts" SET "status" = $2, "resolved_by" = $3, "resolved_at" = CURRENT_TIMESTAMP, "resolution_note" = $4 WHERE "id" = $1`,
      id, choice === 'SERVEUR' ? 'RESOLU_SERVEUR' : 'RESOLU_SAISIE', actor.userId, (note || '').slice(0, 500) || null);
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'SyncConflict', entityId: id, newValue: { choice, entity: c.entity, entityId: c.entity_id, note } });
    return { id, status: choice === 'SERVEUR' ? 'RESOLU_SERVEUR' : 'RESOLU_SAISIE', applied };
  }
}
