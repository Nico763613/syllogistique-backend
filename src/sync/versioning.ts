import { inContext } from '../common/tenant-scope';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { requestContext } from '../common/request-context';

// ============================================================================================
// Numéro de version par fiche (migration 0002).
// - Chaque modification d'une fiche versionnée augmente son numéro de version ; une modification
//   individuelle laisse une trace dans record_versions (version, auteur, date).
// - Une saisie faite sur une version dépassée est en CONFLIT seulement si une AUTRE personne a modifié
//   la fiche depuis cette version (enchaîner ses propres saisies hors ligne n'est pas un conflit).
// - Un conflit n'écrase rien : la saisie est conservée dans sync_conflicts et un responsable arbitre.
// Le client donne la version connue par l'en-tête « If-Match » (requêtes PATCH/PUT sur /…/:id),
// par « baseVersion » dans la synchronisation hors ligne.
// ============================================================================================

export const VERSIONED = new Set(['Trip', 'Vehicle', 'Driver', 'InventoryItem', 'Customer', 'Supplier', 'DriverDailyReport', 'DriverExpense', 'SalesOrder', 'PurchaseOrder', 'NeedRequest']);
const delegateName = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

export interface ConflictInput {
  entity: string;
  entityId: string;
  baseVersion: number;
  userId: string;
  organizationId: string;
  source: 'API' | 'SYNC_BUREAU' | 'SYNC_CHAUFFEUR';
  payload: unknown;
}

/** Lève une erreur 409 (et enregistre le conflit) si une autre personne a modifié la fiche depuis baseVersion. */
export async function assertNoConflict(prisma: any, c: ConflictInput): Promise<void> {
  if (!VERSIONED.has(c.entity) || !Number.isInteger(c.baseVersion) || c.baseVersion < 1) return;
  const rows = (await prisma.$queryRawUnsafe(
    'SELECT MAX("version") AS v, BOOL_OR("modified_by" <> $4) AS other FROM "record_versions" WHERE "entity" = $1 AND "entity_id" = $2 AND "version" > $3',
    c.entity, c.entityId, c.baseVersion, c.userId)) as any[];
  if (!rows[0]?.other) return;
  const current: any = await inContext<any>({ ...(requestContext.getStore() || {}), bypass: true }, () =>
    prisma[delegateName(c.entity)].findUnique({ where: { id: c.entityId } }));
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "sync_conflicts" ("id","organization_id","site_id","entity","entity_id","source","requested_by","base_version","server_version","client_payload","server_snapshot")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)`,
    id, c.organizationId, current?.siteId ?? null, c.entity, c.entityId, c.source, c.userId, c.baseVersion, Number(current?.version ?? rows[0].v),
    JSON.stringify(c.payload ?? {}), JSON.stringify(current ?? null, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
  throw new ConflictException({
    statusCode: 409, code: 'SYNC_CONFLICT', conflictId: id, currentVersion: Number(current?.version ?? rows[0].v),
    message: 'Cette fiche a été modifiée par une autre personne depuis votre dernière mise à jour. Votre saisie est conservée et sera arbitrée par un responsable.',
  });
}

/** Intergiciel Prisma : numéro de version, trace des modifications et contrôle « If-Match ». */
export function versionMiddleware(client: any) {
  return async (params: any, next: (p: any) => Promise<any>) => {
    const model: string | undefined = params.model;
    const ctx = requestContext.getStore();
    if (!model || !VERSIONED.has(model) || ctx?.bypass) return next(params);
    const args = params.args || (params.args = {});

    if (params.action === 'updateMany' && args.data && args.data.version === undefined) args.data.version = { increment: 1 };
    if (params.action === 'upsert' && args.update && args.update.version === undefined) args.update.version = { increment: 1 };
    if (params.action !== 'update') return next(params);

    const id = typeof args.where?.id === 'string' ? args.where.id : undefined;
    if (id && ctx?.expectedVersion && ctx.expectedTarget === id && !ctx.versionUsed && ctx.userId && ctx.organizationId) {
      ctx.versionUsed = true;
      await assertNoConflict(client, { entity: model, entityId: id, baseVersion: ctx.expectedVersion, userId: ctx.userId, organizationId: ctx.organizationId, source: 'API', payload: args.data });
    }
    if (args.data && args.data.version === undefined) args.data.version = { increment: 1 };
    const result = await next(params);
    try {
      let rid = result?.id ?? id, ver = result?.version;
      if (rid && ver === undefined) {
        const r: any = await inContext<any>({ ...(ctx || {}), bypass: true }, () => client[delegateName(model)].findUnique({ where: { id: rid }, select: { version: true } }));
        ver = r?.version;
      }
      if (rid && ver !== undefined) {
        await client.$executeRawUnsafe('INSERT INTO "record_versions" ("entity","entity_id","version","modified_by") VALUES ($1,$2,$3,$4)', model, rid, Number(ver), ctx?.userId || 'system');
      }
    } catch { /* la trace ne doit jamais faire échouer la modification */ }
    return result;
  };
}
