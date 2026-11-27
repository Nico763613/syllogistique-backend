// Numérotation centrale des documents : une séquence par type de document et par exercice (année).
// Attribution atomique (une seule instruction SQL verrouille la ligne) : deux utilisateurs simultanés ne reçoivent jamais le même numéro,
// et un numéro attribué n'est jamais réutilisé (même si le document est annulé). Chaque attribution est historisée (document_number_log).
import { currentOrganizationId } from './tenant-scope';

// Numérotation par entreprise (migration 0004) : chaque entreprise a son code (ex. VTX) et ses propres compteurs,
// le numéro devient PREFIXE-CODE-AAAA-NNNN et reste unique sur toute la plateforme. Sans entreprise connue
// (tâches internes) ou si la migration n'est pas encore appliquée : ancienne numérotation commune.
type Db = { $queryRawUnsafe: (q: string, ...a: any[]) => Promise<any>; $executeRawUnsafe: (q: string, ...a: any[]) => Promise<any> };

export const DOC_SEQUENCE_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS "document_sequences" ("doc_type" TEXT NOT NULL, "year" INTEGER NOT NULL, "last_value" INTEGER NOT NULL DEFAULT 0, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("doc_type", "year"))`,
  `CREATE TABLE IF NOT EXISTS "document_number_log" ("number" TEXT NOT NULL PRIMARY KEY, "doc_type" TEXT NOT NULL, "year" INTEGER NOT NULL, "seq" INTEGER NOT NULL, "assigned_by" TEXT, "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  'CREATE INDEX IF NOT EXISTS "document_number_log_type_idx" ON "document_number_log"("doc_type", "year", "seq")',
  // Réglages de numérotation par type de document (préfixe, nombre de chiffres, année dans le numéro, remise à zéro annuelle).
  `CREATE TABLE IF NOT EXISTS "document_numbering_config" ("doc_type" TEXT NOT NULL PRIMARY KEY, "prefix" TEXT NOT NULL, "pad" INTEGER NOT NULL DEFAULT 4, "include_year" BOOLEAN NOT NULL DEFAULT TRUE, "reset_yearly" BOOLEAN NOT NULL DEFAULT TRUE, "updated_by" TEXT, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
];

// Types de documents numérotés (code, libellé, préfixe par défaut) : sert à l'écran de réglages.
export const DOC_TYPES: { code: string; label: string; prefix: string }[] = [
  { code: 'DEV', label: 'Devis', prefix: 'DEV' },
  { code: 'BCC', label: 'Commande client', prefix: 'BCC' },
  { code: 'BL', label: 'Bon de livraison', prefix: 'BL' },
  { code: 'FV', label: 'Facture de vente', prefix: 'FV' },
  { code: 'REC', label: 'Reçu de paiement', prefix: 'REC' },
  { code: 'AV', label: 'Avoir / retour client', prefix: 'AV' },
  { code: 'DA', label: "Demande d'achat", prefix: 'DA' },
  { code: 'DP', label: 'Demande de prix fournisseur', prefix: 'DP' },
  { code: 'BC', label: 'Bon de commande fournisseur', prefix: 'BC' },
  { code: 'BR', label: 'Bon de réception', prefix: 'BR' },
  { code: 'FA', label: 'Facture fournisseur', prefix: 'FA' },
  { code: 'EB', label: 'État de besoin', prefix: 'EB' },
  { code: 'TR', label: 'Transfert de stock', prefix: 'TR' },
  { code: 'HSE', label: 'Incident HSE', prefix: 'HSE' },
];

export function formatDocNumber(prefix: string, year: number, seq: number, pad = 4): string {
  return `${prefix}-${year}-${String(seq).padStart(pad, '0')}`;
}

/**
 * @param seed donne le plus grand numéro déjà utilisé pour ce type/exercice (documents créés avant la mise en place de la séquence) ;
 *             appelé seulement à la première attribution.
 */
/** Code de numérotation de l'entreprise (créé au premier appel), ou null si indisponible. */
export async function orgDocCode(db: Db, orgId: string | null | undefined): Promise<string | null> {
  if (!orgId) return null;
  try { return (((await db.$queryRawUnsafe('SELECT org_doc_code($1) AS c', orgId)) as any[])[0]?.c as string) || null; } catch { return null; }
}

/** Clé de séquence et de réglage d'un type de document pour une entreprise. */
export const docKey = (orgId: string | null, docType: string) => (orgId ? `${orgId}:${docType}` : docType);

export async function nextDocNumber(db: Db, docType: string, prefix: string, seed: (year: number, fullPrefix: string) => Promise<number>, opts: { pad?: number; by?: string; year?: number; orgId?: string | null } = {}): Promise<string> {
  const year = opts.year ?? new Date().getFullYear();
  const orgId = opts.orgId !== undefined ? opts.orgId : currentOrganizationId();
  const code = await orgDocCode(db, orgId);
  const key = docKey(code ? orgId! : null, docType);
  // Réglage éventuel (préfixe / chiffres / année / remise à zéro) : celui de l'entreprise, sinon le réglage commun.
  let cfg: any = null;
  try { cfg = ((await db.$queryRawUnsafe('SELECT "prefix","pad","include_year","reset_yearly" FROM "document_numbering_config" WHERE "doc_type" IN ($1,$2) ORDER BY ("doc_type" = $1) DESC LIMIT 1', key, docType)) as any[])?.[0] || null; } catch { cfg = null; }
  const usePrefix = (cfg?.prefix || prefix) + (code ? `-${code}` : '');
  const pad = cfg ? Number(cfg.pad) || 4 : (opts.pad ?? 4);
  const resetYearly = cfg ? cfg.reset_yearly !== false : true;
  const includeYear = cfg ? (resetYearly ? true : cfg.include_year !== false) : true;
  const seqYear = resetYearly ? year : 0;
  const row = await db.$queryRawUnsafe('SELECT 1 AS x FROM "document_sequences" WHERE "doc_type" = $1 AND "year" = $2', key, seqYear);
  if (!row.length) {
    const start = Math.max(0, Math.floor(await seed(year, usePrefix)) || 0);
    await db.$executeRawUnsafe('INSERT INTO "document_sequences" ("doc_type","year","last_value") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', key, seqYear, start);
  }
  const r = await db.$queryRawUnsafe('UPDATE "document_sequences" SET "last_value" = "last_value" + 1, "updated_at" = CURRENT_TIMESTAMP WHERE "doc_type" = $1 AND "year" = $2 RETURNING "last_value" AS v', key, seqYear);
  const seq = Number(r[0].v);
  const number = includeYear ? formatDocNumber(usePrefix, year, seq, pad) : `${usePrefix}-${String(seq).padStart(pad, '0')}`;
  await db.$executeRawUnsafe('INSERT INTO "document_number_log" ("number","doc_type","year","seq","assigned_by") VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', number, key, year, seq, opts.by ?? null);
  return number;
}

// Plus grand numéro déjà présent parmi des références existantes « PREFIX-AAAA-NNNN ».
export function maxSeqOf(refs: string[]): number {
  return refs.reduce((m, r) => { const n = parseInt(String(r).split('-').pop() || '0', 10); return Number.isFinite(n) && n > m ? n : m; }, 0);
}

// Numéro de reçu d'un encaissement (REC-AAAA-NNNN) : attribué une seule fois, à l'enregistrement du paiement (ou à la première édition pour les paiements antérieurs).
export async function ensureReceiptNumber(db: Db, paymentId: string, by?: string): Promise<string> {
  const read = async () => ((await db.$queryRawUnsafe('SELECT "receipt_number" AS n FROM "payments" WHERE "id" = $1', paymentId)) as any[])[0]?.n as string | undefined;
  const cur = await read(); if (cur) return cur;
  const n = await nextDocNumber(db, 'REC', 'REC', async (year) => maxSeqOf(((await db.$queryRawUnsafe('SELECT "receipt_number" AS n FROM "payments" WHERE "receipt_number" LIKE $1', `REC-${year}-%`)) as any[]).map((r) => r.n)), { by });
  const set = (await db.$queryRawUnsafe('UPDATE "payments" SET "receipt_number" = $1 WHERE "id" = $2 AND "receipt_number" IS NULL RETURNING "receipt_number" AS n', n, paymentId)) as any[];
  return set.length ? n : ((await read()) as string);
}

// Raccourci : prochaine référence « PREFIX-AAAA-NNNN » pour une table qui a une colonne `reference` (la séquence reprend les numéros déjà utilisés).
export async function nextRefOf(prisma: any, prefix: string, model: string, by?: string): Promise<string> {
  return nextDocNumber(prisma, prefix, prefix, async (year, full) => {
    const rows = await prisma[model].findMany({ where: { reference: { startsWith: `${full}-${year}-` } }, select: { reference: true } });
    return maxSeqOf(rows.map((r: any) => r.reference || ''));
  }, { by });
}
