import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { issueInvitation, inviteLink } from '../auth/invitations';
import { canManageRole, hierarchyMessage, MANAGEABLE_BY } from '../common/hierarchy';
import { CreateStaffDto, StaffReportDto, STAFF_ROLES, MANAGER_ROLES, ALL_STAFF_ROLES } from './staff.dto';

const ESPACE: Record<string, string> = { AGENT_HSE: 'hse', GESTIONNAIRE_HSE: 'hse', MAGASINIER: 'stock', MECANICIEN: 'atelier', POINTEUR: 'pointage', DIRECTEUR_GENERAL: 'dg', ADMIN_LOGISTIQUE: 'logistique', RESPONSABLE_OPERATIONS: 'operations', COMPTABLE: 'comptabilite', RESPONSABLE_COMMERCIAL: 'commercial', CAISSIER: 'caisse' };
const LABEL: Record<string, string> = { AGENT_HSE: 'agent HSE', GESTIONNAIRE_HSE: 'responsable HSE', MAGASINIER: 'gestionnaire de stock', MECANICIEN: 'mécanicien', POINTEUR: 'pointeur', DIRECTEUR_GENERAL: 'Directeur Général', ADMIN_LOGISTIQUE: 'Responsable logistique', RESPONSABLE_OPERATIONS: 'Responsable des opérations', COMPTABLE: 'Comptabilité' };
const isManager = (r: string) => (MANAGER_ROLES as readonly string[]).includes(r);

// Personnel de terrain (agents HSE, magasiniers) : comptes créés par le bureau, invitation WhatsApp,
// connexion par numéro de téléphone, rapport d'activité quotidien reçu par le responsable.
@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private last9(phone: string) { return phone.replace(/\D/g, '').slice(-9); }

  async create(dto: CreateStaffDto, actor: Actor, organizationId: string, actorRole?: string) {
    if (!canManageRole(actorRole, dto.role)) throw new ForbiddenException(hierarchyMessage(actorRole));
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

  async list(roles: string[] | undefined, siteId?: string, actorRole?: string) {
    const allowed: readonly string[] = actorRole === 'SUPER_ADMIN' ? ALL_STAFF_ROLES : MANAGEABLE_BY[actorRole ?? ''] ?? STAFF_ROLES;
    const names = (roles && roles.length ? roles : allowed.filter((r) => (ALL_STAFF_ROLES as readonly string[]).includes(r))).filter((r) => allowed.includes(r));
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, role: { name: { in: names as any } }, ...(siteId ? { siteId } : {}) },
      include: { role: true }, orderBy: { lastName: 'asc' },
    });
    const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const reps = await this.prisma.staffReport.findMany({ where: { userId: { in: users.map((u) => u.id) }, date: { gte: since } }, select: { userId: true, date: true } });
    return users.map((u) => ({
      id: u.id, firstName: u.firstName, lastName: u.lastName, phone: u.phone, role: u.role.name, status: u.status, photoUrl: u.photoUrl ?? null,
      neverConnected: u.mustChangePassword, lastLoginAt: u.lastLoginAt,
      lastReport: reps.filter((r) => r.userId === u.id).map((r) => r.date).sort().pop() ?? null,
    }));
  }

  private async managed(id: string, actorRole?: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!u || u.deletedAt || !(ALL_STAFF_ROLES as readonly string[]).includes(u.role.name)) throw new NotFoundException('Personnel introuvable.');
    if (!canManageRole(actorRole, u.role.name)) throw new ForbiddenException(hierarchyMessage(actorRole));
    return u;
  }

  // Modification des informations d'un collaborateur (nom, prénom, téléphone)
  async update(id: string, dto: { firstName?: string; lastName?: string; phone?: string }, actor: Actor, actorRole?: string) {
    const u = await this.managed(id, actorRole);
    const data: any = {};
    if (dto.firstName !== undefined) { if (!dto.firstName.trim()) throw new BadRequestException('Prénom obligatoire.'); data.firstName = dto.firstName.trim(); }
    if (dto.lastName !== undefined) { if (!dto.lastName.trim()) throw new BadRequestException('Nom obligatoire.'); data.lastName = dto.lastName.trim(); }
    if (dto.phone !== undefined) {
      const digits = this.last9(dto.phone);
      if (digits.length < 8) throw new BadRequestException('Numéro de téléphone invalide.');
      const all = await this.prisma.user.findMany({ where: { phone: { not: null }, deletedAt: null, id: { not: id } }, select: { phone: true } });
      if (all.some((x) => this.last9(x.phone ?? '') === digits)) throw new BadRequestException('Un compte existe déjà avec ce numéro de téléphone.');
      data.phone = dto.phone.trim();
    }
    await this.prisma.user.update({ where: { id }, data });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'User', entityId: id, oldValue: { firstName: u.firstName, lastName: u.lastName, phone: u.phone }, newValue: data });
    return { id };
  }

  // Activation / désactivation d'un compte : un compte désactivé est déconnecté aussitôt, ses données restent intactes
  async setStatus(id: string, status: string, actor: Actor, actorRole?: string) {
    if (!['ACTIVE', 'SUSPENDED', 'DISABLED'].includes(status)) throw new BadRequestException('Statut invalide.');
    const u = await this.managed(id, actorRole);
    if (u.id === actor.userId) throw new BadRequestException('Vous ne pouvez pas modifier votre propre compte ici.');
    await this.prisma.user.update({ where: { id }, data: { status: status as any, ...(status !== 'ACTIVE' ? { refreshTokenHash: null } : {}) } });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'User', entityId: id, oldValue: { status: u.status }, newValue: { status } });
    return { id, status };
  }

  // Message WhatsApp : lien, identifiant (téléphone), mot de passe provisoire (tant qu'il n'a pas créé le sien)
  async invite(userId: string, appUrl: string, actor: Actor, actorRole?: string) {
    if (!/^https:\/\//.test(appUrl)) throw new BadRequestException("Lien de l'application invalide.");
    const u = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!u || !(ALL_STAFF_ROLES as readonly string[]).includes(u.role.name)) throw new NotFoundException('Personnel introuvable.');
    if (!canManageRole(actorRole, u.role.name)) throw new ForbiddenException(hierarchyMessage(actorRole));
    const digits = (u.phone ?? '').replace(/\D/g, '');
    if (digits.length < 8) throw new BadRequestException('Renseignez le numéro de téléphone.');
    // Aucun mot de passe n'est transmis : lien individuel, à usage unique, valable 72 h, où le collaborateur crée le sien.
    let link = ESPACE[u.role.name] ? appUrl + (appUrl.includes('?') ? '&' : '?') + 'espace=' + ESPACE[u.role.name] : appUrl;
    const pending = u.mustChangePassword;
    if (pending) link = inviteLink(appUrl, await issueInvitation(this.prisma, u.id, actor.userId), ESPACE[u.role.name]);
    await this.prisma.user.update({ where: { id: u.id }, data: { invitedAt: new Date() } });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'User', entityId: u.id, newValue: { invitation: true } });
    const lines = [
      `Bonjour ${u.firstName},`,
      `Voici votre application de travail SYL LOGISTIQUE (${LABEL[u.role.name]}) : ${link}`,
      `1) Ouvrez le lien puis installez l'application (menu du navigateur > « Ajouter à l'écran d'accueil »).`,
      pending ? `2) Sur la page qui s'ouvre, créez votre mot de passe (lien personnel, valable 72 h, à usage unique). Ensuite, connectez-vous avec votre numéro de téléphone et ce mot de passe.` : `2) Connexion : votre numéro de téléphone et votre mot de passe.`,
      ...(isManager(u.role.name) ? [`3) Vous arrivez directement dans votre espace de pilotage.`] : [`3) Chaque jour, remplissez « Mon rapport du jour » : il arrive directement chez votre responsable.`]),
    ];
    return { name: `${u.firstName} ${u.lastName}`, phone: digits, message: lines.join('\n') };
  }

  // Suivi de l'enrôlement par WhatsApp : NON_ENVOYE → ENVOYE → OUVERT (s'est connecté) → ACTIVE, ou EXPIRE (lien resté sans suite plus de 24 h).
  async enrolment(kind: string, siteId?: string, actorRole?: string) {
    if (!['TRUCK', 'SERVICE_VEHICLE', 'HSE', 'POINTER'].includes(kind)) throw new BadRequestException('Catégorie invalide.');
    if (actorRole === 'GESTIONNAIRE_HSE' && kind !== 'HSE') throw new ForbiddenException('Accès réservé aux agents HSE.');
    const now = Date.now();
    const stateOf = (u: { invitedAt: Date | null; lastLoginAt: Date | null } | null, activated: boolean) => {
      if (!u || !u.invitedAt) return 'NON_ENVOYE';
      if (activated) return 'ACTIVE';
      if (u.lastLoginAt && u.lastLoginAt >= u.invitedAt) return 'OUVERT';
      return now - u.invitedAt.getTime() > 72 * 3600 * 1000 ? 'EXPIRE' : 'ENVOYE';
    };
    if (kind === 'TRUCK' || kind === 'SERVICE_VEHICLE') {
      const drivers = await this.prisma.driver.findMany({ where: { deletedAt: null, activity: kind, ...(siteId ? { siteId } : {}) }, orderBy: { lastName: 'asc' } });
      const uids = drivers.map((d) => d.userId).filter((x): x is string => !!x);
      const users = await this.prisma.user.findMany({ where: { id: { in: uids } }, select: { id: true, invitedAt: true, lastLoginAt: true } });
      const devs = await this.prisma.driverDevice.findMany({ where: { driverId: { in: drivers.map((d) => d.id) }, status: 'ACTIVE' }, select: { driverId: true } });
      return drivers.map((d) => {
        const u = users.find((x) => x.id === d.userId) ?? null;
        return { id: d.id, kind: 'DRIVER', firstName: d.firstName, lastName: d.lastName, phone: d.phone, detail: d.licenseNumber ? `Permis ${d.licenseNumber}${d.licenseCategory ? ' (' + d.licenseCategory + ')' : ''}` : null, invitedAt: u?.invitedAt ?? null, state: stateOf(u, devs.some((x) => x.driverId === d.id)) };
      });
    }
    const role = kind === 'HSE' ? 'AGENT_HSE' : 'POINTEUR';
    const users = await this.prisma.user.findMany({ where: { deletedAt: null, role: { name: role as any }, ...(siteId ? { siteId } : {}) }, orderBy: { lastName: 'asc' } });
    return users.map((u) => ({ id: u.id, kind: 'STAFF', firstName: u.firstName, lastName: u.lastName, phone: u.phone, detail: null, invitedAt: u.invitedAt, state: stateOf(u, !u.mustChangePassword && !!u.lastLoginAt) }));
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
    if (existing?.opsAt) throw new BadRequestException('Ce rapport est validé : il ne peut plus être modifié.');
    if (existing?.receivedAt && !existing.rejectedAt) throw new BadRequestException('Ce rapport a déjà été vérifié par le responsable : il ne peut plus être modifié.');
    const data = { activities: dto.activities.trim(), observations: dto.observations?.trim() || null, sentAt: new Date(), siteId: u.siteId, roleName: u.role.name, receivedAt: null, receivedBy: null, rejectedAt: null, rejectedBy: null, rejectNote: null };
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
    return rows.map((r) => ({ id: r.id, date: r.date, role: r.roleName, name: `${r.user.firstName} ${r.user.lastName}`, phone: r.user.phone, activities: r.activities, observations: r.observations, sentAt: r.sentAt, receivedAt: r.receivedAt, opsAt: r.opsAt, rejectedAt: r.rejectedAt, rejectNote: r.rejectNote }));
  }

  // Rapports vérifiés par le responsable, en attente de validation (Responsable des opérations)
  async pendingValidation(siteId?: string) {
    const rows = await this.prisma.staffReport.findMany({
      where: { receivedAt: { not: null }, opsAt: null, rejectedAt: null, ...(siteId ? { siteId } : {}) },
      include: { user: { select: { firstName: true, lastName: true, phone: true } } },
      orderBy: [{ date: 'desc' }, { sentAt: 'desc' }], take: 200,
    });
    return rows.map((r) => ({ id: r.id, date: r.date, role: r.roleName, name: `${r.user.firstName} ${r.user.lastName}`, phone: r.user.phone, activities: r.activities, observations: r.observations, sentAt: r.sentAt, receivedAt: r.receivedAt }));
  }

  async validate(id: string, actor: Actor) {
    const r = await this.prisma.staffReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Rapport introuvable.');
    if (!r.receivedAt) throw new BadRequestException("Le rapport doit d'abord être vérifié par le responsable.");
    if (r.rejectedAt) throw new BadRequestException('Ce rapport a été rejeté.');
    if (r.opsAt) throw new BadRequestException('Ce rapport est déjà validé.'); // ne pas écraser l'auteur et la date de la première validation
    return this.prisma.staffReport.update({ where: { id }, data: { opsAt: new Date(), opsBy: actor.userId } });
  }

  async reject(id: string, note: string, actor: Actor) {
    const r = await this.prisma.staffReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Rapport introuvable.');
    if (r.opsAt) throw new BadRequestException('Ce rapport est déjà validé.');
    const motif = (note || '').trim();
    if (!motif) throw new BadRequestException('Indiquez le motif du rejet.');
    return this.prisma.staffReport.update({ where: { id }, data: { rejectedAt: new Date(), rejectedBy: actor.userId, rejectNote: motif.slice(0, 500) } });
  }

  async receive(id: string, actor: Actor) {
    const r = await this.prisma.staffReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Rapport introuvable.');
    if (r.opsAt || r.rejectedAt) throw new BadRequestException('Ce rapport est déjà traité.');
    return this.prisma.staffReport.update({ where: { id }, data: { receivedAt: new Date(), receivedBy: actor.userId } });
  }
}
