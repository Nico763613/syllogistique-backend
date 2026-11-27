import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { currentOrganizationId } from '../common/tenant-scope';
import { AuditService } from '../audit/audit.service';
import { UpdateOrganizationDto, SetNumberingDto } from './dto/settings.dto';
import { DOC_TYPES, formatDocNumber } from '../common/doc-numbers';
import { FUEL_PRICE_KEY, currentFuelPrice } from '../common/fuel-price';

// Paramètres administrateur (§40) : tarifs carburant, seuils, nom/logo de l'entreprise…
// Tarif carburant unique : 12 000 GNF/L par défaut, modifiable ici (motif obligatoire).
const NUMERIC_KEYS = new Set([
  FUEL_PRICE_KEY,
  'MAINTENANCE_ALERT_DAYS',
  'DOCUMENT_ALERT_DAYS',
  'FUEL_ANOMALY_PERCENT',
  'MAX_SITES',
  'TON_PRICE', // prix par tonne transportée (GNF), fixé par le responsable logistique
  'FLEET_TARGET', // nombre de véhicules prévus (10 au départ, à augmenter)
]);
const KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ---- Numérotation des documents (réglable par le PDG / l'administrateur) ----
  async numbering() {
    const cfg = (await this.prisma.$queryRawUnsafe('SELECT "doc_type","prefix","pad","include_year","reset_yearly" FROM "document_numbering_config"')) as any[];
    const seqs = (await this.prisma.$queryRawUnsafe('SELECT "doc_type", MAX("last_value") AS last FROM "document_sequences" GROUP BY "doc_type"')) as any[];
    const year = new Date().getFullYear();
    return DOC_TYPES.map((t) => {
      const c = cfg.find((x) => x.doc_type === t.code);
      const prefix = c?.prefix || t.prefix; const pad = c ? Number(c.pad) : 4;
      const resetYearly = c ? c.reset_yearly !== false : true; const includeYear = resetYearly ? true : c ? c.include_year !== false : true;
      const last = Number(seqs.find((x) => x.doc_type === t.code)?.last || 0);
      const next = last + 1;
      return { ...t, prefix, pad, includeYear, resetYearly, configured: !!c, lastNumber: last, example: includeYear ? formatDocNumber(prefix, year, next, pad) : `${prefix}-${String(next).padStart(pad, '0')}` };
    });
  }

  async setNumbering(docType: string, dto: SetNumberingDto, actorId: string) {
    const t = DOC_TYPES.find((x) => x.code === docType);
    if (!t) throw new NotFoundException('Type de document inconnu.');
    // La numérotation est encore commune à toute la plateforme (numéros uniques partout) : seule
    // l'entreprise principale peut la régler, pour qu'une entreprise ne modifie jamais celle d'une autre.
    const main = ((await this.prisma.$queryRawUnsafe('SELECT "organization_id" AS o FROM "sites" ORDER BY "created_at" ASC LIMIT 1')) as any[])[0]?.o;
    const org = currentOrganizationId();
    if (org && main && org !== main) throw new ForbiddenException("La numérotation des documents est réglée par l'éditeur pour votre entreprise. Contactez le support.");
    const resetYearly = dto.resetYearly !== false;
    const includeYear = resetYearly ? true : dto.includeYear !== false;
    // Un préfixe ne peut pas être partagé par deux types (sinon deux documents pourraient recevoir le même numéro).
    const all = await this.numbering();
    const clash = all.find((x) => x.code !== docType && x.prefix === dto.prefix);
    if (clash) throw new BadRequestException(`Le préfixe ${dto.prefix} est déjà utilisé par « ${clash.label} ».`);
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO "document_numbering_config" ("doc_type","prefix","pad","include_year","reset_yearly","updated_by","updated_at") VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP) ON CONFLICT ("doc_type") DO UPDATE SET "prefix"=$2,"pad"=$3,"include_year"=$4,"reset_yearly"=$5,"updated_by"=$6,"updated_at"=CURRENT_TIMESTAMP',
      docType, dto.prefix, dto.pad, includeYear, resetYearly, actorId);
    try { await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'document_numbering', entityId: docType, newValue: { prefix: dto.prefix, pad: dto.pad, includeYear, resetYearly } }); } catch {}
    return (await this.numbering()).find((x) => x.code === docType);
  }

  list(organizationId: string) {
    return this.prisma.setting.findMany({ where: { organizationId, NOT: { key: { startsWith: 'LICENSE_' } } }, orderBy: { key: 'asc' } });
  }

  async fuelPrice(organizationId: string) {
    const setting = await this.prisma.setting.findUnique({
      where: { organizationId_key: { organizationId, key: FUEL_PRICE_KEY } },
    });
    return {
      key: FUEL_PRICE_KEY,
      pricePerLiter: await currentFuelPrice(this.prisma, organizationId),
      currency: 'GNF',
      updatedAt: setting?.updatedAt ?? null,
    };
  }

  async set(organizationId: string, key: string, value: string, actorId: string, reason?: string) {
    if (key.startsWith('LICENSE_')) throw new BadRequestException('Clé réservée.');
    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException('Clé invalide (majuscules, chiffres et _ uniquement).');
    }
    if (NUMERIC_KEYS.has(key)) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) throw new BadRequestException('Cette valeur doit être un nombre positif.');
      if (key === FUEL_PRICE_KEY && n <= 0) throw new BadRequestException('Le tarif du carburant doit être supérieur à 0.');
    }
    if (key === FUEL_PRICE_KEY && (!reason || reason.trim().length < 3)) {
      throw new BadRequestException('Un motif est obligatoire pour modifier le tarif du carburant.');
    }
    const existing = await this.prisma.setting.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
    const saved = await this.prisma.setting.upsert({
      where: { organizationId_key: { organizationId, key } },
      update: { value },
      create: { organizationId, key, value },
    });
    await this.audit.log({
      userId: actorId,
      action: existing ? 'UPDATE' : 'CREATE',
      entity: 'Setting',
      entityId: saved.id,
      oldValue: existing ? { key, value: existing.value } : undefined,
      newValue: { key, value },
      reason: reason?.trim() || undefined,
    });
    return saved;
  }

  async getOrganization(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organisation introuvable.');
    return org;
  }

  async updateOrganization(organizationId: string, dto: UpdateOrganizationDto, actorId: string) {
    const old = await this.getOrganization(organizationId);
    const updated = await this.prisma.organization.update({ where: { id: organizationId }, data: dto });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Organization',
      entityId: organizationId,
      oldValue: old,
      newValue: dto,
    });
    return updated;
  }
}
