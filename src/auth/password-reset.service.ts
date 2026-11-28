import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { MessagingService } from '../messaging/messaging.service';
import { accountStateCache } from './account-state';
import {
  RESET_CODE_TTL_MS,
  RESET_REQUESTS_PER_ACCOUNT_HOUR,
  RESET_REQUESTS_PER_IP_HOUR,
  consumeResetCode,
  findAccount,
  identifierHash,
  issueResetCode,
  resetSecretAvailable,
} from './password-reset';

// Réponse identique dans tous les cas : on ne révèle jamais si un compte existe.
export const GENERIC_RESET_MESSAGE =
  "Si ce compte existe, un code à 6 chiffres vous a été envoyé par e-mail, ou votre responsable a été prévenu et vous le remettra après avoir vérifié votre identité. Le code est valable 15 minutes.";
const INVALID = 'Code invalide ou expiré. Demandez un nouveau code.';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  constructor(private prisma: PrismaService, private audit: AuditService, private messaging: MessagingService) {}

  private async log(identHash: string, userId: string | null, ip: string | undefined, outcome: string) {
    await this.prisma.$executeRaw`INSERT INTO "password_reset_requests" ("id","identifier_hash","user_id","ip","outcome")
      VALUES (${randomUUID()}, ${identHash}, ${userId}, ${ip ?? null}, ${outcome})`.catch(() => undefined);
  }

  /** Demande publique (« Mot de passe oublié ? »). */
  async request(identifier: string, ip?: string) {
    if (!resetSecretAvailable()) return { message: GENERIC_RESET_MESSAGE };
    const ih = identifierHash(identifier);
    const [byIdent, byIp] = await Promise.all([
      this.prisma.$queryRaw<any[]>`SELECT COUNT(*)::int AS n FROM "password_reset_requests" WHERE "identifier_hash" = ${ih} AND "created_at" > NOW() - INTERVAL '1 hour'`,
      ip ? this.prisma.$queryRaw<any[]>`SELECT COUNT(*)::int AS n FROM "password_reset_requests" WHERE "ip" = ${ip} AND "created_at" > NOW() - INTERVAL '1 hour'` : Promise.resolve([{ n: 0 }]),
    ]);
    if (Number(byIdent[0]?.n) >= RESET_REQUESTS_PER_ACCOUNT_HOUR || Number(byIp[0]?.n) >= RESET_REQUESTS_PER_IP_HOUR) {
      await this.log(ih, null, ip, 'LIMITE');
      return { message: GENERIC_RESET_MESSAGE };
    }
    const user = await findAccount(this.prisma, identifier);
    if (!user) {
      await this.log(ih, null, ip, 'INCONNU');
      return { message: GENERIC_RESET_MESSAGE };
    }

    // 1) Envoi direct par e-mail quand le service d'envoi est configuré et que l'adresse est réelle.
    const realEmail = !!user.email && user.email.includes('@') && !/\.(local|invalid|test)$/i.test(user.email);
    if (realEmail && this.messaging.configured) {
      const c = await issueResetCode(this.prisma, user, 'EMAIL', null);
      const r = await this.messaging.sendText(
        user.email,
        'Code de récupération — SYL LOGISTIQUE',
        `Bonjour ${user.firstName},\n\nVotre code de récupération est : ${c.code}\n\nIl est valable 15 minutes et ne peut servir qu'une seule fois.\nSi vous n'avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable.\n\nSYL LOGISTIQUE`,
      );
      if (r.sent) {
        await this.log(ih, user.id, ip, 'EMAIL_ENVOYE');
        await this.audit.log({ userId: user.id, action: 'UPDATE', entity: 'User', entityId: user.id, newValue: { event: 'PASSWORD_RESET_CODE_SENT', channel: 'EMAIL' } });
        return { message: GENERIC_RESET_MESSAGE };
      }
      // Envoi échoué : le code n'a jamais été reçu, on l'annule.
      await this.prisma.$executeRaw`UPDATE "password_reset_codes" SET "status" = 'REMPLACE' WHERE "id" = ${c.id}`;
    }

    // 2) Procédure administrateur : les responsables sont prévenus (une fois par heure au plus),
    //    vérifient l'identité de la personne puis lui remettent un code depuis le menu Utilisateurs.
    const recent = await this.prisma.$queryRaw<any[]>`SELECT 1 FROM "password_reset_requests"
      WHERE "user_id" = ${user.id} AND "outcome" = 'ADMIN_PREVENU' AND "created_at" > NOW() - INTERVAL '1 hour' LIMIT 1`;
    if (!recent.length) {
      for (const roleName of ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE']) {
        await this.prisma.notification
          .create({
            data: {
              title: 'Mot de passe oublié',
              message: `${user.firstName} ${user.lastName} demande à récupérer son accès. Vérifiez son identité (appel ou en personne), puis Utilisateurs → « Code de récupération ». Ne communiquez jamais un code par un autre canal que celui que vous avez vérifié.`,
              severity: 'WARNING',
              entity: 'User',
              entityId: user.id,
              roleName,
              siteId: user.siteId ?? undefined,
            },
          })
          .catch(() => undefined);
      }
    }
    await this.log(ih, user.id, ip, 'ADMIN_PREVENU');
    return { message: GENERIC_RESET_MESSAGE };
  }

  /** Saisie du code et du nouveau mot de passe. */
  async confirm(identifier: string, code: string, newPassword: string, ip?: string) {
    const user = await findAccount(this.prisma, identifier);
    if (!user) throw new BadRequestException(INVALID);
    const r = await consumeResetCode(this.prisma, user.id, code);
    if (!r.ok) {
      await this.log(identifierHash(identifier), user.id, ip, 'CODE_REFUSE');
      if (r.reason === 'BLOQUE') {
        await this.audit.log({ userId: user.id, action: 'UPDATE', entity: 'User', entityId: user.id, newValue: { event: 'PASSWORD_RESET_CODE_BLOCKED' } });
        throw new BadRequestException('Trop d\'essais : ce code est bloqué. Demandez un nouveau code.');
      }
      if (r.reason === 'FAUX') throw new BadRequestException(`Code incorrect. Essais restants : ${r.remaining}.`);
      throw new BadRequestException(INVALID);
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException("Le nouveau mot de passe doit être différent de l'ancien. Demandez un nouveau code.");
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false, refreshTokenHash: null },
    });
    accountStateCache.forget(user.id);
    await this.log(identifierHash(identifier), user.id, ip, 'MOT_DE_PASSE_CHANGE');
    await this.audit.log({ userId: user.id, action: 'UPDATE', entity: 'User', entityId: user.id, newValue: { event: 'PASSWORD_RESET_BY_CODE', channel: r.channel } });
    this.logger.log(`Mot de passe récupéré par code (${r.channel}) pour le compte ${user.id}`);
    return { success: true, message: 'Mot de passe changé. Connectez-vous avec votre nouveau mot de passe.' };
  }

  static readonly ttlMinutes = RESET_CODE_TTL_MS / 60000;
}
