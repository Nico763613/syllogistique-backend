import { accountStateCache } from './account-state';
import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto, ChangePasswordDto } from './dto/auth.dto';
import { findInvitation, consumeInvitation } from './invitations';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
  ) {}

  private async signTokens(user: {
    id: string;
    email: string;
    organizationId: string;
    siteId: string | null;
    department?: string | null;
    role: { name: string };
  }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
      organizationId: user.organizationId,
      siteId: user.siteId ?? undefined,
      department: user.department ?? undefined,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') || '15m',
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') || '30d',
    });

    return { accessToken, refreshToken };
  }

  // Limite d'appareils : Directeur général = 1 ordinateur + 1 téléphone ; autres profils = 1 appareil.
  // Le Super administrateur et les chauffeurs (activation par QR) sont exclus. Un autre appareil est refusé,
  // l'administration est alertée, et après 3 tentatives l'appareil est bloqué. Seul l'administrateur libère une place.
  private async enforceDeviceLimit(user: any, dto: LoginDto) {
    const role: string = user.role.name;
    if (!dto.deviceFp || role === 'SUPER_ADMIN' || role === 'CHAUFFEUR') return; // anciens clients sans identifiant : non bloqués
    const kind = dto.deviceKind === 'DESKTOP' ? 'DESKTOP' : 'MOBILE';
    const name = (dto.deviceName ?? '').slice(0, 120) || null;
    const rows = await this.prisma.$queryRaw<any[]>`select * from user_devices where user_id = ${user.id} and status in ('ACTIVE','REFUSED','BLOCKED')`;
    const mine = rows.find((r) => r.fp === dto.deviceFp);
    if (mine?.status === 'ACTIVE') {
      await this.prisma.$executeRaw`update user_devices set last_seen = now() where id = ${mine.id}`;
      return;
    }
    const active = rows.filter((r) => r.status === 'ACTIVE');
    const used = role === 'DIRECTEUR_GENERAL' ? active.filter((r) => r.kind === kind).length : active.length;
    if (used < 1 && mine?.status !== 'BLOCKED') {
      if (mine) await this.prisma.$executeRaw`update user_devices set status = 'ACTIVE', attempts = 0, kind = ${kind}, name = ${name}, last_seen = now() where id = ${mine.id}`;
      else await this.prisma.$executeRaw`insert into user_devices (id, user_id, fp, kind, name) values (${randomUUID()}, ${user.id}, ${dto.deviceFp}, ${kind}, ${name})`;
      return;
    }
    // Refus
    const attempts = (mine?.attempts ?? 0) + 1;
    const status = attempts >= 3 ? 'BLOCKED' : 'REFUSED';
    if (mine) await this.prisma.$executeRaw`update user_devices set attempts = ${attempts}, status = ${status}, last_seen = now() where id = ${mine.id}`;
    else await this.prisma.$executeRaw`insert into user_devices (id, user_id, fp, kind, name, status, attempts) values (${randomUUID()}, ${user.id}, ${dto.deviceFp}, ${kind}, ${name}, ${status}, ${attempts})`;
    await this.prisma.notification
      .create({ data: { title: status === 'BLOCKED' ? 'Appareil bloqué' : 'Appareil non autorisé', message: `${user.firstName} ${user.lastName} (${role}) a tenté de se connecter depuis un autre appareil (${name ?? kind}). Tentative ${attempts}/3${status === 'BLOCKED' ? ' : appareil bloqué.' : '.'}`, severity: status === 'BLOCKED' ? 'CRITICAL' : 'WARNING', entity: 'UserDevice', entityId: user.id, roleName: 'SUPER_ADMIN' , siteId: user.siteId ?? undefined} })
      .catch(() => undefined);
    throw new ForbiddenException("Cet appareil n'est pas autorisé pour votre compte. Contactez votre administrateur.");
  }

  // Verrouillage temporaire par compte : 10 échecs consécutifs = 10 minutes de blocage (en plus de la limite par adresse IP).
  // En mémoire (une seule instance) : aucune donnée en base, remis à zéro au redémarrage et à la première connexion réussie.
  private static fails = new Map<string, { n: number; until: number }>();
  private static readonly MAX_FAILS = 10;
  private static readonly LOCK_MS = 10 * 60 * 1000;

  // Invitation WhatsApp : le collaborateur crée lui-même son mot de passe (aucun mot de passe n'est jamais transmis).
  async inviteInfo(token: string) {
    const inv = await findInvitation(this.prisma, token);
    if (!inv) throw new BadRequestException("Lien d'invitation invalide ou expiré. Demandez-en un nouveau à votre responsable.");
    const u = await this.prisma.user.findUnique({ where: { id: inv.userId }, include: { role: true } });
    if (!u || u.status !== 'ACTIVE' || u.deletedAt) throw new BadRequestException("Compte indisponible. Contactez votre responsable.");
    return { firstName: u.firstName, role: u.role.name };
  }

  async acceptInvite(token: string, password: string) {
    if (!password || password.length < 8) throw new BadRequestException('Le mot de passe doit contenir au moins 8 caractères.');
    const inv = await findInvitation(this.prisma, token);
    if (!inv) throw new BadRequestException("Lien d'invitation invalide ou expiré. Demandez-en un nouveau à votre responsable.");
    const u = await this.prisma.user.findUnique({ where: { id: inv.userId } });
    if (!u || u.status !== 'ACTIVE' || u.deletedAt) throw new BadRequestException('Compte indisponible. Contactez votre responsable.');
    await this.prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: false, refreshTokenHash: null } });
    accountStateCache.forget(u.id);
    await consumeInvitation(this.prisma, inv.id);
    await this.audit.log({ userId: u.id, action: 'UPDATE', entity: 'User', entityId: u.id, newValue: { invitation: 'acceptée' } });
    return { ok: true, login: u.phone || u.email };
  }

  async login(dto: LoginDto, meta?: { deviceId?: string; ipAddress?: string }) {
    const lockKey = dto.email.trim().toLowerCase().replace(/^\+?224/, '').slice(0, 120);
    const lk = AuthService.fails.get(lockKey);
    if (lk && lk.until > Date.now()) {
      throw new HttpException(`Trop de tentatives. Réessayez dans ${Math.ceil((lk.until - Date.now()) / 60000)} minute(s).`, 429);
    }
    const fail = () => {
      const cur = AuthService.fails.get(lockKey);
      const n = (cur && cur.until <= Date.now() && cur.n >= AuthService.MAX_FAILS ? 0 : cur?.n ?? 0) + 1;
      AuthService.fails.set(lockKey, { n, until: n >= AuthService.MAX_FAILS ? Date.now() + AuthService.LOCK_MS : 0 });
      if (AuthService.fails.size > 5000) AuthService.fails.clear();
    };
    let user;
    if (dto.email.includes('@')) {
      user = await this.prisma.user.findUnique({ where: { email: dto.email }, include: { role: true } });
    } else {
      // Chauffeur, personnel ou responsable (DG, responsable logistique) sans e-mail : connexion par numéro de téléphone (comparaison sur les 9 derniers chiffres)
      const digits = dto.email.replace(/\D/g, '').slice(-9);
      if (digits.length < 8) throw new UnauthorizedException('Identifiants invalides.');
      const cands = await this.prisma.user.findMany({ where: { phone: { not: null }, status: 'ACTIVE', role: { name: { in: ['CHAUFFEUR', 'AGENT_HSE', 'GESTIONNAIRE_HSE', 'MAGASINIER', 'MECANICIEN', 'POINTEUR', 'DIRECTEUR_GENERAL', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_HSE', 'COMPTABLE', 'RESPONSABLE_OPERATIONS'] } } }, include: { role: true } });
      const hits = cands.filter((c) => (c.phone ?? '').replace(/\D/g, '').slice(-9) === digits);
      user = hits.length === 1 ? hits[0] : null;
    }

    if (!user || user.status !== 'ACTIVE') {
      fail();
      throw new UnauthorizedException('Identifiants invalides.');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      fail();
      throw new UnauthorizedException('Identifiants invalides.');
    }
    AuthService.fails.delete(lockKey);

    await this.enforceDeviceLimit(user, dto);

    const tokens = await this.signTokens(user);
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash, lastLoginAt: new Date() },
    });

    await this.audit.log({
      userId: user.id,
      action: 'UPDATE',
      entity: 'User',
      entityId: user.id,
      newValue: { event: 'LOGIN' },
      deviceId: meta?.deviceId,
      ipAddress: meta?.ipAddress,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role.name,
        organizationId: user.organizationId,
        siteId: user.siteId,
        department: user.department,
        mustChangePassword: user.mustChangePassword,
        photoUrl: user.photoUrl,
      },
    };
  }

  async getPhoto(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { photoUrl: true } });
    return { photoUrl: u?.photoUrl ?? null };
  }

  async setPhoto(userId: string, photo?: string | null) {
    await this.prisma.user.update({ where: { id: userId }, data: { photoUrl: photo || null } });
    return { photoUrl: photo || null };
  }

  async refresh(refreshToken: string) {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Jeton de rafraîchissement invalide.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user || !user.refreshTokenHash || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Session invalide.');
    }

    const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!matches) {
      throw new UnauthorizedException('Session invalide.');
    }

    const tokens = await this.signTokens(user);
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    return tokens;
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { success: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Utilisateur introuvable.');

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Mot de passe actuel incorrect.');
    if (dto.newPassword === dto.currentPassword) throw new BadRequestException('Le nouveau mot de passe doit être différent de l\'ancien.');

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false, refreshTokenHash: null } });
    accountStateCache.forget(userId);

    await this.audit.log({
      userId,
      action: 'UPDATE',
      entity: 'User',
      entityId: userId,
      newValue: { event: 'PASSWORD_CHANGED' },
    });

    return { success: true };
  }
}
