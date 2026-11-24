import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { inviteLink, issueInvitation } from '../auth/invitations';

// MODE SIMULATION : un site « SIMULATION (TEST) » isolé du site de production. Les comptes de test y vivent,
// toutes leurs données y restent, et la remise à zéro ne supprime QUE les lignes de ce site.
const SIM_NAME = 'SIMULATION (TEST)';
const SIM_MARK = '__SIMULATION__';
const ACCOUNTS = [
  { role: 'DIRECTEUR_GENERAL', last: 'Directeur général', phone: '600000001', espace: 'dg' },
  { role: 'ADMIN_LOGISTIQUE', last: 'Responsable logistique', phone: '600000002', espace: 'logistique' },
  { role: 'MAGASINIER', last: 'Gestionnaire de stock', phone: '600000003', espace: 'stock' },
  { role: 'CHAUFFEUR', last: 'Chauffeur', phone: '600000004', espace: 'chauffeurs' },
] as const;
// Tables jamais vidées par la remise à zéro (comptes de test, structure, journal d'audit)
const KEEP = new Set(['users', 'drivers', 'sites', 'roles', 'organizations', 'audit_logs', 'user_invitations']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENT = /^[a-z0-9_]+$/;

@Injectable()
export class SimulationService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async findSite() {
    return this.prisma.site.findFirst({ where: { name: SIM_NAME, description: SIM_MARK } });
  }

  private async ensureSite(organizationId: string) {
    return (await this.findSite()) ?? this.prisma.site.create({ data: { organizationId, name: SIM_NAME, description: SIM_MARK, location: 'Données de test — sans effet sur la production' } });
  }

  async status() {
    const site = await this.findSite();
    if (!site) return { exists: false, accounts: [], counts: [] };
    const users = await this.prisma.user.findMany({ where: { siteId: site.id, deletedAt: null }, include: { role: true }, orderBy: { createdAt: 'asc' } });
    return {
      exists: true, siteId: site.id,
      accounts: users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, role: u.role.name, phone: u.phone, status: u.status, accepted: !u.mustChangePassword, lastLoginAt: u.lastLoginAt, espace: ACCOUNTS.find((a) => a.role === u.role.name)?.espace ?? null })),
      counts: await this.counts(site.id),
    };
  }

  private async siteTables(): Promise<string[]> {
    const rows: any[] = await this.prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'site_id'`);
    return rows.map((r) => String(r.table_name)).filter((t) => IDENT.test(t) && !KEEP.has(t));
  }

  private async counts(siteId: string) {
    if (!UUID.test(siteId)) return [];
    const out: { table: string; rows: number }[] = [];
    for (const t of await this.siteTables()) {
      const r: any[] = await this.prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${t}" WHERE "site_id" = '${siteId}'`);
      if (r[0]?.n) out.push({ table: t, rows: r[0].n });
    }
    return out.sort((a, b) => b.rows - a.rows);
  }

  // Création (ou mise à jour) des comptes de test + liens d'invitation individuels (aucun mot de passe transmis)
  async setup(appUrl: string, actor: Actor & { organizationId?: string }) {
    if (!/^https:\/\//.test(appUrl || '')) throw new BadRequestException("Lien de l'application invalide.");
    const site = await this.ensureSite((actor as any).organizationId);
    const links: any[] = [];
    for (const a of ACCOUNTS) {
      const email = `sim-${a.phone}@sim.local`;
      let u = await this.prisma.user.findUnique({ where: { email }, include: { role: true } });
      if (!u) {
        const role = await this.prisma.role.upsert({ where: { name: a.role as any }, update: {}, create: { name: a.role as any } });
        u = await this.prisma.user.create({
          data: { organizationId: (actor as any).organizationId, siteId: site.id, roleId: role.id, firstName: 'TEST', lastName: a.last, email, phone: a.phone, mustChangePassword: true, passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10) },
          include: { role: true },
        });
        await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'User', entityId: u.id, newValue: { role: a.role, via: 'simulation' } });
      }
      if (a.role === 'CHAUFFEUR') {
        const has = await this.prisma.driver.findFirst({ where: { userId: u.id } });
        if (!has) await this.prisma.driver.create({ data: { siteId: site.id, firstName: 'TEST', lastName: a.last, phone: a.phone, activity: 'TRUCK', userId: u.id } });
      }
      const token = await issueInvitation(this.prisma, u.id, actor.userId);
      links.push({ userId: u.id, name: `TEST ${a.last}`, role: a.role, link: inviteLink(appUrl, token, a.espace) });
    }
    return { siteId: site.id, links };
  }

  // Remise à zéro : uniquement les données du site de simulation, en une seule transaction (tout ou rien)
  async reset(confirm: string, actor: Actor) {
    if (confirm !== 'REINITIALISER') throw new BadRequestException('Confirmation absente : saisissez REINITIALISER.');
    const site = await this.findSite();
    if (!site || !UUID.test(site.id) || site.name !== SIM_NAME || site.description !== SIM_MARK) throw new ForbiddenException('Aucun site de simulation : rien à réinitialiser.');
    const before = await this.counts(site.id);
    const tables = await this.siteTables();
    const simUsers = (await this.prisma.user.findMany({ where: { siteId: site.id }, select: { id: true } })).map((u) => u.id);
    const simDrivers = (await this.prisma.driver.findMany({ where: { siteId: site.id }, select: { id: true } })).map((d) => d.id);
    await this.prisma.$transaction(async (tx) => {
      const fks = async (table: string): Promise<{ child: string; col: string }[]> => {
        const rows: any[] = await tx.$queryRawUnsafe(`SELECT cl.relname AS child, a.attname AS col FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_class rf ON rf.oid = c.confrelid JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] WHERE c.contype = 'f' AND rf.relname = '${table}' AND array_length(c.conkey, 1) = 1`);
        return rows.map((r) => ({ child: String(r.child), col: String(r.col) })).filter((r) => IDENT.test(r.child) && IDENT.test(r.col));
      };
      const purge = async (table: string, where: string, depth: number) => {
        if (depth > 8) throw new Error('Dépendances trop profondes : remise à zéro annulée.');
        for (const f of await fks(table)) {
          if (KEEP.has(f.child) || f.child === table) continue; // les liens d'une table vers elle-même sont réglés par la suppression groupée
          await purge(f.child, `"${f.col}" IN (SELECT "id" FROM "${table}" WHERE ${where})`, depth + 1);
        }
        await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE ${where}`);
      };
      for (const t of tables) await purge(t, `"site_id" = '${site.id}'`, 0);
      // Ce qui dépend des comptes et chauffeurs de test (sans supprimer ces comptes eux-mêmes)
      const idList = (ids: string[]) => ids.filter((i) => UUID.test(i)).map((i) => `'${i}'`).join(',');
      if (simDrivers.length) for (const f of await fks('drivers')) if (!KEEP.has(f.child)) await purge(f.child, `"${f.col}" IN (${idList(simDrivers)})`, 1);
      if (simUsers.length) for (const f of await fks('users')) if (!KEEP.has(f.child)) await purge(f.child, `"${f.col}" IN (${idList(simUsers)})`, 1);
    }, { timeout: 120000, maxWait: 20000 });
    await this.audit.log({ userId: actor.userId, action: 'DELETE', entity: 'Simulation', entityId: site.id, newValue: { reset: true, deleted: before } });
    return { ok: true, deleted: before };
  }
}
