import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateOrganizationDto } from './dto/settings.dto';
import { FUEL_PRICE_KEY, currentFuelPrice } from '../common/fuel-price';

// Paramètres administrateur (§40) : tarifs carburant, seuils, nom/logo de l'entreprise…
// Tarif carburant unique : 12 000 GNF/L par défaut, modifiable ici (motif obligatoire).
const NUMERIC_KEYS = new Set([
  FUEL_PRICE_KEY,
  'MAINTENANCE_ALERT_DAYS',
  'DOCUMENT_ALERT_DAYS',
  'FUEL_ANOMALY_PERCENT',
  'FLEET_TARGET', // nombre de véhicules prévus (10 au départ, à augmenter)
]);
const KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list(organizationId: string) {
    return this.prisma.setting.findMany({ where: { organizationId }, orderBy: { key: 'asc' } });
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
