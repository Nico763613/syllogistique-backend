import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { classify, groupKey } from './notification-folders';

// Centre de notifications : génère les alertes du cahier des charges §27
// (stock sous seuil, entretien dépassé, permis bientôt expiré, etc.)
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  // Chaque utilisateur voit les alertes générales + celles adressées à son rôle et à son site.
  // L'Administrateur Général voit tout.
  // opts.all : inclut les alertes déjà lues (centre d'alertes) ; sinon comportement historique (cloche).
  findAll(unreadOnly = false, actor?: { role: string; siteId?: string }, opts: { all?: boolean; limit?: number } = {}) {
    const scope: any =
      !actor || actor.role === 'SUPER_ADMIN'
        ? {}
        : {
            AND: [
              { OR: [{ roleName: null }, { roleName: actor.role }] },
              ...(actor.siteId ? [{ OR: [{ siteId: null }, { siteId: actor.siteId }] }] : []),
            ],
          };
    const limit = Math.min(Math.max(opts.limit || 100, 1), 400);
    return this.prisma.notification
      .findMany({
        where: { ...(unreadOnly ? { isRead: false } : {}), ...scope },
        orderBy: { createdAt: 'desc' },
        take: opts.all ? limit * 2 : 200,
      })
      .then((list) =>
        (actor ? list.filter((n) => NotificationsService.relevantFor(actor.role, n)) : list)
          .slice(0, limit)
          .map((n) => ({ ...n, ...classify(n), groupKey: groupKey(n), handled: n.status === 'HANDLED' })),
      );
  }

  // Pertinence métier des alertes générales (sans destinataire) : chaque rôle ne voit que ce qui le concerne.
  // Une alerte adressée nommément à un rôle ou à un utilisateur reste toujours visible ; entité inconnue = visible (rien n'est masqué par erreur).
  private static readonly AUDIENCE: Record<string, string[]> = {
    Driver: ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'RESPONSABLE_OPERATIONS', 'GESTIONNAIRE_HSE', 'AGENT_HSE', 'DIRECTEUR_GENERAL'],
    DriverDevice: ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'RESPONSABLE_OPERATIONS', 'DIRECTEUR_GENERAL'],
    DriverSignup: ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'RESPONSABLE_OPERATIONS', 'DIRECTEUR_GENERAL'],
    Vehicle: ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'RESPONSABLE_OPERATIONS', 'MECANICIEN', 'GESTIONNAIRE_HSE', 'DIRECTEUR_GENERAL'],
    InventoryItem: ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'RESPONSABLE_OPERATIONS', 'MAGASINIER', 'COMPTABLE', 'DIRECTEUR_GENERAL'],
    InventoryCount: ['MAGASINIER', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_OPERATIONS', 'COMPTABLE', 'DIRECTEUR_GENERAL'],
    HseIncident: ['GESTIONNAIRE_HSE', 'AGENT_HSE', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_OPERATIONS', 'DIRECTEUR_GENERAL'],
    HseInspection: ['GESTIONNAIRE_HSE', 'AGENT_HSE', 'RESPONSABLE_OPERATIONS', 'DIRECTEUR_GENERAL'],
    HseCorrectiveAction: ['GESTIONNAIRE_HSE', 'AGENT_HSE', 'RESPONSABLE_OPERATIONS', 'DIRECTEUR_GENERAL'],
    HseTraining: ['GESTIONNAIRE_HSE', 'AGENT_HSE', 'RESPONSABLE_OPERATIONS', 'DIRECTEUR_GENERAL'],
    HseToolboxTalk: ['GESTIONNAIRE_HSE', 'AGENT_HSE', 'RESPONSABLE_OPERATIONS', 'DIRECTEUR_GENERAL'],
    Expense: ['COMPTABLE', 'RESPONSABLE_OPERATIONS', 'ADMIN_LOGISTIQUE', 'DIRECTEUR_GENERAL'],
    DriverExpense: ['COMPTABLE', 'RESPONSABLE_OPERATIONS', 'ADMIN_LOGISTIQUE', 'DIRECTEUR_GENERAL'],
    FuelTransaction: ['COMPTABLE', 'RESPONSABLE_OPERATIONS', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'DIRECTEUR_GENERAL'],
    CashSession: ['CAISSIER', 'RESPONSABLE_COMMERCIAL', 'COMPTABLE', 'DIRECTEUR_GENERAL'],
    CashExpense: ['CAISSIER', 'RESPONSABLE_COMMERCIAL', 'COMPTABLE', 'DIRECTEUR_GENERAL'],
    Customer: ['RESPONSABLE_COMMERCIAL', 'COMPTABLE', 'DIRECTEUR_GENERAL'],
  };

  static relevantFor(role: string, n: { roleName?: string | null; userId?: string | null; entity?: string | null }) {
    if (role === 'SUPER_ADMIN' || n.roleName || n.userId || !n.entity) return true;
    const aud = NotificationsService.AUDIENCE[n.entity];
    return !aud || aud.includes(role);
  }

  // Marquer « lu » : seulement une alerte que l'utilisateur est autorisé à voir (aucune modification des alertes d'autres rôles).
  private async assertVisible(id: string, actor?: { role: string; siteId?: string }) {
    if (actor && actor.role !== 'SUPER_ADMIN') {
      const visible = await this.findAll(false, actor, { all: true, limit: 400 });
      if (!visible.some((n) => n.id === id)) throw new ForbiddenException('Alerte non accessible.');
    }
  }

  // « Lu » ≠ « traité » : lire ne change jamais le statut de traitement.
  async markRead(id: string, actor?: { role: string; siteId?: string }) {
    await this.assertVisible(id, actor);
    const cur = await this.prisma.notification.findUnique({ where: { id } });
    return this.prisma.notification.update({ where: { id }, data: { isRead: true, status: cur && cur.status === 'NEW' ? 'SEEN' : undefined } });
  }

  async markUnread(id: string, actor?: { role: string; siteId?: string }) {
    await this.assertVisible(id, actor);
    const cur = await this.prisma.notification.findUnique({ where: { id } });
    return this.prisma.notification.update({ where: { id }, data: { isRead: false, status: cur && cur.status === 'SEEN' ? 'NEW' : undefined } });
  }

  // Traité : l'alerte est prise en charge (elle reste dans l'historique, filtre « Traitées »).
  async markHandled(id: string, handled: boolean, actor?: { role: string; siteId?: string }) {
    await this.assertVisible(id, actor);
    return this.prisma.notification.update({ where: { id }, data: handled ? { status: 'HANDLED', isRead: true } : { status: 'SEEN' } });
  }

  create(title: string, message: string, severity: 'INFO' | 'WARNING' | 'CRITICAL', entity?: string, entityId?: string) {
    return this.prisma.notification.create({ data: { title, message, severity, entity, entityId } });
  }

  // Alerte rattachée à un site : visible par les équipes de ce site uniquement (cloisonnement).
  createForSite(siteId: string, title: string, message: string, severity: 'INFO' | 'WARNING' | 'CRITICAL', entity?: string, entityId?: string) {
    return this.prisma.notification.create({ data: { title, message, severity, entity, entityId, siteId } });
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

    // Échéances par étape : 30 jours, 7 jours, expiré. Une seule alerte par étape et par échéance
    // (la date figure dans le message : un renouvellement relance naturellement le cycle).
    const stageOf = (expiry: Date) => {
      const days = Math.ceil((+expiry - +now) / 86400000);
      if (days < 0) return { key: 'EXPIRE', title: 'expiré', sev: 'CRITICAL' as const, days };
      if (days <= 7) return { key: 'J7', title: 'expire dans 7 jours ou moins', sev: 'CRITICAL' as const, days };
      if (days <= 30) return { key: 'J30', title: 'expire dans 30 jours ou moins', sev: 'WARNING' as const, days };
      return null;
    };
    const stageAlert = async (entity: string, entityId: string, what: string, expiry: Date, who: string) => {
      const st = stageOf(expiry);
      if (!st) return;
      const title = `${what} ${st.title}`;
      const message = `${who} — ${what.toLowerCase()} ${st.days < 0 ? 'expiré' : 'expire'} le ${expiry.toLocaleDateString('fr-FR')}.`;
      const roles = st.sev === 'CRITICAL' ? ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'SUPER_ADMIN'] : ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE'];
      for (const roleName of roles) {
        const dup = await this.prisma.notification.findFirst({ where: { entity, entityId, title, message, roleName } });
        if (dup) continue;
        created.push(await this.prisma.notification.create({ data: { title, message, severity: st.sev, entity, entityId, siteId, roleName } }));
      }
    };

    const drivers = await this.prisma.driver.findMany({
      where: { siteId, licenseExpiryDate: { not: null, lte: in30Days }, deletedAt: null },
    });
    for (const d of drivers) {
      await stageAlert('Driver', d.id, 'Permis de conduire', d.licenseExpiryDate!, `${d.firstName} ${d.lastName}`);
    }

    // Plaques IT (Immatriculation Temporaire) : validité courte, alerte à 15 jours puis si expirée
    const in15Days = new Date();
    in15Days.setDate(now.getDate() + 15);
    const itVehicles = await this.prisma.vehicle.findMany({
      where: { siteId, registrationType: 'IT', itExpiryDate: { lte: in15Days }, deletedAt: null },
    });
    for (const v of itVehicles) {
      if (await alreadyNotified('Vehicle', v.id)) continue;
      const expired = v.itExpiryDate! < now;
      created.push(
        await this.createForSite(siteId, 
          expired ? 'Plaque IT expirée' : 'Plaque IT bientôt expirée',
          `La plaque IT du véhicule ${v.internalNumber} (${v.registrationNumber}) ${expired ? 'a expiré' : 'expire'} le ${v.itExpiryDate!.toLocaleDateString('fr-FR')}.`,
          'WARNING',
          'Vehicle',
          v.id,
        ),
      );
    }

    const items = await this.prisma.inventoryItem.findMany({ where: { siteId } });
    for (const i of items) {
      if (Number(i.currentQuantity) < Number(i.minimumQuantity)) {
        if (await alreadyNotified('InventoryItem', i.id)) continue;
        created.push(
          await this.createForSite(siteId, 
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
          await this.createForSite(siteId, 
            'Entretien en retard',
            `${v.internalNumber} — entretien attendu depuis le ${last.nextDate.toLocaleDateString('fr-FR')}.`,
            'CRITICAL',
            'Vehicle',
            v.id,
          ),
        );
      }
    }

    // --- Entretien / vidange au kilométrage : alerte 500 km avant l'échéance, puis une fois dépassée ---
    for (const v of vehicles) {
      const nextKm = v.maintenance[0]?.nextMileage;
      if (!nextKm) continue;
      const left = nextKm - v.currentMileage;
      if (left > 500) continue;
      if (await alreadyNotified('VehicleKm', v.id)) continue;
      const over = left <= 0;
      created.push(
        await this.createForSite(siteId, 
          over ? 'Entretien kilométrique dépassé' : 'Entretien kilométrique proche',
          `${v.internalNumber} — entretien prévu à ${nextKm.toLocaleString('fr-FR')} km ; ${over ? `dépassé de ${(-left).toLocaleString('fr-FR')} km` : `il reste ${left.toLocaleString('fr-FR')} km`} (compteur : ${v.currentMileage.toLocaleString('fr-FR')} km).`,
          over ? 'CRITICAL' : 'WARNING',
          'VehicleKm',
          v.id,
        ),
      );
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
      where: { replacedAt: null, vehicle: { siteId, deletedAt: null }, expiryDate: { not: null, lte: docLimit } },
      include: { vehicle: { select: { internalNumber: true } } },
    });
    for (const d of docs) {
      const label = d.type.replace(/_/g, ' ').toLowerCase();
      await stageAlert('Document', d.id, label.charAt(0).toUpperCase() + label.slice(1), d.expiryDate!, d.vehicle.internalNumber);
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
              await this.createForSite(siteId, 
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
            await this.createForSite(siteId, 
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
