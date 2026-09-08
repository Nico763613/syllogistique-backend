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
