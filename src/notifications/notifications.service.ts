import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Centre de notifications : génère les alertes du cahier des charges §27
// (stock sous seuil, entretien dépassé, permis bientôt expiré, etc.)
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  findAll(unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: unreadOnly ? { isRead: false } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  markRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  create(title: string, message: string, severity: 'INFO' | 'WARNING' | 'CRITICAL', entity?: string, entityId?: string) {
    return this.prisma.notification.create({ data: { title, message, severity, entity, entityId } });
  }

  // Analyse quotidienne : permis chauffeurs bientôt expirés, stock sous seuil, entretiens en retard
  // Évite les doublons : ne recrée pas une alerte déjà émise dans les dernières 24h pour la même entité.
  async runDailyChecks(siteId: string) {
    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(now.getDate() + 30);
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const created: any[] = [];

    const alreadyNotified = async (entity: string, entityId: string) => {
      const existing = await this.prisma.notification.findFirst({
        where: { entity, entityId, createdAt: { gte: yesterday } },
      });
      return !!existing;
    };

    const drivers = await this.prisma.driver.findMany({
      where: { siteId, licenseExpiryDate: { lte: in30Days, gte: now }, deletedAt: null },
    });
    for (const d of drivers) {
      if (await alreadyNotified('Driver', d.id)) continue;
      created.push(
        await this.create(
          'Permis bientôt expiré',
          `Le permis de ${d.firstName} ${d.lastName} expire le ${d.licenseExpiryDate?.toLocaleDateString('fr-FR')}.`,
          'WARNING',
          'Driver',
          d.id,
        ),
      );
    }

    const items = await this.prisma.inventoryItem.findMany({ where: { siteId } });
    for (const i of items) {
      if (Number(i.currentQuantity) < Number(i.minimumQuantity)) {
        if (await alreadyNotified('InventoryItem', i.id)) continue;
        created.push(
          await this.create(
            'Stock sous le seuil minimum',
            `${i.name} : ${i.currentQuantity} ${i.unit} restant (seuil : ${i.minimumQuantity}).`,
            'CRITICAL',
            'InventoryItem',
            i.id,
          ),
        );
      }
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: { siteId, deletedAt: null },
      include: { maintenance: { orderBy: { maintenanceDate: 'desc' }, take: 1 } },
    });
    for (const v of vehicles) {
      const last = v.maintenance[0];
      if (!last?.nextDate) continue;
      if (last.nextDate < now) {
        if (await alreadyNotified('Vehicle', v.id)) continue;
        created.push(
          await this.create(
            'Entretien en retard',
            `${v.internalNumber} — entretien attendu depuis le ${last.nextDate.toLocaleDateString('fr-FR')}.`,
            'CRITICAL',
            'Vehicle',
            v.id,
          ),
        );
      }
    }

    // --- Documents de véhicules (assurance, visite technique, carte grise…) §27-28 ---
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    const readSetting = async (key: string, fallback: number) => {
      if (!site) return fallback;
      const st = await this.prisma.setting.findUnique({
        where: { organizationId_key: { organizationId: site.organizationId, key } },
      });
      const n = st ? Number(st.value) : NaN;
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    const docAlertDays = await readSetting('DOCUMENT_ALERT_DAYS', 30);
    const docLimit = new Date(now.getTime() + docAlertDays * 86400000);
    const docs = await this.prisma.document.findMany({
      where: { vehicle: { siteId, deletedAt: null }, expiryDate: { not: null, lte: docLimit } },
      include: { vehicle: { select: { internalNumber: true } } },
    });
    for (const d of docs) {
      if (await alreadyNotified('Document', d.id)) continue;
      const expired = d.expiryDate! < now;
      const label = d.type.replace(/_/g, ' ').toLowerCase();
      created.push(
        await this.create(
          expired ? 'Document expiré' : 'Document bientôt expiré',
          `${d.vehicle.internalNumber} — ${label} ${expired ? 'expiré' : 'expire'} le ${d.expiryDate!.toLocaleDateString('fr-FR')}.`,
          expired ? 'CRITICAL' : 'WARNING',
          'Document',
          d.id,
        ),
      );
    }

    // --- Carburant anormalement élevé / kilométrage incohérent (ravitaillements des dernières 24h) ---
    const anomalyPercent = await readSetting('FUEL_ANOMALY_PERCENT', 50);
    const recentFuel = await this.prisma.fuelTransaction.findMany({
      where: { siteId, transactionDate: { gte: yesterday } },
      include: { vehicle: { select: { internalNumber: true } } },
    });
    for (const f of recentFuel) {
      const history = await this.prisma.fuelTransaction.findMany({
        where: { vehicleId: f.vehicleId, transactionDate: { lt: f.transactionDate } },
        orderBy: { transactionDate: 'desc' },
        take: 10,
      });

      if (history.length >= 3) {
        const avg = history.reduce((s, h) => s + Number(h.quantityLiters), 0) / history.length;
        if (avg > 0 && Number(f.quantityLiters) > avg * (1 + anomalyPercent / 100)) {
          if (!(await alreadyNotified('FuelTransaction', f.id))) {
            created.push(
              await this.create(
                'Carburant anormalement élevé',
                `${f.vehicle.internalNumber} : ${f.quantityLiters} L pour une moyenne habituelle de ${avg.toFixed(0)} L.`,
                'WARNING',
                'FuelTransaction',
                f.id,
              ),
            );
          }
        }
      }

      const previous = history[0];
      if (previous && f.mileage < previous.mileage) {
        if (!(await alreadyNotified('FuelTransaction', f.id + ':km'))) {
          created.push(
            await this.create(
              'Kilométrage incohérent',
              `${f.vehicle.internalNumber} : ${f.mileage} km saisis alors que le dernier plein indiquait ${previous.mileage} km.`,
              'WARNING',
              'FuelTransaction',
              f.id + ':km',
            ),
          );
        }
      }
    }

    return { generated: created.length };
  }

  async runDailyChecksAllSites() {
    const sites = await this.prisma.site.findMany({ where: { status: 'ACTIVE' } });
    let total = 0;
    for (const s of sites) {
      const r = await this.runDailyChecks(s.id);
      total += r.generated;
    }
    return { sitesChecked: sites.length, generated: total };
  }
}
