import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { CreateStaffDto, StaffReportDto, STAFF_ROLES } from './staff.dto';

const LABEL: Record<string, string> = { AGENT_HSE: 'agent HSE', GESTIONNAIRE_HSE: 'responsable HSE', MAGASINIER: 'magasinier' };

// Personnel de terrain (agents HSE, magasiniers) : comptes créés par le bureau, invitation WhatsApp,
// connexion par numéro de téléphone, rapport d'activité quotidien reçu par le responsable.
@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private last9(phone: string) { return phone.replace(/\D/g, '').slice(-9); }

  async create(dto: CreateStaffDto, actor: Actor, organizationId: string) {
    const digits = this.last9(dto.phone);
    if (digits.length < 8) throw new BadRequestException('Numéro de téléphone invalide.');
    const all = await this.prisma.user.findMany({ where: { phone: { not: null }, deletedAt: null }, select: { phone: true } });
    if (all.some((u) => this.last9(u.phone ?? '') === digits)) throw new BadRequestException('Un compte existe déjà avec ce numéro de téléphone.');
    const role = await this.prisma.role.upsert({ where: { name: dto.role as any }, update: {}, create: { name: dto.role as any } });
    const email = `${digits}@staff.local`;
    if (await this.prisma.user.findUnique({ where: { email } })) throw new BadRequestException('Un compte existe déjà avec ce numéro.');
    const tempPassword = String(randomInt(100000, 1_000_000));
    const u = await this.prisma.user.create({
      data: { organizationId, siteId: dto.siteId, roleId: role.id, firstName: dto.firstName.trim(), lastName: dto.lastName.trim(), email, phone: dto.phone.trim(), mustChangePassword: true, passwordHash: await bcrypt.hash(tempPassword, 10) },
    });
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'User', entityId: u.id, newValue: { role: dto.role, via: 'personnel' } });
    return { id: u.id };
  }

  async list(roles: string[] | undefined, siteId?: string) {
    const names = (roles && roles.length ? roles : [...STAFF_ROLES]).filter((r) => (STAFF_ROLES as readonly string[]).includes(r));
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, role: { name: { in: names as any } }, ...(siteId ? { siteId } : {}) },
      include: { role: true }, orderBy: { lastName: 'asc' },
    });
    const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const reps = await this.prisma.staffReport.findMany({ where: { userId: { in: users.map((u) => u.id) }, date: { gte: since } }, select: { userId: true, date: true } });
    return users.map((u) => ({
      id: u.id, firstName: u.firstName, lastName: u.lastName, phone: u.phone, role: u.role.name, status: u.status,
      neverConnected: u.mustChangePassword, lastLoginAt: u.lastLoginAt,
      lastReport: reps.filter((r) => r.userId === u.id).map((r) => r.date).sort().pop() ?? null,
    }));
  }

  // Message WhatsApp : lien, identifiant (téléphone), mot de passe provisoire (tant qu'il n'a pas créé le sien)
  async invite(userId: string, appUrl: string, actor: Actor) {
    if (!/^https:\/\//.test(appUrl)) throw new BadRequestException("Lien de l'application invalide.");
    const u = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!u || !(STAFF_ROLES as readonly string[]).includes(u.role.name)) throw new NotFoundException('Personnel introuvable.');
    const digits = (u.phone ?? '').replace(/\D/g, '');
    if (digits.length < 8) throw new BadRequestException('Renseignez le numéro de téléphone.');
    let temp: string | null = null;
    if (u.mustChangePassword) {
      temp = String(randomInt(100000, 1_000_000));
      await this.prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(temp, 10) } });
    }
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'User', entityId: u.id, newValue: { invitation: true } });
    const lines = [
      `Bonjour ${u.firstName},`,
      `Voici votre application de travail SYLLOGISTIQUE (${LABEL[u.role.name]}) : ${appUrl}`,
      `1) Ouvrez le lien puis installez l'application (menu du navigateur > « Ajouter à l'écran d'accueil »).`,
      `2) Connexion : votre numéro de téléphone${temp ? ` et le mot de passe provisoire ${temp} (l'application vous demandera de créer votre propre mot de passe dès la première connexion)` : ' et votre mot de passe'}.`,
      `3) Chaque jour, remplissez « Mon rapport du jour » : il arrive directement chez votre responsable.`,
    ];
    return { name: `${u.firstName} ${u.lastName}`, phone: digits, message: lines.join('\n') };
  }

  // --- Rapport d'activité du jour (par le personnel lui-même) ---
  async mine(userId: string) {
    return this.prisma.staffReport.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 30 });
  }

  async send(dto: StaffReportDto, actor: Actor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.date)) throw new BadRequestException('Date invalide.');
    const today = new Date().toISOString().slice(0, 10);
    if (dto.date > today) throw new BadRequestException('Le rapport ne peut pas être daté du futur.');
    const u = await this.prisma.user.findUnique({ where: { id: actor.userId }, include: { role: true } });
    if (!u) throw new NotFoundException('Utilisateur introuvable.');
    const existing = await this.prisma.staffReport.findUnique({ where: { userId_date: { userId: u.id, date: dto.date } } });
    if (existing?.receivedAt) throw new BadRequestException('Ce rapport a déjà été reçu par le responsable : il ne peut plus être modifié.');
    const data = { activities: dto.activities.trim(), observations: dto.observations?.trim() || null, sentAt: new Date(), siteId: u.siteId, roleName: u.role.name };
    return existing
      ? this.prisma.staffReport.update({ where: { id: existing.id }, data })
      : this.prisma.staffReport.create({ data: { ...data, userId: u.id, date: dto.date } });
  }

  // --- Côté responsable ---
  async reports(roles: string[] | undefined, date?: string, siteId?: string) {
    const names = (roles && roles.length ? roles : [...STAFF_ROLES]).filter((r) => (STAFF_ROLES as readonly string[]).includes(r));
    const rows = await this.prisma.staffReport.findMany({
      where: { roleName: { in: names }, ...(date ? { date } : {}), ...(siteId ? { siteId } : {}) },
      include: { user: { select: { firstName: true, lastName: true, phone: true } } },
      orderBy: [{ date: 'desc' }, { sentAt: 'desc' }], take: 200,
    });
    return rows.map((r) => ({ id: r.id, date: r.date, role: r.roleName, name: `${r.user.firstName} ${r.user.lastName}`, phone: r.user.phone, activities: r.activities, observations: r.observations, sentAt: r.sentAt, receivedAt: r.receivedAt }));
  }

  async receive(id: string, actor: Actor) {
    const r = await this.prisma.staffReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Rapport introuvable.');
    return this.prisma.staffReport.update({ where: { id }, data: { receivedAt: new Date(), receivedBy: actor.userId } });
  }
}
