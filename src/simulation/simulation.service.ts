import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { issueInvitation, inviteLink } from '../auth/invitations';

// Comptes de test de l'environnement de SIMULATION uniquement (SIMULATION_MODE=true).
// En production, ce service refuse toute opération : aucune donnée réelle ne peut être touchée.
const TEST_ACCOUNTS = [
  { role: 'DIRECTEUR_GENERAL', label: 'Directeur Général', first: '[TEST] Directeur', last: 'Général', phone: '699000001', espace: 'dg' },
  { role: 'ADMIN_LOGISTIQUE', label: 'Responsable logistique', first: '[TEST] Responsable', last: 'Logistique', phone: '699000002', espace: 'logistique' },
  { role: 'CHAUFFEUR', label: 'Chauffeur', first: '[TEST] Chauffeur', last: 'Camion', phone: '699000003', espace: 'chauffeurs' },
  { role: 'MAGASINIER', label: 'Gestionnaire de stock', first: '[TEST] Gestionnaire', last: 'Stock', phone: '699000004', espace: 'stock' },
] as const;

@Injectable()
export class SimulationService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  static enabled() { return process.env.SIMULATION_MODE === 'true'; }
  private guard() { if (!SimulationService.enabled()) throw new ForbiddenException("Disponible uniquement dans l'environnement de test (simulation)."); }

  // Crée (ou remet à l'état « invitation en attente ») les comptes de test et renvoie une invitation individuelle pour chacun.
  async setup(appUrl: string, actor: Actor) {
    this.guard();
    if (!/^https:\/\//.test(appUrl || '')) throw new BadRequestException("Lien de l'application invalide.");
    const org = await this.prisma.organization.findFirst();
    const site = (actor.siteId ? await this.prisma.site.findUnique({ where: { id: actor.siteId } }) : null) ?? (await this.prisma.site.findFirst());
    if (!org || !site) throw new BadRequestException('Organisation ou site introuvable.');
    const out: any[] = [];
    for (const a of TEST_ACCOUNTS) {
      const role = await this.prisma.role.upsert({ where: { name: a.role as any }, update: {}, create: { name: a.role as any } });
      const email = `${a.phone}@${a.role === 'CHAUFFEUR' ? 'chauffeur' : 'staff'}.local`;
      const hash = await bcrypt.hash(randomBytes(24).toString('hex'), 10); // inconnu de tous : le testeur crée le sien via l'invitation
      let u = await this.prisma.user.findUnique({ where: { email } });
      if (u && !(u.firstName || '').startsWith('[TEST]')) throw new BadRequestException(`Le numéro ${a.phone} est déjà utilisé par un compte réel.`);
      if (u) u = await this.prisma.user.update({ where: { id: u.id }, data: { status: 'ACTIVE', deletedAt: null, mustChangePassword: true, passwordHash: hash, refreshTokenHash: null, invitedAt: new Date() } });
      else u = await this.prisma.user.create({ data: { organizationId: org.id, siteId: site.id, roleId: role.id, firstName: a.first, lastName: a.last, email, phone: a.phone, mustChangePassword: true, passwordHash: hash, invitedAt: new Date() } });
      if (a.role === 'CHAUFFEUR') {
        const d = await this.prisma.driver.findUnique({ where: { userId: u.id } });
        if (!d) await this.prisma.driver.create({ data: { siteId: site.id, firstName: a.first, lastName: a.last, phone: a.phone, activity: 'TRUCK', userId: u.id } });
      }
      const link = inviteLink(appUrl, await issueInvitation(this.prisma, u.id, actor.userId), a.espace);
      out.push({ role: a.role, label: a.label, name: `${a.first} ${a.last}`, phone: a.phone, link, message: `Bonjour, voici votre accès de TEST à SYL LOGISTIQUE (${a.label}) : ${link}\nOuvrez le lien, créez votre mot de passe (lien à usage unique, 72 h), puis connectez-vous avec le numéro ${a.phone}.` });
    }
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'Simulation', entityId: 'setup', newValue: { comptes: out.length } });
    return { simulation: true, accounts: out };
  }
}
