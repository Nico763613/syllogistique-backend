import { BadRequestException, ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { LicData, LicView, computeState, modulesOf, verifyToken } from './license.logic';

const KEY = 'LICENSE_DATA';

// Licence de l'installation. Active seulement si MASTER_URL est défini : sans cette variable
// (installation du propriétaire), rien ne change et l'application fonctionne comme avant.
@Injectable()
export class LicenseService implements OnModuleInit {
  private log = new Logger('Licence');
  private cache: { at: number; data: LicData } | null = null;
  readonly masterUrl = (process.env.MASTER_URL || '').trim().replace(/\/$/, '');
  readonly enforced = !!this.masterUrl;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    if (this.enforced) setTimeout(() => this.check().catch(() => {}), 20000);
  }

  private async org() {
    return this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  }
  private async load(force = false): Promise<LicData> {
    if (!force && this.cache && Date.now() - this.cache.at < 30000) return this.cache.data;
    const o = await this.org();
    let data: LicData = {};
    if (o) {
      const s = await this.prisma.setting.findUnique({ where: { organizationId_key: { organizationId: o.id, key: KEY } } });
      if (s) { try { data = JSON.parse(s.value); } catch { data = {}; } }
    }
    this.cache = { at: Date.now(), data };
    return data;
  }
  private async save(data: LicData) {
    const o = await this.org();
    if (!o) throw new BadRequestException("Aucune entreprise n'est configurée.");
    const value = JSON.stringify(data);
    await this.prisma.setting.upsert({
      where: { organizationId_key: { organizationId: o.id, key: KEY } },
      update: { value },
      create: { organizationId: o.id, key: KEY, value },
    });
    this.cache = { at: Date.now(), data };
  }

  async state(): Promise<LicView> {
    return computeState(this.enforced, await this.load());
  }

  async modules(): Promise<string[] | null> {
    return modulesOf(this.enforced, await this.load());
  }

  private async post(path: string, body: any) {
    const r = await fetch(this.masterUrl + path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
  }

  async activate(code: string) {
    if (!this.enforced) throw new BadRequestException("L'activation n'est pas nécessaire sur cette installation.");
    const d = await this.load(true);
    if ((await this.state()).state !== 'UNACTIVATED') throw new ConflictException('Cette installation est déjà activée.');
    const instanceId = d.instanceId || randomUUID();
    let res;
    try {
      res = await this.post('/v1/activate', { code, instanceId, instanceUrl: process.env.RENDER_EXTERNAL_URL || null, appVersion: process.env.APP_VERSION || '39' });
    } catch {
      throw new BadRequestException('Impossible de joindre le serveur de licences. Vérifiez la connexion et réessayez.');
    }
    if (res.status !== 200) throw new BadRequestException(res.json.error || "Activation refusée.");
    const pin = (process.env.MASTER_PUBLIC_KEY || '').replace(/\\n/g, '\n').trim();
    if (pin && pin !== String(res.json.publicKey).trim()) throw new BadRequestException('Serveur de licences non reconnu.');
    const payload = verifyToken(res.json.token, res.json.publicKey);
    if (!payload || payload.iid !== instanceId) throw new BadRequestException('Réponse du serveur de licences invalide.');
    await this.save({ instanceId, licenseId: res.json.licenseId, instanceKey: res.json.instanceKey, token: res.json.token, publicKey: res.json.publicKey, lastOkAt: Date.now() });
    // Personnalisation : nom, logo et couleur du client (modifiables ensuite par l'administrateur).
    const o = await this.org();
    if (o && payload.brand) {
      await this.prisma.organization.update({ where: { id: o.id }, data: { name: payload.brand.name || o.name, brandColor: payload.brand.color ?? o.brandColor } });
      await this.syncBrandLogo(payload);
    }
    this.log.log('Installation activée.');
    return this.state();
  }

  // Logo envoyé depuis le Master : copié dans la base de l'entreprise (indépendant de la disponibilité du Master)
  private lastMasterLogo = '';
  private async syncBrandLogo(payload: any) {
    const src: string | undefined = payload?.brand?.logoUrl;
    if (!src || !/^https?:\/\//i.test(src) || src === this.lastMasterLogo) return;
    try {
      const r = await fetch(src, { signal: AbortSignal.timeout(10000) });
      const type = (r.headers.get('content-type') || '').split(';')[0];
      if (!r.ok || !['image/png', 'image/jpeg'].includes(type)) return;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 200000) return;
      const o = await this.org();
      if (!o) return;
      await this.prisma.organization.update({ where: { id: o.id }, data: { logoUrl: `data:${type};base64,${buf.toString('base64')}` } });
      this.lastMasterLogo = src;
    } catch { /* nouvel essai à la prochaine vérification */ }
  }

  // Paiement confirmé par le Master : condition pour que le client ajoute son propre logo
  async paid(): Promise<boolean> {
    if (!this.enforced) return true;
    const d = await this.load();
    if (!d.token || !d.publicKey) return true;
    const p: any = verifyToken(d.token, d.publicKey);
    return !p || p.paid !== false;
  }

  // Ce que l'installation remonte au Master : appareils chauffeurs et signalements (aucun contenu métier privé)
  private async telemetry() {
    const devs = await this.prisma.driverDevice.findMany({ where: { status: { in: ['ACTIVE', 'BLOCKED'] } }, take: 500 });
    const drivers = await this.prisma.driver.findMany({ where: { id: { in: [...new Set(devs.map((x) => x.driverId))] } }, select: { id: true, firstName: true, lastName: true } });
    const nm = new Map(drivers.map((x) => [x.id, `${x.firstName} ${x.lastName}`]));
    const reports = await this.prisma.problemReport.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return {
      devices: devs.map((x) => ({ id: x.id, name: `${nm.get(x.driverId) ?? 'Chauffeur'} — ${x.model ?? 'appareil'}`, lastSeenAt: x.lastSeenAt ?? x.activatedAt })),
      reports: reports.map((r) => ({ id: r.id, userName: r.userName, role: r.role, screen: r.screen, message: r.message, createdAt: r.createdAt, context: [r.network, r.appVersion, r.lastError].filter(Boolean).join(' · ') })),
    };
  }

  // Ordres du Master : blocage / déblocage / déconnexion d'appareils chauffeurs (effet à la prochaine synchronisation, au plus 1 h)
  private async applyDeviceOrders(json: any) {
    const blocked: string[] = Array.isArray(json.blockedDevices) ? json.blockedDevices : [];
    const disc: string[] = Array.isArray(json.disconnectDevices) ? json.disconnectDevices : [];
    const REASON = 'Bloqué par l\'administrateur système';
    if (blocked.length) await this.prisma.driverDevice.updateMany({ where: { id: { in: blocked }, status: 'ACTIVE' }, data: { status: 'BLOCKED', blockedAt: new Date(), blockedReason: REASON } });
    await this.prisma.driverDevice.updateMany({ where: { status: 'BLOCKED', blockedReason: REASON, id: { notIn: blocked } }, data: { status: 'ACTIVE', blockedAt: null, blockedReason: null } });
    if (disc.length) await this.prisma.driverDevice.updateMany({ where: { id: { in: disc }, status: { in: ['ACTIVE', 'BLOCKED'] } }, data: { status: 'REVOKED', blockedAt: new Date(), blockedReason: 'Déconnecté par l\'administrateur système' } });
  }

  @Interval(3600000)
  async check() {
    if (!this.enforced) return;
    const d = await this.load(true);
    if (!d.licenseId || !d.instanceKey) return;
    try {
      const extra = await this.telemetry().catch(() => ({}));
      const res = await this.post('/v1/check', { licenseId: d.licenseId, instanceKey: d.instanceKey, instanceId: d.instanceId, appVersion: process.env.APP_VERSION || '39', ...extra });
      if (res.status === 200 && verifyToken(res.json.token, d.publicKey || '')) {
        await this.save({ ...d, token: res.json.token, lastOkAt: Date.now(), invalid: false });
        await this.syncBrandLogo(verifyToken(res.json.token, d.publicKey || ''));
        await this.applyDeviceOrders(res.json).catch(() => {});
      } else if (res.status === 401) {
        await this.save({ ...d, invalid: true });
      }
    } catch {
      /* Master injoignable : la tolérance de 7 jours s'applique */
    }
  }
}
