import { BadRequestException, ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { LicData, LicView, computeState, verifyToken } from './license.logic';

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
      await this.prisma.organization.update({ where: { id: o.id }, data: { name: payload.brand.name || o.name, logoUrl: payload.brand.logoUrl ?? o.logoUrl, brandColor: payload.brand.color ?? o.brandColor } });
    }
    this.log.log('Installation activée.');
    return this.state();
  }

  @Interval(3600000)
  async check() {
    if (!this.enforced) return;
    const d = await this.load(true);
    if (!d.licenseId || !d.instanceKey) return;
    try {
      const res = await this.post('/v1/check', { licenseId: d.licenseId, instanceKey: d.instanceKey, instanceId: d.instanceId, appVersion: process.env.APP_VERSION || '39' });
      if (res.status === 200 && verifyToken(res.json.token, d.publicKey || '')) {
        await this.save({ ...d, token: res.json.token, lastOkAt: Date.now(), invalid: false });
      } else if (res.status === 401) {
        await this.save({ ...d, invalid: true });
      }
    } catch {
      /* Master injoignable : la tolérance de 7 jours s'applique */
    }
  }
}
