import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================================
// Migrations numérotées de la base de données.
//
// Fichiers : prisma/migrations-sql/NNNN_nom.up.sql (obligatoire) et NNNN_nom.down.sql (retour arrière,
// quand il est techniquement possible). Chaque migration :
//   1. s'exécute dans UNE transaction (tout ou rien), sous un verrou qui empêche deux serveurs de migrer
//      en même temps ;
//   2. sauvegarde d'abord, dans le schéma « migration_backups », les tables annoncées dans son en-tête
//      par une ligne « -- sauvegarde: table1, table2 » (copie complète, conservée) ;
//   3. est inscrite dans schema_migrations (version, nom, empreinte, date, durée) et dans le journal
//      schema_migrations_log (application, retour arrière, échecs).
// Une migration déjà appliquée dont le fichier a changé est signalée (empreinte différente) sans être rejouée.
// Commandes : node dist/migrations/cli.js status | up | down <version>
// ============================================================================================

export interface MigrationFile { version: number; name: string; up: string; down?: string; checksum: string; backups: string[] }

const LOCK_KEY = 72839101;

export function migrationsDir(): string {
  const candidates = [join(__dirname, '..', '..', 'prisma', 'migrations-sql'), join(process.cwd(), 'prisma', 'migrations-sql')];
  return candidates.find((d) => existsSync(d)) || candidates[0];
}

export function loadMigrations(dir = migrationsDir()): MigrationFile[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir);
  const out: MigrationFile[] = [];
  for (const f of files.filter((x) => /^\d{4}_[a-z0-9_]+\.up\.sql$/.test(x)).sort()) {
    const version = Number(f.slice(0, 4));
    const name = f.replace(/^\d{4}_/, '').replace(/\.up\.sql$/, '');
    const up = readFileSync(join(dir, f), 'utf-8');
    const downFile = f.replace('.up.sql', '.down.sql');
    const down = files.includes(downFile) ? readFileSync(join(dir, downFile), 'utf-8') : undefined;
    const m = up.match(/^--\s*sauvegarde\s*:\s*(.+)$/im);
    const backups = m ? m[1].split(',').map((t) => t.trim()).filter((t) => /^[a-z_][a-z0-9_]*$/.test(t)) : [];
    if (out.some((o) => o.version === version)) throw new Error(`Migration ${version} en double.`);
    out.push({ version, name, up, down, backups, checksum: createHash('sha256').update(up).digest('hex').slice(0, 16) });
  }
  return out;
}

/** Découpe un fichier SQL en instructions (séparateur « ; » en fin de ligne, hors blocs $$ … $$). */
export function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = '', inDollar = false;
  for (const line of sql.split('\n')) {
    if (line.trim().startsWith('--') && !inDollar) continue;
    const dollars = (line.match(/\$\$/g) || []).length;
    if (dollars % 2 === 1) inDollar = !inDollar;
    cur += line + '\n';
    if (!inDollar && /;\s*$/.test(line)) { const st = cur.trim().replace(/;\s*$/, ''); if (st) out.push(st); cur = ''; }
  }
  if (cur.trim()) out.push(cur.trim().replace(/;\s*$/, ''));
  return out;
}

const BOOTSTRAP = [
  `CREATE TABLE IF NOT EXISTS "schema_migrations" ("version" INTEGER PRIMARY KEY, "name" TEXT NOT NULL, "checksum" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "duration_ms" INTEGER NOT NULL DEFAULT 0, "applied_by" TEXT)`,
  `CREATE TABLE IF NOT EXISTS "schema_migrations_log" ("id" SERIAL PRIMARY KEY, "version" INTEGER NOT NULL, "name" TEXT NOT NULL,
    "direction" TEXT NOT NULL, "ok" BOOLEAN NOT NULL, "error" TEXT, "duration_ms" INTEGER NOT NULL DEFAULT 0, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE SCHEMA IF NOT EXISTS "migration_backups"`,
];

async function log(prisma: any, m: MigrationFile, direction: 'UP' | 'DOWN', ok: boolean, ms: number, error?: string) {
  await prisma.$executeRawUnsafe('INSERT INTO "schema_migrations_log" ("version","name","direction","ok","error","duration_ms") VALUES ($1,$2,$3,$4,$5,$6)',
    m.version, m.name, direction, ok, error ? error.slice(0, 1000) : null, ms).catch(() => undefined);
}

export async function migrationStatus(prisma: any) {
  for (const s of BOOTSTRAP) await prisma.$executeRawUnsafe(s);
  const applied = (await prisma.$queryRawUnsafe('SELECT "version","name","checksum","applied_at" FROM "schema_migrations" ORDER BY "version"')) as any[];
  const files = loadMigrations();
  return files.map((f) => {
    const a = applied.find((x) => Number(x.version) === f.version);
    return { version: f.version, name: f.name, applied: !!a, appliedAt: a?.applied_at ?? null, changed: !!a && a.checksum !== f.checksum, reversible: !!f.down };
  });
}

/** Applique les migrations en attente, dans l'ordre. Renvoie les versions appliquées. */
export async function runMigrations(prisma: any, by = 'demarrage'): Promise<number[]> {
  for (const s of BOOTSTRAP) await prisma.$executeRawUnsafe(s);
  const done: number[] = [];
  for (const m of loadMigrations()) {
    const t0 = Date.now();
    try {
      const applied = await prisma.$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
        const row = (await tx.$queryRawUnsafe('SELECT "checksum" FROM "schema_migrations" WHERE "version" = $1', m.version)) as any[];
        if (row.length) {
          if (row[0].checksum !== m.checksum) console.warn(`⚠️  Migration ${m.version} (${m.name}) : le fichier a changé depuis son application (non rejouée).`);
          return false;
        }
        for (const t of m.backups) {
          const exists = (await tx.$queryRawUnsafe(`SELECT to_regclass('public."${t}"') IS NOT NULL AS e`)) as any[];
          if (!exists[0]?.e) continue;
          const copy = `v${String(m.version).padStart(4, '0')}_${t}`;
          await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "migration_backups"."${copy}"`);
          await tx.$executeRawUnsafe(`CREATE TABLE "migration_backups"."${copy}" AS TABLE "public"."${t}"`);
        }
        for (const st of splitSql(m.up)) await tx.$executeRawUnsafe(st);
        await tx.$executeRawUnsafe('INSERT INTO "schema_migrations" ("version","name","checksum","duration_ms","applied_by") VALUES ($1,$2,$3,$4,$5)',
          m.version, m.name, m.checksum, Date.now() - t0, by);
        return true;
      }, { timeout: 600000, maxWait: 60000 });
      if (applied) {
        await log(prisma, m, 'UP', true, Date.now() - t0);
        console.log(`✅ Migration ${m.version} (${m.name}) appliquée en ${Date.now() - t0} ms.`);
        done.push(m.version);
      }
    } catch (e: any) {
      await log(prisma, m, 'UP', false, Date.now() - t0, String(e?.message ?? e));
      console.error(`⛔ Migration ${m.version} (${m.name}) en échec, aucune modification gardée :`, e?.message ?? e);
      throw e;
    }
  }
  return done;
}

/** Retour arrière d'UNE migration (la plus récente seulement, pour garder un historique cohérent). */
export async function rollbackMigration(prisma: any, version: number): Promise<void> {
  for (const s of BOOTSTRAP) await prisma.$executeRawUnsafe(s);
  const m = loadMigrations().find((x) => x.version === version);
  if (!m) throw new Error(`Migration ${version} introuvable.`);
  if (!m.down) throw new Error(`Migration ${version} : pas de retour arrière possible (aucun fichier .down.sql).`);
  const t0 = Date.now();
  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
      const last = (await tx.$queryRawUnsafe('SELECT MAX("version") AS v FROM "schema_migrations"')) as any[];
      if (Number(last[0]?.v) !== version) throw new Error(`Seule la dernière migration appliquée peut être annulée (dernière : ${last[0]?.v ?? 'aucune'}).`);
      for (const st of splitSql(m.down!)) await tx.$executeRawUnsafe(st);
      await tx.$executeRawUnsafe('DELETE FROM "schema_migrations" WHERE "version" = $1', version);
    }, { timeout: 600000, maxWait: 60000 });
    await log(prisma, m, 'DOWN', true, Date.now() - t0);
  } catch (e: any) {
    await log(prisma, m, 'DOWN', false, Date.now() - t0, String(e?.message ?? e));
    throw e;
  }
}
