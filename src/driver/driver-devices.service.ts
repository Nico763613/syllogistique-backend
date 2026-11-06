import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { ActivateDeviceDto } from './driver.dto';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ACTIVATION_TTL_MS = 24 * 3600 * 1000;

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
  async activate(userId: string, dto: ActivateDeviceDto) {
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
      throw new BadRequestException("Code invalide ou expiré. Demandez un nouveau code au gestionnaire de flotte.");
    }
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
      return { id: d.id, name: `${d.firstName} ${d.lastName}`, userEmail: users.find((u) => u.id === d.userId)?.email ?? null, linked: !!d.userId, devices: ds };
    });
  }
}
