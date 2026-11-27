import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { recordAssignment } from '../vehicles/assignments';
import { createHash, randomBytes, randomInt } from 'crypto';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { issueInvitation, inviteLink } from '../auth/invitations';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { ActivateDeviceDto } from './driver.dto';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ACTIVATION_TTL_MS = 24 * 3600 * 1000;
// Tentatives d'activation refusées : au bout de 3 en 1 h, l'activation est bloquée 1 h et l'administration est alertée
const MAX_ACTIVATION_FAILS = 3;
const FAIL_WINDOW_MS = 3600 * 1000;
const activationFails = new Map<string, { n: number; first: number }>();

@Injectable()
export class DriverDevicesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private siteScope(actor: Actor, siteId?: string) {
    return actor.role === 'SUPER_ADMIN' ? siteId : actor.siteId ?? siteId;
  }

  private async driverInScope(driverId: string, actor: Actor) {
    const d = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!d || d.deletedAt) throw new NotFoundException('Chauffeur introuvable.');
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && d.siteId !== actor.siteId) throw new NotFoundException('Chauffeur introuvable.');
    return d;
  }

  // Relie un compte utilisateur (rôle CHAUFFEUR) à la fiche chauffeur
  async link(driverId: string, email: string, actor: Actor) {
    const driver = await this.driverInScope(driverId, actor);
    const user = await this.prisma.user.findFirst({ where: { email: email.trim().toLowerCase(), deletedAt: null }, include: { role: true } });
    if (!user) throw new NotFoundException("Aucun compte avec cet e-mail. Créez d'abord l'utilisateur (rôle Chauffeur) dans Utilisateurs.");
    if (user.role.name !== 'CHAUFFEUR') throw new BadRequestException('Ce compte doit avoir le rôle Chauffeur.');
    // Rattachement cohérent : le compte et la fiche chauffeur appartiennent au même site (donc à la même entreprise)
    if (user.siteId && user.siteId !== driver.siteId) throw new BadRequestException("Ce compte appartient à un autre site que la fiche du chauffeur. Rattachez-les au même site.");
    if (!user.siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: driver.siteId }, select: { organizationId: true } });
      if (!site || site.organizationId !== user.organizationId) throw new BadRequestException("Ce compte n'appartient pas à la même entreprise que la fiche du chauffeur.");
    }
    const taken = await this.prisma.driver.findFirst({ where: { userId: user.id, id: { not: driverId } } });
    if (taken) throw new BadRequestException(`Ce compte est déjà lié à ${taken.firstName} ${taken.lastName}.`);
    await this.prisma.driver.update({ where: { id: driverId }, data: { userId: user.id } });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'Driver', entityId: driverId, newValue: { userId: user.id, email: user.email } });
    return { driverId, userId: user.id, email: user.email, name: `${driver.firstName} ${driver.lastName}` };
  }

  // Génère le code d'activation : QR + OTP à usage unique, valable 24 h
  async provision(driverId: string, actor: Actor) {
    const driver = await this.driverInScope(driverId, actor);
    if (!driver.userId) throw new BadRequestException("Ce chauffeur n'a pas de compte lié. Liez d'abord son compte utilisateur.");
    await this.prisma.driverDevice.updateMany({ where: { driverId, status: 'PENDING' }, data: { status: 'REVOKED', blockedReason: 'Remplacé par un nouveau code' } });
    const token = randomBytes(24).toString('hex');
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expires = new Date(Date.now() + ACTIVATION_TTL_MS);
    const dev = await this.prisma.driverDevice.create({
      data: { driverId, userId: driver.userId, tokenHash: sha(token), otpHash: sha(`${driver.userId}:${otp}`), activationExpiresAt: expires, status: 'PENDING', createdBy: actor.userId },
    });
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'DriverDevice', entityId: dev.id, newValue: { driverId, expire: expires.toISOString() } });
    const qr = `SYLLO1:${dev.id}:${token}`;
    const qrImage = await QRCode.toDataURL(qr, { width: 280, margin: 1, color: { dark: '#163A5F', light: '#FFFFFF' } });
    return { deviceId: dev.id, otp, qr, qrImage, expiresAt: expires, driver: `${driver.firstName} ${driver.lastName}` };
  }

  // Activation côté chauffeur (compte déjà connecté) : l'ancien appareil actif est révoqué
  private async alertAdmins(userId: string, title: string, message: string, severity: 'WARNING' | 'CRITICAL') {
    const d = await this.prisma.driver.findFirst({ where: { userId }, select: { id: true, siteId: true } });
    for (const roleName of ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE']) {
      await this.prisma.notification
        .create({ data: { title, message, severity, entity: 'DriverDevice', entityId: d?.id ?? userId, siteId: roleName === 'SUPER_ADMIN' ? undefined : d?.siteId, roleName } })
        .catch(() => undefined);
    }
  }

  async activate(userId: string, dto: ActivateDeviceDto) {
    const rec = activationFails.get(userId);
    if (rec && Date.now() - rec.first > FAIL_WINDOW_MS) activationFails.delete(userId);
    const cur = activationFails.get(userId);
    if (cur && cur.n >= MAX_ACTIVATION_FAILS) {
      throw new ForbiddenException("Trop de tentatives refusées. Activation bloquée : contactez votre administrateur.");
    }
    const code = dto.code.trim();
    const now = new Date();
    let dev;
    if (code.startsWith('SYLLO1:')) {
      const [, id, token] = code.split(':');
      const d = id ? await this.prisma.driverDevice.findUnique({ where: { id } }) : null;
      if (d && d.userId === userId && d.status === 'PENDING' && d.tokenHash && token && d.tokenHash === sha(token)) dev = d;
    } else {
      dev = await this.prisma.driverDevice.findFirst({ where: { userId, status: 'PENDING', otpHash: sha(`${userId}:${code}`) } });
    }
    if (!dev || !dev.activationExpiresAt || dev.activationExpiresAt < now) {
      const f = activationFails.get(userId) ?? { n: 0, first: Date.now() };
      f.n += 1;
      activationFails.set(userId, f);
      await this.audit.log({ userId, action: 'UPDATE', entity: 'DriverDevice', entityId: userId, newValue: { activationRefused: true, model: dto.model, tentative: f.n } }).catch(() => undefined);
      const who = (await this.prisma.driver.findFirst({ where: { userId }, select: { firstName: true, lastName: true } })) ?? undefined;
      const name = who ? `${who.firstName} ${who.lastName}` : 'Un chauffeur';
      if (f.n >= MAX_ACTIVATION_FAILS) {
        await this.alertAdmins(userId, 'Activation d\'appareil bloquée', `${name} : ${f.n} tentatives d'activation refusées. Activation bloquée pendant 1 h.`, 'CRITICAL');
        throw new ForbiddenException("Trop de tentatives refusées. Activation bloquée : contactez votre administrateur.");
      }
      await this.alertAdmins(userId, 'Tentative d\'activation refusée', `${name} a saisi un code invalide ou expiré sur un appareil (${dto.model ?? 'inconnu'}).`, 'WARNING');
      throw new BadRequestException("Code invalide ou expiré. Contactez votre administrateur pour obtenir un nouveau code.");
    }
    activationFails.delete(userId);
    await this.prisma.driverDevice.updateMany({
      where: { driverId: dev.driverId, status: 'ACTIVE' },
      data: { status: 'REVOKED', blockedAt: now, blockedReason: 'Remplacé par un nouvel appareil' },
    });
    const activated = await this.prisma.driverDevice.update({
      where: { id: dev.id },
      data: { status: 'ACTIVE', tokenHash: null, otpHash: null, activatedAt: now, lastSeenAt: now, fingerprint: dto.fingerprint, model: dto.model, os: dto.os },
    });
    await this.audit.log({ userId, action: 'UPDATE', entity: 'DriverDevice', entityId: dev.id, newValue: { status: 'ACTIVE', model: dto.model, os: dto.os } });
    return { deviceId: activated.id };
  }

  async setStatus(id: string, status: 'BLOCKED' | 'ACTIVE' | 'REVOKED', reason: string, actor: Actor) {
    const dev = await this.prisma.driverDevice.findUnique({ where: { id } });
    if (!dev) throw new NotFoundException('Appareil introuvable.');
    await this.driverInScope(dev.driverId, actor);
    if (status === 'ACTIVE' && dev.status !== 'BLOCKED') throw new BadRequestException("Seul un appareil bloqué peut être débloqué.");
    if (status === 'ACTIVE') {
      const other = await this.prisma.driverDevice.findFirst({ where: { driverId: dev.driverId, status: 'ACTIVE', id: { not: id } } });
      if (other) throw new BadRequestException('Un autre appareil est déjà actif pour ce chauffeur.');
    }
    const updated = await this.prisma.driverDevice.update({
      where: { id },
      data: status === 'ACTIVE'
        ? { status, blockedAt: null, blockedBy: null, blockedReason: null }
        : { status, blockedAt: new Date(), blockedBy: actor.userId, blockedReason: reason },
    });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'DriverDevice', entityId: id, oldValue: { status: dev.status }, newValue: { status }, reason });
    return updated;
  }

  // Invitation WhatsApp : crée le compte (identifiant = numéro de téléphone) s'il n'existe pas, le lie à la fiche,
  // prépare le code d'activation et renvoie le message à envoyer (même lien pour tous les chauffeurs).
  async invite(driverId: string, appUrl: string, actor: Actor, organizationId: string) {
    if (!/^https:\/\//.test(appUrl)) throw new BadRequestException("Lien de l'application invalide.");
    const driver = await this.driverInScope(driverId, actor);
    const digits = (driver.phone ?? '').replace(/\D/g, '');
    if (digits.length < 8) throw new BadRequestException(`Renseignez le numéro de téléphone de ${driver.firstName} ${driver.lastName} (menu Chauffeurs).`);
    let tempPassword: string | null = null;
    let userId = driver.userId;
    if (!userId) {
      const last9 = digits.slice(-9);
      const dup = (await this.prisma.user.findMany({ where: { phone: { not: null }, role: { name: 'CHAUFFEUR' } }, select: { phone: true } })).some((u) => (u.phone ?? '').replace(/\D/g, '').slice(-9) === last9);
      if (dup) throw new BadRequestException('Un compte chauffeur existe déjà avec ce numéro de téléphone.');
      const role = await this.prisma.role.findUnique({ where: { name: 'CHAUFFEUR' } });
      if (!role) throw new BadRequestException('Rôle Chauffeur introuvable.');
      tempPassword = String(randomInt(100000, 1_000_000));
      const email = `${last9}@chauffeur.local`;
      if (await this.prisma.user.findUnique({ where: { email } })) throw new BadRequestException('Un compte existe déjà avec ce numéro.');
      const u = await this.prisma.user.create({
        data: { organizationId, siteId: driver.siteId, roleId: role.id, firstName: driver.firstName, lastName: driver.lastName, email, phone: driver.phone, mustChangePassword: true, passwordHash: await bcrypt.hash(tempPassword, 10) },
      });
      await this.prisma.driver.update({ where: { id: driver.id }, data: { userId: u.id } });
      await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'User', entityId: u.id, newValue: { role: 'CHAUFFEUR', driverId: driver.id, via: 'invitation' } });
      userId = u.id;
    }
    // Compte jamais activé : lien individuel à usage unique (72 h) où le chauffeur crée lui-même son mot de passe. Aucun mot de passe n'est transmis.
    let inviteToken: string | null = null;
    if (userId) {
      const u = await this.prisma.user.findUnique({ where: { id: userId } });
      if (u && u.mustChangePassword) inviteToken = await issueInvitation(this.prisma, userId, actor.userId);
    }
    const prov = await this.provision(driver.id, actor);
    if (userId) await this.prisma.user.update({ where: { id: userId }, data: { invitedAt: new Date() } });
    const veh = await this.prisma.vehicle.findFirst({ where: { assignedDriverId: driver.id, deletedAt: null } });
    const kind = driver.activity === 'SERVICE_VEHICLE' ? 'chauffeur de véhicule de service' : driver.activity === 'TRUCK' ? 'chauffeur de camion' : 'chauffeur';
    const lines = [
      `Bonjour ${driver.firstName},`,
      `Voici votre application de travail SYL LOGISTIQUE (${kind}) : ${inviteToken ? inviteLink(appUrl, inviteToken, 'chauffeurs') : appUrl + (appUrl.includes('?') ? '&' : '?') + 'espace=chauffeurs'}`,
      ...(veh ? [`Votre véhicule : ${veh.internalNumber} (${veh.registrationNumber}${veh.brand ? ', ' + [veh.brand, veh.model].filter(Boolean).join(' ') : ''}). Vos informations et celles du véhicule sont déjà dans l'application.`] : []),
      `1) Ouvrez le lien puis installez l'application (menu du navigateur > « Ajouter à l'écran d'accueil »).`,
      inviteToken ? `2) Sur la page qui s'ouvre, créez votre mot de passe (lien personnel, valable 72 h, à usage unique). Ensuite, connectez-vous avec votre numéro de téléphone et ce mot de passe.` : `2) Connexion : votre numéro de téléphone et votre mot de passe habituel.`,
      `3) Code d'activation de votre téléphone : ${prov.otp} (valable 24 h).`,
    ];
    return { driver: `${driver.firstName} ${driver.lastName}`, phone: digits, message: lines.join('\n'), newAccount: !!inviteToken };
  }

  // Transfert d'appareil : le téléphone reste au bureau, le remplaçant s'y connecte avec son propre compte.
  // Le véhicule et les missions planifiées de l'absent passent au remplaçant.
  async transfer(id: string, newDriverId: string, reason: string | undefined, actor: Actor) {
    const dev = await this.prisma.driverDevice.findUnique({ where: { id } });
    if (!dev || dev.status !== 'ACTIVE') throw new BadRequestException("Seul un appareil actif peut être transféré.");
    const oldDriver = await this.driverInScope(dev.driverId, actor);
    const target = await this.driverInScope(newDriverId, actor);
    if (target.id === oldDriver.id) throw new BadRequestException('Choisissez un autre chauffeur.');
    if (!target.userId) throw new BadRequestException("Le remplaçant n'a pas de compte lié.");
    const running = await this.prisma.trip.findFirst({ where: { driverId: oldDriver.id, status: 'IN_PROGRESS' } });
    if (running) throw new BadRequestException("Le chauffeur absent a une mission en cours : elle doit d'abord être terminée.");
    await this.prisma.$transaction([
      this.prisma.driverDevice.updateMany({ where: { driverId: target.id, status: { in: ['ACTIVE', 'PENDING'] } }, data: { status: 'REVOKED', blockedReason: 'Remplacé par un transfert d\'appareil' } }),
      this.prisma.driverDevice.update({ where: { id }, data: { driverId: target.id, userId: target.userId } }),
      this.prisma.vehicle.updateMany({ where: { assignedDriverId: oldDriver.id }, data: { assignedDriverId: target.id } }),
      this.prisma.trip.updateMany({ where: { driverId: oldDriver.id, status: 'PLANNED' }, data: { driverId: target.id } }),
    ]);
    const moved = await this.prisma.vehicle.findMany({ where: { assignedDriverId: target.id, deletedAt: null }, select: { id: true } });
    for (const mv of moved) await recordAssignment(this.prisma, { vehicleId: mv.id, newDriverId: target.id, by: actor.userId, reason: `Transfert d'appareil${reason ? ' (' + reason + ')' : ''}`, source: 'TRANSFERT' });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'DriverDevice', entityId: id, oldValue: { driverId: oldDriver.id }, newValue: { driverId: target.id }, reason: `Remplacement${reason ? ' (' + reason + ')' : ''} : ${oldDriver.firstName} ${oldDriver.lastName} → ${target.firstName} ${target.lastName}` });
    return { deviceId: id, driver: `${target.firstName} ${target.lastName}` };
  }

  // Vue d'ensemble : chauffeurs, compte lié, appareil actif / en attente
  async overview(actor: Actor, siteId?: string) {
    const site = this.siteScope(actor, siteId);
    const drivers = await this.prisma.driver.findMany({ where: { deletedAt: null, ...(site ? { siteId: site } : {}) }, orderBy: { lastName: 'asc' } });
    const userIds = drivers.map((d) => d.userId).filter((x): x is string => !!x);
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } });
    const devices = await this.prisma.driverDevice.findMany({
      where: { driverId: { in: drivers.map((d) => d.id) }, status: { in: ['ACTIVE', 'PENDING', 'BLOCKED'] } },
      orderBy: { createdAt: 'desc' },
    });
    return drivers.map((d) => {
      const ds = devices.filter((x) => x.driverId === d.id).map((x) => ({
        id: x.id, status: x.status, model: x.model, os: x.os, activatedAt: x.activatedAt, lastSeenAt: x.lastSeenAt,
        blockedReason: x.blockedReason, expiresAt: x.status === 'PENDING' ? x.activationExpiresAt : null,
      }));
      return { id: d.id, name: `${d.firstName} ${d.lastName}`, phone: d.phone, activity: d.activity, userEmail: users.find((u) => u.id === d.userId)?.email ?? null, linked: !!d.userId, devices: ds };
    });
  }
}
