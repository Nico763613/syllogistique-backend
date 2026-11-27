import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma.service';

// Récupération du mot de passe par code à usage unique.
//  - code de 6 chiffres, valable 15 minutes, 5 essais au plus, utilisable une seule fois ;
//  - jamais stocké en clair : empreinte HMAC-SHA256 avec une clé du serveur (inutilisable si la base fuit) ;
//  - un nouveau code remplace le précédent ;
//  - demandes publiques limitées : 3 par compte et par heure, 10 par adresse IP et par heure.
export const RESET_CODE_TTL_MS = 15 * 60 * 1000;
export const RESET_CODE_MAX_ATTEMPTS = 5;
export const RESET_REQUESTS_PER_ACCOUNT_HOUR = 3;
export const RESET_REQUESTS_PER_IP_HOUR = 10;

const secret = () => process.env.RESET_CODE_SECRET || process.env.JWT_ACCESS_SECRET || '';

export function resetSecretAvailable(): boolean {
  return secret().length >= 16;
}

export const codeHash = (codeId: string, code: string) => createHmac('sha256', secret()).update(`${codeId}:${code}`).digest('hex');
export const identifierHash = (identifier: string) =>
  createHmac('sha256', secret()).update('ident:' + normalizeIdentifier(identifier)).digest('hex');

export function normalizeIdentifier(identifier: string): string {
  const v = String(identifier || '').trim().toLowerCase();
  if (v.includes('@')) return v.slice(0, 160);
  return v.replace(/\D/g, '').slice(-9);
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Retrouve un compte actif par e-mail ou par téléphone (9 derniers chiffres, sans ambiguïté). */
export async function findAccount(prisma: PrismaService, identifier: string) {
  const v = normalizeIdentifier(identifier);
  if (!v) return null;
  if (v.includes('@')) {
    const u = await prisma.user.findFirst({ where: { email: { equals: v, mode: 'insensitive' }, deletedAt: null, status: 'ACTIVE' } });
    return u ?? null;
  }
  if (v.length < 8) return null;
  const cands = await prisma.user.findMany({ where: { phone: { not: null }, deletedAt: null, status: 'ACTIVE' } });
  const hits = cands.filter((c) => (c.phone ?? '').replace(/\D/g, '').slice(-9) === v);
  return hits.length === 1 ? hits[0] : null;
}

/** Crée un nouveau code (les codes encore actifs du compte sont remplacés). Renvoie le code en clair, une seule fois. */
export async function issueResetCode(
  prisma: PrismaService,
  user: { id: string; organizationId?: string | null },
  channel: 'ADMIN' | 'EMAIL',
  by?: string | null,
): Promise<{ id: string; code: string; expiresAt: Date }> {
  if (!resetSecretAvailable()) throw new Error('RESET_CODE_SECRET manquant');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
  await prisma.$executeRaw`UPDATE "password_reset_codes" SET "status" = 'REMPLACE' WHERE "user_id" = ${user.id} AND "status" = 'ACTIF'`;
  await prisma.$executeRaw`INSERT INTO "password_reset_codes" ("id","user_id","organization_id","code_hash","channel","created_by","expires_at")
    VALUES (${id}, ${user.id}, ${user.organizationId ?? null}, ${codeHash(id, code)}, ${channel}, ${by ?? null}, ${expiresAt})`;
  return { id, code, expiresAt };
}

/** Vérifie un code. Chaque échec consomme un essai ; au 5e échec le code est bloqué. */
export async function consumeResetCode(
  prisma: PrismaService,
  userId: string,
  code: string,
): Promise<{ ok: true; codeId: string; channel: string } | { ok: false; reason: 'AUCUN' | 'BLOQUE' | 'FAUX'; remaining?: number }> {
  const rows = await prisma.$queryRaw<any[]>`SELECT "id","code_hash","attempts","channel" FROM "password_reset_codes"
    WHERE "user_id" = ${userId} AND "status" = 'ACTIF' AND "expires_at" > NOW() ORDER BY "created_at" DESC LIMIT 1`;
  const c = rows[0];
  if (!c) return { ok: false, reason: 'AUCUN' };
  if (Number(c.attempts) >= RESET_CODE_MAX_ATTEMPTS) {
    await prisma.$executeRaw`UPDATE "password_reset_codes" SET "status" = 'BLOQUE' WHERE "id" = ${c.id}`;
    return { ok: false, reason: 'BLOQUE' };
  }
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6 || !sameHash(codeHash(c.id, clean), c.code_hash)) {
    const up = await prisma.$queryRaw<any[]>`UPDATE "password_reset_codes" SET "attempts" = "attempts" + 1,
      "status" = CASE WHEN "attempts" + 1 >= ${RESET_CODE_MAX_ATTEMPTS} THEN 'BLOQUE' ELSE "status" END
      WHERE "id" = ${c.id} RETURNING "attempts","status"`;
    const remaining = Math.max(0, RESET_CODE_MAX_ATTEMPTS - Number(up[0]?.attempts ?? RESET_CODE_MAX_ATTEMPTS));
    return remaining ? { ok: false, reason: 'FAUX', remaining } : { ok: false, reason: 'BLOQUE' };
  }
  // Usage unique, même en cas de deux envois simultanés : seul le premier passe.
  const won = await prisma.$queryRaw<any[]>`UPDATE "password_reset_codes" SET "status" = 'UTILISE', "used_at" = NOW()
    WHERE "id" = ${c.id} AND "status" = 'ACTIF' RETURNING "id"`;
  if (!won.length) return { ok: false, reason: 'AUCUN' };
  return { ok: true, codeId: c.id, channel: c.channel };
}
