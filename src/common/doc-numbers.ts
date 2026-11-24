// Numérotation centrale des documents : une séquence par type de document et par exercice (année).
// Attribution atomique (une seule instruction SQL verrouille la ligne) : deux utilisateurs simultanés ne reçoivent jamais le même numéro,
// et un numéro attribué n'est jamais réutilisé (même si le document est annulé). Chaque attribution est historisée (document_number_log).
type Db = { $queryRawUnsafe: (q: string, ...a: any[]) => Promise<any>; $executeRawUnsafe: (q: string, ...a: any[]) => Promise<any> };

export const DOC_SEQUENCE_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS "document_sequences" ("doc_type" TEXT NOT NULL, "year" INTEGER NOT NULL, "last_value" INTEGER NOT NULL DEFAULT 0, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("doc_type", "year"))`,
  `CREATE TABLE IF NOT EXISTS "document_number_log" ("number" TEXT NOT NULL PRIMARY KEY, "doc_type" TEXT NOT NULL, "year" INTEGER NOT NULL, "seq" INTEGER NOT NULL, "assigned_by" TEXT, "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  'CREATE INDEX IF NOT EXISTS "document_number_log_type_idx" ON "document_number_log"("doc_type", "year", "seq")',
];

export function formatDocNumber(prefix: string, year: number, seq: number, pad = 4): string {
  return `${prefix}-${year}-${String(seq).padStart(pad, '0')}`;
}

/**
 * @param seed donne le plus grand numéro déjà utilisé pour ce type/exercice (documents créés avant la mise en place de la séquence) ;
 *             appelé seulement à la première attribution.
 */
export async function nextDocNumber(db: Db, docType: string, prefix: string, seed: (year: number) => Promise<number>, opts: { pad?: number; by?: string; year?: number } = {}): Promise<string> {
  const year = opts.year ?? new Date().getFullYear();
  const key = `${docType}`;
  const row = await db.$queryRawUnsafe('SELECT 1 AS x FROM "document_sequences" WHERE "doc_type" = $1 AND "year" = $2', key, year);
  if (!row.length) {
    const start = Math.max(0, Math.floor(await seed(year)) || 0);
    await db.$executeRawUnsafe('INSERT INTO "document_sequences" ("doc_type","year","last_value") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', key, year, start);
  }
  const r = await db.$queryRawUnsafe('UPDATE "document_sequences" SET "last_value" = "last_value" + 1, "updated_at" = CURRENT_TIMESTAMP WHERE "doc_type" = $1 AND "year" = $2 RETURNING "last_value" AS v', key, year);
  const seq = Number(r[0].v);
  const number = formatDocNumber(prefix, year, seq, opts.pad ?? 4);
  await db.$executeRawUnsafe('INSERT INTO "document_number_log" ("number","doc_type","year","seq","assigned_by") VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', number, key, year, seq, opts.by ?? null);
  return number;
}

// Plus grand numéro déjà présent parmi des références existantes « PREFIX-AAAA-NNNN ».
export function maxSeqOf(refs: string[]): number {
  return refs.reduce((m, r) => { const n = parseInt(String(r).split('-').pop() || '0', 10); return Number.isFinite(n) && n > m ? n : m; }, 0);
}
