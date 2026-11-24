import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';

// Invitations individuelles : lien à usage unique, valable 72 h. Seul l'empreinte (SHA-256) du jeton est conservée.
export const INVITE_TTL_MS = 72 * 3600 * 1000;
const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

export async function issueInvitation(prisma: PrismaService, userId: string, by?: string): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + INVITE_TTL_MS);
  // Un nouveau lien annule les précédents encore inutilisés
  await prisma.$executeRaw`UPDATE "user_invitations" SET "expires_at" = NOW() WHERE "user_id" = ${userId} AND "used_at" IS NULL AND "expires_at" > NOW()`;
  await prisma.$executeRaw`INSERT INTO "user_invitations" ("id","user_id","token_hash","expires_at","created_by") VALUES (${randomUUID()}, ${userId}, ${hashOf(token)}, ${expires}, ${by ?? null})`;
  return token;
}

export function inviteLink(appUrl: string, token: string, espace?: string) {
  const sep = appUrl.includes('?') ? '&' : '?';
  return `${appUrl}${sep}invite=${token}${espace ? '&espace=' + espace : ''}`;
}

export async function findInvitation(prisma: PrismaService, token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token || '')) return null;
  const rows: any[] = await prisma.$queryRaw`SELECT "id","user_id" FROM "user_invitations" WHERE "token_hash" = ${hashOf(token)} AND "used_at" IS NULL AND "expires_at" > NOW() LIMIT 1`;
  return rows[0] ? { id: rows[0].id as string, userId: rows[0].user_id as string } : null;
}

export async function consumeInvitation(prisma: PrismaService, id: string) {
  await prisma.$executeRaw`UPDATE "user_invitations" SET "used_at" = NOW() WHERE "id" = ${id}`;
}
