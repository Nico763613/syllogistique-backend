import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestContext, requestContext } from './request-context';

// ============================================================================================
// Cloisonnement central entreprise / site, appliqué à CHAQUE accès Prisma d'une requête utilisateur :
// lectures, comptages, agrégats, modifications et suppressions groupées (updateMany, deleteMany),
// créations (y compris groupées et imbriquées) et opérations dans les transactions.
//
// Règles :
// - un utilisateur ne voit et ne touche que les données de SON entreprise ;
// - s'il est rattaché à un site, uniquement celles de son site ; sinon, tous les sites de son entreprise ;
// - toute référence (identifiant d'un véhicule, d'un article, d'un client…) donnée lors d'une création ou
//   d'une modification doit appartenir au même périmètre (sinon 403) ;
// - le Super Admin d'une entreprise est limité à son entreprise (la supervision multi-entreprises se fait
//   depuis la console Master, qui est un serveur séparé).
// Sans contexte (tâches planifiées, démarrage, scripts), rien n'est filtré.
// Les requêtes SQL directes ($queryRaw / $executeRaw) ne passent pas ici : elles filtrent elles-mêmes
// (voir scripts/check-raw-sql.js, qui contrôle leur liste).
// ============================================================================================

type Mode = 'read' | 'write';
const MODELS = Prisma.dmmf.datamodel.models;
const BY_NAME = new Map(MODELS.map((m) => [m.name, m]));
const hasScalar = (model: string, field: string) => !!BY_NAME.get(model)?.fields.some((f) => f.name === field && f.kind === 'scalar');
const delegateName = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

// Catalogues communs : les lignes sans entreprise (fournies par la plateforme) sont lisibles par tous,
// mais seules les lignes de l'entreprise sont modifiables.
const SHARED_CATALOGS = new Set(['StockCategory', 'MaintenanceType']);
// Tables de référence techniques, identiques pour toutes les entreprises.
const UNSCOPED = new Set(['Role', 'Permission', 'RolePermission']);
// Tables rattachées par leur parent.
const PARENT: Record<string, [string, string]> = {
  PurchaseOrderLine: ['purchaseOrder', 'PurchaseOrder'],
  SalesOrderLine: ['salesOrder', 'SalesOrder'],
  NeedRequestLine: ['request', 'NeedRequest'],
  GoodsReceiptLine: ['goodsReceipt', 'GoodsReceipt'],
  StockTransferLine: ['transfer', 'StockTransfer'],
  SalesReturnLine: ['salesReturn', 'SalesReturn'],
  InventoryCountLine: ['count', 'InventoryCount'],
  CashExpense: ['cashSession', 'CashSession'],
  SalesInstallment: ['salesInvoice', 'SalesInvoice'],
  HseIncidentPerson: ['incident', 'HseIncident'],
  HseToolboxAttendee: ['talk', 'HseToolboxTalk'],
  Document: ['vehicle', 'Vehicle'],
  Maintenance: ['vehicle', 'Vehicle'],
  MaintenancePlan: ['vehicle', 'Vehicle'],
};
// Tables dont le site se déduit du chauffeur, et tables dont l'entreprise se déduit d'une autre ligne.
const SITE_FROM_DRIVER = new Set(['DriverDevice', 'TripLog', 'DriverMaintenance', 'DriverDailyReport', 'DriverExpense']);
const ORG_FILLED = new Set(['Supplier', 'StockCategory', 'MaintenanceType', 'Expense', 'AuditLog', 'HseTraining', 'ProblemReport', 'SyncQueueEntry']);

const READ = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']);
const WHERE_WRITE = new Set(['update', 'updateMany', 'delete', 'deleteMany', 'upsert']);

const forbidden = () => new ForbiddenException("Cet élément n'est pas dans votre périmètre (entreprise ou site).");

/** Filtre de périmètre d'un modèle, ou undefined s'il n'est pas cloisonné. */
export function scopeFor(model: string, ctx: RequestContext, mode: Mode): any {
  const S = { in: ctx.siteIds || [] };
  const O = ctx.organizationId || '-';
  switch (model) {
    case 'Organization': return { id: O };
    case 'User': case 'Site': case 'Setting': return { organizationId: O };
    case 'Notification': return { OR: [{ siteId: S }, { siteId: null, userId: ctx.userId || '-' }] };
    case 'Payment': return { OR: [{ siteId: S }, { siteId: null, OR: [{ salesInvoice: { is: { siteId: S } } }, { purchaseInvoice: { is: { siteId: S } } }] }] };
    case 'StaffReport': return { OR: [{ siteId: S }, { siteId: null, user: { is: { organizationId: O } } }] };
    case 'StockTransfer': return { OR: [{ fromSiteId: S }, { toSiteId: S }] };
  }
  if (UNSCOPED.has(model)) return undefined;
  if (PARENT[model]) {
    const [rel, parent] = PARENT[model];
    const p = scopeFor(parent, ctx, mode);
    return p ? { [rel]: { is: p } } : undefined;
  }
  if (hasScalar(model, 'siteId')) return { siteId: S };
  if (hasScalar(model, 'organizationId')) {
    return SHARED_CATALOGS.has(model) && mode === 'read' ? { OR: [{ organizationId: O }, { organizationId: null }] } : { organizationId: O };
  }
  return null; // modèle non classé : voir unclassifiedModels()
}

/** Modèles qui ne sont ni cloisonnés ni déclarés comme communs : doit rester vide (contrôlé au démarrage et en test). */
export function unclassifiedModels(): string[] {
  const ctx: RequestContext = { organizationId: 'x', siteIds: ['x'] };
  return MODELS.map((m) => m.name).filter((n) => scopeFor(n, ctx, 'read') === null);
}

const andWhere = (where: any, scope: any) => {
  if (!scope) return where;
  const w = where ? { ...where } : {};
  const prev = w.AND === undefined ? [] : Array.isArray(w.AND) ? w.AND : [w.AND];
  w.AND = [...prev, scope];
  return w;
};

// Sites de chaque entreprise (gardés 30 s ; vidés à la création d'un site).
const orgSites = new Map<string, { ids: string[]; at: number }>();
export const forgetOrgSites = (orgId?: string) => (orgId ? orgSites.delete(orgId) : orgSites.clear());

/**
 * Exécute fn sans cloisonnement (lectures de contrôle internes uniquement).
 * Important : une requête Prisma ne démarre qu'au moment où on l'attend (« await ») ; il faut donc
 * l'attendre À L'INTÉRIEUR du contexte, sinon elle s'exécuterait avec le contexte de l'appelant
 * (ce qui provoquait une boucle sans fin : contrôle → requête filtrée → contrôle → …).
 */
export const inContext = <T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> => requestContext.run(ctx, async () => await fn());
const bypass = <T>(ctx: RequestContext, fn: () => Promise<T>) => inContext({ ...ctx, bypass: true }, fn);

async function ensureSites(client: any, ctx: RequestContext) {
  if (ctx.siteIds) return;
  if (ctx.siteId) { ctx.siteIds = [ctx.siteId]; return; }
  const c = orgSites.get(ctx.organizationId || '');
  if (c && Date.now() - c.at < 30000) { ctx.siteIds = c.ids; return; }
  const rows = await bypass(ctx, () => client.site.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true } }));
  ctx.siteIds = (rows as any[]).map((r) => r.id);
  orgSites.set(ctx.organizationId || '', { ids: ctx.siteIds, at: Date.now() });
}

const relField = (model: string, fk: string) =>
  BY_NAME.get(model)?.fields.find((f) => f.kind === 'object' && (f.relationFromFields || []).length === 1 && f.relationFromFields![0] === fk);
const usesRelationObjects = (model: string, data: any) =>
  Object.keys(data).some((k) => BY_NAME.get(model)?.fields.some((f) => f.name === k && f.kind === 'object'));

/** Renseigne le site ou l'entreprise des tables qui les ont reçus par migration (aussi hors requête utilisateur). */
async function fill(client: any, model: string, data: any, ctx: RequestContext | undefined) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  const set = (fk: string, value: string) => {
    if (usesRelationObjects(model, data)) { const r = relField(model, fk); if (r) data[r.name] = { connect: { id: value } }; else data[fk] = value; }
    else data[fk] = value;
  };
  const run = <T>(fn: () => Promise<T>) => (ctx ? bypass(ctx, fn) : fn());
  if (SITE_FROM_DRIVER.has(model) && data.siteId === undefined && typeof data.driverId === 'string') {
    const d: any = await run(() => client.driver.findUnique({ where: { id: data.driverId }, select: { siteId: true } }));
    if (d?.siteId) data.siteId = d.siteId; // ces tables n'ont pas de relation « site » : champ simple
  }
  if (ORG_FILLED.has(model) && data.organizationId === undefined) {
    let org: string | undefined;
    if (typeof data.userId === 'string') {
      const u: any = await run(() => client.user.findUnique({ where: { id: data.userId }, select: { organizationId: true } }));
      org = u?.organizationId;
    }
    if (!org && typeof data.vehicleId === 'string') {
      const v: any = await run(() => client.vehicle.findUnique({ where: { id: data.vehicleId }, select: { site: { select: { organizationId: true } } } }));
      org = v?.site?.organizationId;
    }
    if (!org) org = ctx?.organizationId;
    if (org) set('organizationId', org);
  }
}

/** Vérifie qu'une création ou une modification reste dans le périmètre, références comprises. */
async function checkData(client: any, model: string, data: any, ctx: RequestContext, isCreate: boolean): Promise<void> {
  if (!data || typeof data !== 'object') return;
  if (Array.isArray(data)) { for (const d of data) await checkData(client, model, d, ctx, isCreate); return; }
  const S = ctx.siteIds || [];
  const meta = BY_NAME.get(model);
  if (!meta) return;

  if (hasScalar(model, 'siteId')) {
    const v = data.siteId ?? data.site?.connect?.id;
    if (typeof v === 'string' && !S.includes(v)) throw forbidden();
  }
  if (hasScalar(model, 'organizationId')) {
    const v = data.organizationId ?? data.organization?.connect?.id;
    if (typeof v === 'string' && v !== ctx.organizationId) throw forbidden();
  }
  if (model === 'Organization' && !isCreate && data.id !== undefined) throw forbidden();

  for (const f of meta.fields) {
    if (f.kind !== 'object') continue;
    const target = f.type as string;
    // Références simples (ex. vehicleId) et rattachements (connect)
    const fk = (f.relationFromFields || []).length === 1 && (f.relationToFields || [])[0] === 'id' ? f.relationFromFields![0] : undefined;
    const ids: string[] = [];
    if (fk && typeof data[fk] === 'string') ids.push(data[fk]);
    const nested = data[f.name];
    if (nested && typeof nested === 'object') {
      const cons = nested.connect === undefined ? [] : Array.isArray(nested.connect) ? nested.connect : [nested.connect];
      for (const c of cons) if (c && typeof c.id === 'string') ids.push(c.id);
      // Créations imbriquées (ex. lignes d'une commande) : mêmes contrôles
      if (nested.create) await checkData(client, target, nested.create, ctx, true);
      if (nested.createMany?.data) await checkData(client, target, nested.createMany.data, ctx, true);
    }
    if (!ids.length) continue;
    const scope = scopeFor(target, ctx, 'read');
    if (!scope) continue;
    const delegate = client[delegateName(target)];
    for (const id of ids) {
      const ok = await bypass(ctx, () => delegate.findFirst({ where: { AND: [{ id }, scope] }, select: { id: true } }));
      if (ok) continue;
      // Introuvable dans le périmètre : refus si l'élément existe ailleurs (sinon c'est une ligne créée
      // dans la même transaction, ou une référence fausse que la base refusera d'elle-même).
      const exists = await bypass(ctx, () => delegate.findFirst({ where: { id }, select: { id: true } }));
      if (exists) throw forbidden();
    }
  }
}

/** Intergiciel Prisma ($use) : à enregistrer une seule fois sur le client. */
export function tenantMiddleware(client: any) {
  return async (params: any, next: (p: any) => Promise<any>) => {
    const ctx = requestContext.getStore();
    const model: string | undefined = params.model;
    if (!model) return next(params);
    const args = params.args || (params.args = {});
    const isCreate = params.action === 'create' || params.action === 'createMany';

    // Renseignement automatique des nouvelles colonnes (avec ou sans utilisateur connecté)
    if (!ctx?.bypass) {
      if (params.action === 'create') await fill(client, model, args.data, ctx);
      else if (params.action === 'createMany') for (const d of [].concat(args.data || [])) await fill(client, model, d, ctx);
      else if (params.action === 'upsert') await fill(client, model, args.create, ctx);
    }
    if (!ctx || ctx.bypass || !ctx.organizationId) return next(params);
    await ensureSites(client, ctx);

    const mode: Mode = READ.has(params.action) ? 'read' : 'write';
    const scope = scopeFor(model, ctx, mode);
    if (scope === null) throw new ForbiddenException(`Accès refusé : la table ${model} n'a pas de règle de cloisonnement.`);

    if (scope && (READ.has(params.action) || WHERE_WRITE.has(params.action))) args.where = andWhere(args.where, scope);
    if (isCreate) await checkData(client, model, args.data, ctx, true);
    if (params.action === 'update' || params.action === 'updateMany') await checkData(client, model, args.data, ctx, false);
    if (params.action === 'upsert') { await checkData(client, model, args.create, ctx, true); await checkData(client, model, args.update, ctx, false); }

    const result = await next(params);
    if (model === 'Site' && isCreate) { forgetOrgSites(ctx.organizationId); if (!ctx.siteId) ctx.siteIds = undefined; }
    return result;
  };
}

/** Exécute fn en autorisant tous les sites de l'entreprise (ex. transfert de stock vers un autre site). */
export async function withinOrganization<T>(client: any, fn: () => Promise<T>): Promise<T> {
  const ctx = requestContext.getStore();
  if (!ctx || !ctx.organizationId) return fn();
  const wide: RequestContext = { ...ctx, siteId: undefined, siteIds: undefined };
  await ensureSites(client, wide);
  return inContext(wide, fn);
}

/**
 * Sites autorisés pour la requête en cours, à utiliser dans les requêtes SQL directes
 * (qui ne passent pas par le filtre automatique). null = aucun utilisateur connecté (tâche interne).
 */
export async function allowedSiteIds(client: any): Promise<string[] | null> {
  const ctx = requestContext.getStore();
  if (!ctx || ctx.bypass || !ctx.organizationId) return null;
  await ensureSites(client, ctx);
  return ctx.siteIds || [];
}

/** Entreprise de la requête en cours (null hors requête utilisateur). */
export const currentOrganizationId = (): string | null => requestContext.getStore()?.organizationId ?? null;
