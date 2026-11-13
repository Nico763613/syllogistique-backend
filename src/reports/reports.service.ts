import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Agrège les données pour le Dashboard global et les rapports périodiques (§19, §22)
@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async dashboard(siteId: string) {
    const [
      totalTrucks,
      availableTrucks,
      onMissionTrucks,
      immobilizedTrucks,
      totalServiceVehicles,
      availableServiceVehicles,
      maintenanceVehicles,
      itemsCount,
      items,
    ] = await Promise.all([
      this.prisma.vehicle.count({ where: { siteId, vehicleType: 'TRUCK', deletedAt: null } }),
      this.prisma.vehicle.count({ where: { siteId, vehicleType: 'TRUCK', status: 'AVAILABLE', deletedAt: null } }),
      this.prisma.vehicle.count({ where: { siteId, vehicleType: 'TRUCK', status: 'ON_MISSION', deletedAt: null } }),
      this.prisma.vehicle.count({ where: { siteId, vehicleType: 'TRUCK', status: 'IMMOBILIZED', deletedAt: null } }),
      this.prisma.vehicle.count({ where: { siteId, vehicleType: 'SERVICE_VEHICLE', deletedAt: null } }),
      this.prisma.vehicle.count({ where: { siteId, vehicleType: 'SERVICE_VEHICLE', status: 'AVAILABLE', deletedAt: null } }),
      this.prisma.vehicle.count({ where: { siteId, status: 'MAINTENANCE', deletedAt: null } }),
      this.prisma.inventoryItem.count({ where: { siteId } }),
      this.prisma.inventoryItem.findMany({ where: { siteId } }),
    ]);

    const stockValue = items.reduce((s, i) => s + Number(i.currentQuantity) * Number(i.unitPrice ?? 0), 0);
    const belowMinimum = items.filter((i) => Number(i.currentQuantity) < Number(i.minimumQuantity)).length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const [tripsToday, fuelToday] = await Promise.all([
      this.prisma.trip.findMany({ where: { siteId, tripDate: { gte: today, lt: tomorrow } } }),
      this.prisma.fuelTransaction.findMany({ where: { siteId, transactionDate: { gte: today, lt: tomorrow } } }),
    ]);

    return {
      fleet: {
        trucks: { total: totalTrucks, available: availableTrucks, onMission: onMissionTrucks, immobilized: immobilizedTrucks },
        serviceVehicles: { total: totalServiceVehicles, available: availableServiceVehicles },
        inMaintenance: maintenanceVehicles,
      },
      stock: { itemsCount, stockValue, belowMinimum },
      today: {
        trips: tripsToday.length,
        kilometers: tripsToday.reduce((s, t) => s + (t.distance ?? 0), 0),
        fuelLiters: fuelToday.reduce((s, f) => s + Number(f.quantityLiters), 0),
        fuelCost: fuelToday.reduce((s, f) => s + Number(f.totalCost), 0),
      },
    };
  }

  async periodReport(siteId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const [trips, fuel, maintenance, movements] = await Promise.all([
      this.prisma.trip.findMany({ where: { siteId, tripDate: { gte: fromDate, lte: toDate } } }),
      this.prisma.fuelTransaction.findMany({ where: { siteId, transactionDate: { gte: fromDate, lte: toDate } } }),
      this.prisma.maintenance.findMany({
        where: { vehicle: { siteId }, maintenanceDate: { gte: fromDate, lte: toDate } },
        include: { maintenanceType: true, vehicle: { select: { internalNumber: true } } },
      }),
      this.prisma.stockMovement.findMany({ where: { siteId, createdAt: { gte: fromDate, lte: toDate } } }),
    ]);

    return {
      period: { from, to },
      trips: { count: trips.length, totalKm: trips.reduce((s, t) => s + (t.distance ?? 0), 0) },
      fuel: {
        totalLiters: fuel.reduce((s, f) => s + Number(f.quantityLiters), 0),
        totalCost: fuel.reduce((s, f) => s + Number(f.totalCost), 0),
      },
      maintenance: {
        count: maintenance.length,
        totalCost: maintenance.reduce((s, m) => s + Number(m.cost ?? 0), 0),
        items: maintenance.map((m) => ({
          vehicle: m.vehicle.internalNumber,
          type: m.maintenanceType.label,
          date: m.maintenanceDate,
          cost: m.cost,
        })),
      },
      stock: {
        entries: movements.filter((m) => m.movementType === 'IN').length,
        exits: movements.filter((m) => m.movementType === 'OUT').length,
      },
    };
  }

  // ------------------------------------------------------------------
  // Rapport JOURNALIER (§22) : flotte, missions, carburant (jour + cumul lundi→vendredi),
  // stock, pointage — avec partage WhatsApp ou PDF.
  // ------------------------------------------------------------------

  private dayBounds(date: string) {
    const start = new Date(`${date}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(start.getTime())) {
      throw new BadRequestException('Date invalide (format AAAA-MM-JJ).');
    }
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  // Semaine de travail (lundi → vendredi) contenant la date : [lundi 00:00, samedi 00:00[
  private workWeek(start: Date) {
    const monday = new Date(start);
    monday.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const saturday = new Date(monday);
    saturday.setUTCDate(monday.getUTCDate() + 5);
    return { monday, saturday };
  }

  async dailyReport(siteId: string, date?: string, kind: 'SERVICE_VEHICLE' | 'TRUCK' = 'SERVICE_VEHICLE') {
    if (!siteId) throw new BadRequestException('Le site (siteId) est obligatoire.');
    const day = date || new Date().toISOString().slice(0, 10);
    const { start, end } = this.dayBounds(day);
    const { monday, saturday } = this.workWeek(start);
    const weekEnd = end < saturday ? end : saturday;

    const [site, vehicles, trips, fuel, weekFuel, attendance] = await Promise.all([
      this.prisma.site.findUnique({ where: { id: siteId }, include: { organization: { select: { name: true } } } }),
      this.prisma.vehicle.findMany({ where: { siteId, deletedAt: null, vehicleType: kind } }),
      this.prisma.trip.findMany({
        where: { siteId, tripDate: { gte: start, lt: end }, vehicle: { vehicleType: kind } },
        include: {
          vehicle: { select: { internalNumber: true, registrationNumber: true, brand: true, model: true, vehicleType: true, referenceConsumption: true, registrationType: true, itExpiryDate: true } },
          driver: { select: { firstName: true, lastName: true, licenseNumber: true, phone: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.fuelTransaction.findMany({
        where: { siteId, transactionDate: { gte: start, lt: end }, vehicle: { vehicleType: kind } },
        include: { vehicle: { select: { internalNumber: true, registrationNumber: true } } },
        orderBy: { transactionDate: 'asc' },
      }),
      this.prisma.fuelTransaction.findMany({ where: { siteId, transactionDate: { gte: monday, lt: weekEnd }, vehicle: { vehicleType: kind } } }),
      this.prisma.driverAttendance.findMany({
        where: { siteId, date: { gte: start, lt: end } },
        include: { driver: { select: { firstName: true, lastName: true, licenseNumber: true } } },
      }),
    ]);
    if (!site) throw new NotFoundException('Site introuvable.');

    const count = (status?: string) => vehicles.filter((v) => !status || v.status === status).length;
    const sum = (arr: any[], f: (x: any) => number) => arr.reduce((s, x) => s + f(x), 0);

    // Consommation du jour par véhicule
    const byVehicle = new Map<string, { vehicle: string; liters: number; cost: number }>();
    for (const f of fuel) {
      const key = f.vehicle.internalNumber;
      const row = byVehicle.get(key) ?? { vehicle: key, liters: 0, cost: 0 };
      row.liters += Number(f.quantityLiters);
      row.cost += Number(f.totalCost);
      byVehicle.set(key, row);
    }

    const attendanceCount: Record<string, number> = {};
    for (const a of attendance) attendanceCount[a.status] = (attendanceCount[a.status] ?? 0) + 1;

    return {
      date: day,
      organization: site.organization?.name ?? 'SYLLOGISTIQUE',
      site: site.name,
      kind,
      kindLabel: kind === 'TRUCK' ? 'Camions' : 'Véhicules de service',
      fleet: {
        total: count(),
        available: count('AVAILABLE'),
        onMission: count('ON_MISSION'),
        maintenance: count('MAINTENANCE'),
        immobilized: count('IMMOBILIZED') + count('OUT_OF_SERVICE'),
        unavailable: vehicles
          .filter((v) => ['MAINTENANCE', 'IMMOBILIZED', 'OUT_OF_SERVICE'].includes(v.status))
          .map((v) => ({ vehicle: v.internalNumber, registration: v.registrationNumber, status: v.status })),
      },
      trips: {
        count: trips.length,
        totalKm: sum(trips, (t) => t.distance ?? 0),
        totalVoyages: sum(trips, (t) => t.tripsCount ?? 0),
        totalTons: Math.round(sum(trips, (t) => (t.tripsCount && t.tonnagePerTrip ? t.tripsCount * t.tonnagePerTrip : 0)) * 10) / 10,
        list: trips.map((t) => {
          // Carburant rattaché à la mission (sinon, ravitaillements du même véhicule le même jour)
          const tf = fuel.filter((f) => (f.tripId ? f.tripId === t.id : f.vehicleId === t.vehicleId));
          const liters = sum(tf, (f) => Number(f.quantityLiters));
          const km = t.distance ?? 0;
          const ref = t.vehicle.referenceConsumption ? Number(t.vehicle.referenceConsumption) : null;
          // Réservoir : niveau déclaré au départ et à l'arrivée ; carburant utilisé = départ + pleins − arrivée
          const tankStart = t.startFuelLiters ?? null;
          const tankEnd = t.endFuelLiters ?? null;
          const tankUsed = tankStart !== null && tankEnd !== null && tankStart + liters - tankEnd >= 0 ? Math.round((tankStart + liters - tankEnd) * 10) / 10 : null;
          const usedLiters = tankUsed !== null && tankUsed > 0 ? tankUsed : liters;
          const consumption = km >= 20 && usedLiters > 0 ? Math.round((usedLiters / km) * 1000) / 10 : null;
          return {
            vehicle: t.vehicle.internalNumber,
            plate: t.vehicle.registrationNumber,
            plateIT: t.vehicle.registrationType === 'IT',
            brand: [t.vehicle.brand, t.vehicle.model].filter(Boolean).join(' '),
            kind: t.vehicle.vehicleType === 'TRUCK' ? 'TRUCK' : 'SERVICE_VEHICLE',
            driver: `${t.driver.firstName} ${t.driver.lastName}${t.driver.licenseNumber ? ' (permis ' + t.driver.licenseNumber + ')' : ''}`,
            phone: t.driver.phone ?? '',
            purposeType: t.purposeType ?? '',
            destination: t.destination ?? '',
            regions: t.regions,
            cargo: t.cargo ?? '',
            voyages: t.tripsCount,
            operationSites: t.operationSites, products: t.products, loadPlaces: t.loadPlaces, unloadPlaces: t.unloadPlaces,
            pauseMileage: t.pauseMileage, pauseAt: t.pauseAt, tonnagePerTrip: t.tonnagePerTrip,
            tons: t.tripsCount && t.tonnagePerTrip ? Math.round(t.tripsCount * t.tonnagePerTrip * 10) / 10 : null,
            startTime: t.startTime,
            endTime: t.endTime,
            startMileage: t.startMileage,
            endMileage: t.endMileage,
            fuelMileages: tf.map((f) => f.mileage),
            km,
            liters: Math.round(liters * 100) / 100,
            tankStart,
            tankEnd,
            tankUsed,
            fuelCost: sum(tf, (f) => Number(f.totalCost)),
            consumption,
            referenceConsumption: ref,
            condition: t.preCondition ?? 'RAS',
            anomalies: t.preAnomalies ?? '',
            maintenanceNeeded: t.maintenanceNeeded === true,
            maintenanceReason: t.maintenanceReason ?? '',
            closed: t.endMileage !== null,
          };
        }),
      },
      fuel: {
        liters: sum(fuel, (f) => Number(f.quantityLiters)),
        cost: sum(fuel, (f) => Number(f.totalCost)),
        byVehicle: [...byVehicle.values()],
        entries: fuel.map((f) => ({ vehicle: f.vehicle.internalNumber, plate: f.vehicle.registrationNumber, time: f.transactionDate, mileage: f.mileage, liters: Number(f.quantityLiters), cost: Number(f.totalCost), station: f.station ?? '' })),
        week: {
          from: monday.toISOString().slice(0, 10),
          liters: sum(weekFuel, (f) => Number(f.quantityLiters)),
          cost: sum(weekFuel, (f) => Number(f.totalCost)),
        },
      },
      drivers: { onDuty: new Set(trips.map((t) => t.driverId)).size },
      attendance: {
        counts: attendanceCount,
        absences: attendance
          .filter((a) => a.status !== 'PRESENT')
          .map((a) => ({
            driver: `${a.driver.firstName} ${a.driver.lastName}${a.driver.licenseNumber ? ' (permis ' + a.driver.licenseNumber + ')' : ''}`,
            status: a.status,
            reason: a.absenceReason ?? '',
          })),
      },
    };
  }

  // Émetteur du document : nom, téléphone et fonction de l'agent connecté (traçabilité)
  async issuer(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    const labels: Record<string, string> = {
      SUPER_ADMIN: 'Administrateur Général',
      ADMIN_LOGISTIQUE: 'Administrateur Logistique',
      GESTIONNAIRE_FLOTTE: 'Gestionnaire de flotte',
      MAGASINIER: 'Magasinier',
      CHAUFFEUR: 'Chauffeur',
      LECTEUR: 'Superviseur',
      DIRECTEUR_GENERAL: 'Directeur Général',
      MECANICIEN: 'Mécanicien',
      POINTEUR: 'Pointeur',
      COMPTABLE: 'Comptabilité',
    };
    return {
      name: user ? `${user.firstName} ${user.lastName}` : '—',
      phone: user?.phone ?? '',
      service: user ? labels[user.role.name] ?? user.role.name : '',
    };
  }

  // Texte du rapport (corps de l'e-mail envoyé à la hiérarchie)
  dailyReportText(r: Awaited<ReturnType<ReportsService['dailyReport']>>, issuer: { name: string; phone: string; service: string }) {
    const [y, m, d] = r.date.split('-');
    const n = (v: number) => Math.round(v).toLocaleString('fr-FR');
    const f = r.fleet;
    const hh = (x: Date | null) => (x ? new Date(x).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '…');
    const lines = [
      `${r.organization} — Rapport du jour : ${r.kindLabel.toLowerCase()}`,
      `${r.site} — ${d}/${m}/${y}`,
      '',
      `${r.kindLabel} : ${f.available}/${f.total} disponibles, ${f.onMission} en mission, ${f.maintenance + f.immobilized} indisponibles`,
      `Missions : ${r.trips.count} — ${n(r.trips.totalKm)} km${r.trips.totalVoyages ? ` — ${r.trips.totalVoyages} mouvement(s)` : ''}${r.trips.totalTons ? ` — ${r.trips.totalTons} t` : ''}`,
      `Carburant (pleins) : ${n(r.fuel.liters)} L — ${n(r.fuel.cost)} GNF`,
      `Cumul semaine (lun→ven) : ${n(r.fuel.week.liters)} L — ${n(r.fuel.week.cost)} GNF`,
      `Chauffeurs en service : ${r.drivers.onDuty}`,
    ];
    if (r.trips.list.length) lines.push('');
    for (const x of r.trips.list) {
      const tank = x.tankStart !== null || x.tankEnd !== null ? `, réservoir ${x.tankStart ?? '?'} → ${x.tankEnd ?? '?'} L` : '';
      lines.push(`- ${x.plate}${x.plateIT ? ' (IT)' : ''} ${x.driver.split(' (')[0]} : ${x.destination || x.regions.join(', ') || '—'}${x.cargo ? ' (' + x.cargo + ')' : ''}, ${hh(x.startTime)}→${hh(x.endTime)}, ${n(x.km)} km, pleins ${x.liters} L${x.liters ? ' / ' + n(x.fuelCost) + ' GNF' : ''}${tank}${x.maintenanceNeeded ? ' — maintenance à prévoir : ' + x.maintenanceReason : ''}`);
    }
    if (r.attendance.absences.length) {
      lines.push('', `Absents / indisponibles : ${r.attendance.absences.length}`);
      for (const a of r.attendance.absences) lines.push(`- ${a.driver} (${a.status}${a.reason ? ' : ' + a.reason : ''})`);
    }
    if (r.fleet.unavailable.length) {
      lines.push('', 'Véhicules indisponibles : ' + r.fleet.unavailable.map((v) => `${v.vehicle} (${v.status})`).join(', '));
    }
    lines.push('', `Établi par : ${issuer.name}${issuer.service ? ' — ' + issuer.service : ''}${issuer.phone ? ' — ' + issuer.phone : ''}`);
    return lines.join('\n');
  }

  // Rapport global des missions : par camion ou véhicule, sur une période (à relire et signer par le responsable logistique)
  async missionsReport(siteId: string, from: string, to: string, kind?: string, vehicleId?: string) {
    if (!siteId) throw new BadRequestException('Le site (siteId) est obligatoire.');
    const start = this.dayBounds(from || new Date().toISOString().slice(0, 10)).start;
    const end = this.dayBounds(to || from || new Date().toISOString().slice(0, 10)).end;
    const k = kind === 'TRUCK' || kind === 'SERVICE_VEHICLE' ? kind : undefined;
    const [site, trips] = await Promise.all([
      this.prisma.site.findUnique({ where: { id: siteId }, include: { organization: true } }),
      this.prisma.trip.findMany({
        where: { siteId, status: { not: 'CANCELLED' }, startTime: { gte: start, lt: end }, ...(vehicleId ? { vehicleId } : {}), ...(k ? { vehicle: { vehicleType: k } } : {}) },
        include: { driver: { select: { firstName: true, lastName: true } }, vehicle: { select: { internalNumber: true, registrationNumber: true, vehicleType: true } } },
        orderBy: { startTime: 'asc' },
      }),
    ]);
    if (!site) throw new NotFoundException('Site introuvable.');
    const fuel = trips.length ? await this.prisma.fuelTransaction.findMany({ where: { vehicleId: { in: [...new Set(trips.map((t) => t.vehicleId))] }, transactionDate: { gte: start, lt: end } } }) : [];
    const byV = new Map<string, any>();
    for (const t of trips) {
      const key = t.vehicleId;
      const row = byV.get(key) ?? { vehicle: t.vehicle.internalNumber, plate: t.vehicle.registrationNumber, kind: t.vehicle.vehicleType === 'TRUCK' ? 'TRUCK' : 'SERVICE_VEHICLE', missions: 0, km: 0, movements: 0, tons: 0, liters: 0, cost: 0 };
      row.missions++; row.km += t.distance ?? 0; row.movements += t.tripsCount ?? 0; row.tons += t.tripsCount && t.tonnagePerTrip ? t.tripsCount * t.tonnagePerTrip : 0;
      byV.set(key, row);
    }
    for (const f of fuel) { const row = byV.get(f.vehicleId); if (row) { row.liters += Number(f.quantityLiters); row.cost += Number(f.totalCost); } }
    const vehicles = [...byV.values()].map((r) => ({ ...r, tons: Math.round(r.tons * 10) / 10, liters: Math.round(r.liters * 10) / 10 }));
    const sum = (f: (x: any) => number) => vehicles.reduce((s, x) => s + f(x), 0);
    return {
      organization: site.organization?.name ?? 'SYLLOGISTIQUE', site: site.name, from: start.toISOString().slice(0, 10), to: new Date(+end - 1).toISOString().slice(0, 10),
      kind: k ?? 'ALL', kindLabel: k === 'TRUCK' ? 'Camions' : k === 'SERVICE_VEHICLE' ? 'Véhicules de service' : 'Camions et véhicules de service',
      totals: { missions: trips.length, km: sum((x) => x.km), movements: sum((x) => x.movements), tons: Math.round(sum((x) => x.tons) * 10) / 10, liters: Math.round(sum((x) => x.liters) * 10) / 10, cost: sum((x) => x.cost) },
      vehicles,
      trips: trips.map((t) => ({ reference: t.reference ?? '', date: t.startTime, vehicle: t.vehicle.registrationNumber, driver: `${t.driver.firstName} ${t.driver.lastName}`, destination: t.destination ?? (t.operationSites || []).join(', '), cargo: t.cargo ?? '', km: t.distance ?? 0, movements: t.tripsCount ?? 0, tons: t.tripsCount && t.tonnagePerTrip ? Math.round(t.tripsCount * t.tonnagePerTrip * 10) / 10 : 0 })),
    };
  }

  // E-mails de la comptabilité (paramètre REPORT_ACCOUNTING_EMAILS)
  async accountingEmails(organizationId: string) {
    const st = await this.prisma.setting.findUnique({ where: { organizationId_key: { organizationId, key: 'REPORT_ACCOUNTING_EMAILS' } } });
    return st?.value ?? '';
  }

  // E-mails habituels de la hiérarchie (paramètre REPORT_EMAIL_RECIPIENTS)
  async hierarchyEmails(organizationId: string) {
    const st = await this.prisma.setting.findUnique({ where: { organizationId_key: { organizationId, key: 'REPORT_EMAIL_RECIPIENTS' } } });
    return st?.value ?? '';
  }
}
