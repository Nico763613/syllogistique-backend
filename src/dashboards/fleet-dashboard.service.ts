import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Actor } from '../common/actor';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DAY_MS, bucketKey, bucketKeys, resolvePeriod, startOfDay } from './dashboard-period';
import { Status, gnf, kpi, num, pct, periodInfo, resolveSite } from './dashboard-common';

const DOC_ALERT_DAYS = 30;
const CONSUMPTION_TOLERANCE = 1.15; // alerte si > 115 % de la consommation de référence
const DOC_LABEL: Record<string, string> = {
  CARTE_GRISE: 'Carte grise', ASSURANCE: 'Assurance', VISITE_TECHNIQUE: 'Visite technique', PERMIS: 'Permis',
  CONTRAT: 'Contrat', FACTURE: 'Facture', AUTRE: 'Autre', IT: 'Plaque IT', PERMIS_CHAUFFEUR: 'Permis chauffeur',
};

const ACTIONS: Array<{ key: string; label: string; endpoint: string; roles: string[] }> = [
  { key: 'assign_mission', label: 'Affecter une mission', endpoint: 'POST /trips', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE'] },
  { key: 'close_mission', label: 'Enregistrer le retour de mission', endpoint: 'PATCH /trips/:id/close', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'CHAUFFEUR'] },
  { key: 'fuel', label: 'Saisir un plein (station / cuve)', endpoint: 'POST /fuel', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE'] },
  { key: 'maintenance', label: 'Enregistrer un entretien (préventif / correctif)', endpoint: 'POST /maintenance', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE'] },
  { key: 'documents', label: 'Ajouter / renouveler un document', endpoint: 'POST /documents', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE'] },
];

@Injectable()
export class FleetDashboardService {
  constructor(private prisma: PrismaService) {}

  async get(actor: Actor, q: DashboardQueryDto) {
    const siteId = resolveSite(actor, q.siteId);
    const p = resolvePeriod(q.period ?? 'month', q.from, q.to, q.granularity);
    const now = new Date();
    const today = startOfDay(now);
    const siteWhere: any = siteId ? { siteId } : {};
    const vehicleSite: any = siteId ? { vehicle: { siteId } } : {};

    const [vehicles, trips, prevTrips, fuel, prevFuel, maints, prevMaint, docs, drivers, downtimes] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { ...siteWhere, deletedAt: null },
        select: { id: true, internalNumber: true, registrationNumber: true, status: true, currentMileage: true, referenceConsumption: true, itExpiryDate: true, registrationType: true },
      }),
      this.prisma.trip.findMany({
        where: { ...siteWhere, tripDate: { gte: p.from, lt: p.to } },
        select: { id: true, vehicleId: true, tripDate: true, startTime: true, status: true, distance: true, destination: true, driver: { select: { firstName: true, lastName: true } }, vehicle: { select: { internalNumber: true } } },
      }),
      this.prisma.trip.aggregate({ where: { ...siteWhere, tripDate: { gte: p.previousFrom, lt: p.previousTo } }, _sum: { distance: true }, _count: { _all: true } }),
      this.prisma.fuelTransaction.findMany({
        where: { ...siteWhere, transactionDate: { gte: p.from, lt: p.to } },
        select: { vehicleId: true, transactionDate: true, quantityLiters: true, totalCost: true },
      }),
      this.prisma.fuelTransaction.aggregate({ where: { ...siteWhere, transactionDate: { gte: p.previousFrom, lt: p.previousTo } }, _sum: { totalCost: true, quantityLiters: true } }),
      this.prisma.maintenance.findMany({
        where: { ...vehicleSite, maintenanceDate: { gte: p.from, lt: p.to } },
        select: { kind: true, cost: true, partsCost: true, laborCost: true, maintenanceDate: true },
      }),
      this.prisma.maintenance.findMany({
        where: { ...vehicleSite, maintenanceDate: { gte: p.previousFrom, lt: p.previousTo } },
        select: { cost: true },
      }),
      this.prisma.document.findMany({
        where: { ...vehicleSite, expiryDate: { not: null, lt: new Date(+today + (DOC_ALERT_DAYS + 1) * DAY_MS) } },
        select: { id: true, type: true, expiryDate: true, vehicle: { select: { id: true, internalNumber: true } } },
        orderBy: { expiryDate: 'asc' },
      }),
      this.prisma.driver.findMany({
        where: { ...siteWhere, deletedAt: null, status: 'ACTIVE', licenseExpiryDate: { not: null, lt: new Date(+today + (DOC_ALERT_DAYS + 1) * DAY_MS) } },
        select: { id: true, firstName: true, lastName: true, licenseExpiryDate: true },
      }),
      this.prisma.vehicleDowntime.findMany({
        where: { ...siteWhere, OR: [{ endedAt: null }, { endedAt: { gte: p.from } }], startedAt: { lt: p.to } },
        select: { id: true, vehicleId: true, category: true, reason: true, startedAt: true, endedAt: true, vehicle: { select: { internalNumber: true } } },
      }),
    ]);

    // Disponibilité du parc
    const byStatus: Record<string, number> = {};
    for (const v of vehicles) byStatus[v.status] = (byStatus[v.status] ?? 0) + 1;
    const unavailable = (byStatus.MAINTENANCE ?? 0) + (byStatus.IMMOBILIZED ?? 0) + (byStatus.OUT_OF_SERVICE ?? 0);
    const availability = vehicles.length ? pct(vehicles.length - unavailable, vehicles.length) : null;

    // Kilométrage, carburant, coûts
    const distance = trips.reduce((a, t) => a + (t.distance ?? 0), 0);
    const liters = fuel.reduce((a, f) => a + num(f.quantityLiters), 0);
    const fuelCost = fuel.reduce((a, f) => a + num(f.totalCost), 0);
    const maintCost = maints.reduce((a, m) => a + (num(m.cost) || num(m.partsCost) + num(m.laborCost)), 0);
    const prevMaintCost = prevMaint.reduce((a, m) => a + num(m.cost), 0);
    const preventive = maints.filter((m) => m.kind === 'PREVENTIVE').length;
    const costPerKm = distance > 0 ? (fuelCost + maintCost) / distance : null;
    const consumption = distance > 0 && liters > 0 ? Math.round((liters / distance) * 1000) / 10 : null; // L/100 km

    // Consommation par véhicule vs référence
    const kmByVehicle = new Map<string, number>();
    for (const t of trips) kmByVehicle.set(t.vehicleId, (kmByVehicle.get(t.vehicleId) ?? 0) + (t.distance ?? 0));
    const litersByVehicle = new Map<string, number>();
    for (const f of fuel) litersByVehicle.set(f.vehicleId, (litersByVehicle.get(f.vehicleId) ?? 0) + num(f.quantityLiters));
    const consumptionRows = vehicles
      .map((v) => {
        const km = kmByVehicle.get(v.id) ?? 0;
        const l = litersByVehicle.get(v.id) ?? 0;
        const actual = km > 0 && l > 0 ? Math.round((l / km) * 1000) / 10 : null;
        const ref = v.referenceConsumption === null ? null : num(v.referenceConsumption);
        return { vehicleId: v.id, vehicle: v.internalNumber, km, liters: Math.round(l * 10) / 10, actual, reference: ref, anomaly: actual !== null && ref ? actual > ref * CONSUMPTION_TOLERANCE : false };
      })
      .filter((r) => r.actual !== null);
    const anomalies = consumptionRows.filter((r) => r.anomaly);

    // Documents et permis à échéance
    const daysLeft = (d: Date) => Math.floor((+startOfDay(d) - +today) / DAY_MS);
    const docRows: Array<{ kind: string; label: string; subject: string; expiryDate: Date; daysLeft: number }> = [];
    for (const d of docs) docRows.push({ kind: d.type, label: DOC_LABEL[d.type] ?? d.type, subject: d.vehicle.internalNumber, expiryDate: d.expiryDate as Date, daysLeft: daysLeft(d.expiryDate as Date) });
    for (const v of vehicles) {
      if (v.registrationType === 'IT' && v.itExpiryDate && daysLeft(v.itExpiryDate) <= DOC_ALERT_DAYS) {
        docRows.push({ kind: 'IT', label: DOC_LABEL.IT, subject: v.internalNumber, expiryDate: v.itExpiryDate, daysLeft: daysLeft(v.itExpiryDate) });
      }
    }
    for (const d of drivers) docRows.push({ kind: 'PERMIS_CHAUFFEUR', label: DOC_LABEL.PERMIS_CHAUFFEUR, subject: `${d.firstName} ${d.lastName}`, expiryDate: d.licenseExpiryDate as Date, daysLeft: daysLeft(d.licenseExpiryDate as Date) });
    docRows.sort((a, b) => a.daysLeft - b.daysLeft);
    const expiredDocs = docRows.filter((d) => d.daysLeft < 0);

    // Entretiens dus : dernier entretien de chaque véhicule/type portant une échéance (date ou kilométrage)
    const allMaint = await this.prisma.maintenance.findMany({
      where: { ...vehicleSite, OR: [{ nextDate: { not: null } }, { nextMileage: { not: null } }] },
      select: { vehicleId: true, maintenanceTypeId: true, maintenanceDate: true, nextDate: true, nextMileage: true, maintenanceType: { select: { label: true } }, vehicle: { select: { internalNumber: true, currentMileage: true } } },
      orderBy: { maintenanceDate: 'desc' },
    });
    const seen = new Set<string>();
    const dueList: any[] = [];
    for (const m of allMaint) {
      const key = `${m.vehicleId}:${m.maintenanceTypeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const byDate = m.nextDate ? daysLeft(m.nextDate) : null;
      const kmLeft = m.nextMileage !== null ? m.nextMileage - m.vehicle.currentMileage : null;
      const overdue = (byDate !== null && byDate < 0) || (kmLeft !== null && kmLeft <= 0);
      const soon = (byDate !== null && byDate <= 15) || (kmLeft !== null && kmLeft <= 500);
      if (overdue || soon) dueList.push({ vehicleId: m.vehicleId, vehicle: m.vehicle.internalNumber, type: m.maintenanceType.label, nextDate: m.nextDate, daysLeft: byDate, kmLeft, overdue });
    }
    dueList.sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
    const overdueMaint = dueList.filter((d) => d.overdue).length;

    // Immobilisations
    const downtimeDays = downtimes.reduce((a, d) => {
      const s = Math.max(+d.startedAt, +p.from);
      const e = Math.min(d.endedAt ? +d.endedAt : +now, +p.to);
      return a + Math.max(0, e - s) / DAY_MS;
    }, 0);
    const openDowntimes = downtimes.filter((d) => !d.endedAt);
    const downtimeByCat = new Map<string, number>();
    for (const d of downtimes) downtimeByCat.set(d.category, (downtimeByCat.get(d.category) ?? 0) + 1);

    // Tendances
    const keys = bucketKeys(p.from, p.to, p.granularity);
    const fuelTrend = new Map<string, { liters: number; cost: number }>();
    for (const f of fuel) {
      const k = bucketKey(f.transactionDate, p.granularity);
      const b = fuelTrend.get(k) ?? { liters: 0, cost: 0 };
      b.liters += num(f.quantityLiters); b.cost += num(f.totalCost);
      fuelTrend.set(k, b);
    }
    const kmTrend = new Map<string, { km: number; trips: number }>();
    for (const t of trips) {
      const k = bucketKey(t.tripDate, p.granularity);
      const b = kmTrend.get(k) ?? { km: 0, trips: 0 };
      b.km += t.distance ?? 0; b.trips += 1;
      kmTrend.set(k, b);
    }
    const inProgress = trips.filter((t) => t.status === 'IN_PROGRESS');
    const lateTrips = inProgress.filter((t) => (t.scheduledArrival ? now.getTime() > +t.scheduledArrival + 15 * 60_000 : now.getTime() - +t.startTime > 24 * 3_600_000));
    const partsTotal = maints.reduce((a, m) => a + num(m.partsCost), 0);
    const laborTotal = maints.reduce((a, m) => a + num(m.laborCost), 0);

    const availStatus: Status = availability === null ? 'ok' : availability < 70 ? 'critical' : availability < 85 ? 'warning' : 'ok';

    return {
      generatedAt: now.toISOString(),
      access: { role: actor.role, scope: 'full', siteId: siteId ?? null },
      period: periodInfo(p),
      kpis: [
        kpi('availability', 'Disponibilité du parc', '%', availability, null, 'up', availStatus, { total: vehicles.length, byStatus }),
        kpi('trips', 'Missions de la période', 'missions', trips.length, prevTrips._count._all, 'up', 'ok', { inProgress: inProgress.length }),
        kpi('distance', 'Kilomètres parcourus', 'km', distance, prevTrips._sum.distance ?? 0, 'neutral'),
        kpi('fuel_cost', 'Coût carburant', 'GNF', gnf(fuelCost), gnf(num(prevFuel._sum.totalCost)), 'down', 'ok', { liters: Math.round(liters * 10) / 10 }),
        kpi('consumption', 'Consommation moyenne', 'L/100 km', consumption, null, 'down', anomalies.length ? 'warning' : 'ok', { anomalies: anomalies.length }),
        kpi('maintenance_cost', 'Coût d’entretien', 'GNF', gnf(maintCost), gnf(prevMaintCost), 'down', 'ok', { preventiveSharePercent: maints.length ? pct(preventive, maints.length) : null }),
        kpi('cost_per_km', 'Coût au kilomètre', 'GNF/km', costPerKm === null ? null : gnf(costPerKm), null, 'down'),
        kpi('maintenance_overdue', 'Entretiens en retard', 'entretiens', overdueMaint, null, 'down', overdueMaint ? 'critical' : 'ok'),
        kpi('documents', 'Documents expirés / à renouveler', 'documents', docRows.length, null, 'down', expiredDocs.length ? 'critical' : docRows.length ? 'warning' : 'ok', { expired: expiredDocs.length }),
        kpi('downtime', 'Jours d’immobilisation', 'jours', Math.round(downtimeDays * 10) / 10, null, 'down', openDowntimes.length ? 'warning' : 'ok', { openDowntimes: openDowntimes.length }),
      ],
      actions: ACTIONS.map((a) => ({ ...a, available: true, allowed: a.roles.includes(actor.role) })),
      worklists: {
        documentsToRenew: docRows.slice(0, 30),
        maintenanceDue: dueList.slice(0, 30),
        consumptionAnomalies: anomalies.slice(0, 20),
        tripsInProgress: inProgress.slice(0, 20).map((t) => ({ tripId: t.id, vehicle: t.vehicle.internalNumber, driver: `${t.driver.firstName} ${t.driver.lastName}`, destination: t.destination, startedAt: t.startTime, scheduledArrival: t.scheduledArrival, late: lateTrips.some((x) => x.id === t.id) })),
        openDowntimes: openDowntimes.map((d) => ({ downtimeId: d.id, vehicle: d.vehicle.internalNumber, category: d.category, reason: d.reason, since: d.startedAt, days: Math.floor((+now - +d.startedAt) / DAY_MS) })),
      },
      charts: {
        fuelTrend: keys.map((k) => ({ period: k, liters: Math.round((fuelTrend.get(k)?.liters ?? 0) * 10) / 10, cost: gnf(fuelTrend.get(k)?.cost ?? 0) })),
        distanceTrend: keys.map((k) => ({ period: k, km: kmTrend.get(k)?.km ?? 0, trips: kmTrend.get(k)?.trips ?? 0 })),
        costBreakdown: [
          { key: 'FUEL', label: 'Carburant', amount: gnf(fuelCost) },
          { key: 'PARTS', label: 'Pièces', amount: gnf(partsTotal) },
          { key: 'LABOR', label: 'Main-d’œuvre', amount: gnf(laborTotal) },
          { key: 'OTHER_MAINTENANCE', label: 'Autres entretiens', amount: gnf(Math.max(0, maintCost - partsTotal - laborTotal)) },
        ],
        consumptionByVehicle: consumptionRows.sort((a, b) => (b.actual ?? 0) - (a.actual ?? 0)).slice(0, 15),
        vehiclesByStatus: Object.keys(byStatus).map((s) => ({ status: s, count: byStatus[s] })),
        downtimeByCategory: [...downtimeByCat.entries()].map(([category, count]) => ({ category, count })),
      },
    };
  }
}
