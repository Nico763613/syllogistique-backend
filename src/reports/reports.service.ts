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

  async dailyReport(siteId: string, date?: string) {
    if (!siteId) throw new BadRequestException('Le site (siteId) est obligatoire.');
    const day = date || new Date().toISOString().slice(0, 10);
    const { start, end } = this.dayBounds(day);
    const { monday, saturday } = this.workWeek(start);
    const weekEnd = end < saturday ? end : saturday;

    const [site, vehicles, trips, fuel, weekFuel, movements, items, attendance] = await Promise.all([
      this.prisma.site.findUnique({ where: { id: siteId }, include: { organization: { select: { name: true } } } }),
      this.prisma.vehicle.findMany({ where: { siteId, deletedAt: null } }),
      this.prisma.trip.findMany({
        where: { siteId, tripDate: { gte: start, lt: end } },
        include: {
          vehicle: { select: { internalNumber: true, registrationNumber: true, brand: true, model: true, vehicleType: true, referenceConsumption: true } },
          driver: { select: { firstName: true, lastName: true, licenseNumber: true, phone: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.fuelTransaction.findMany({
        where: { siteId, transactionDate: { gte: start, lt: end } },
        include: { vehicle: { select: { internalNumber: true, registrationNumber: true } } },
        orderBy: { transactionDate: 'asc' },
      }),
      this.prisma.fuelTransaction.findMany({ where: { siteId, transactionDate: { gte: monday, lt: weekEnd } } }),
      this.prisma.stockMovement.findMany({
        where: { siteId, createdAt: { gte: start, lt: end } },
        include: { item: { select: { name: true, unit: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.inventoryItem.findMany({ where: { siteId } }),
      this.prisma.driverAttendance.findMany({
        where: { siteId, date: { gte: start, lt: end } },
        include: { driver: { select: { firstName: true, lastName: true, licenseNumber: true } } },
      }),
    ]);
    if (!site) throw new NotFoundException('Site introuvable.');

    const count = (type: string, status?: string) =>
      vehicles.filter((v) => v.vehicleType === type && (!status || v.status === status)).length;
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
      fleet: {
        trucks: {
          total: count('TRUCK'),
          available: count('TRUCK', 'AVAILABLE'),
          onMission: count('TRUCK', 'ON_MISSION'),
          maintenance: count('TRUCK', 'MAINTENANCE'),
          immobilized: count('TRUCK', 'IMMOBILIZED') + count('TRUCK', 'OUT_OF_SERVICE'),
        },
        serviceVehicles: {
          total: count('SERVICE_VEHICLE'),
          available: count('SERVICE_VEHICLE', 'AVAILABLE'),
          onMission: count('SERVICE_VEHICLE', 'ON_MISSION'),
          maintenance: count('SERVICE_VEHICLE', 'MAINTENANCE'),
          immobilized: count('SERVICE_VEHICLE', 'IMMOBILIZED') + count('SERVICE_VEHICLE', 'OUT_OF_SERVICE'),
        },
        unavailable: vehicles
          .filter((v) => ['MAINTENANCE', 'IMMOBILIZED', 'OUT_OF_SERVICE'].includes(v.status))
          .map((v) => ({ vehicle: v.internalNumber, registration: v.registrationNumber, status: v.status })),
      },
      trips: {
        count: trips.length,
        totalKm: sum(trips, (t) => t.distance ?? 0),
        totalVoyages: sum(trips, (t) => t.tripsCount ?? 0),
        list: trips.map((t) => {
          // Carburant rattaché à la mission (sinon, ravitaillements du même véhicule le même jour)
          const tf = fuel.filter((f) => (f.tripId ? f.tripId === t.id : f.vehicleId === t.vehicleId));
          const liters = sum(tf, (f) => Number(f.quantityLiters));
          const km = t.distance ?? 0;
          const ref = t.vehicle.referenceConsumption ? Number(t.vehicle.referenceConsumption) : null;
          const consumption = km >= 20 && liters > 0 ? Math.round((liters / km) * 1000) / 10 : null;
          return {
            vehicle: t.vehicle.internalNumber,
            plate: t.vehicle.registrationNumber,
            brand: [t.vehicle.brand, t.vehicle.model].filter(Boolean).join(' '),
            kind: t.vehicle.vehicleType === 'TRUCK' ? 'TRUCK' : 'SERVICE_VEHICLE',
            driver: `${t.driver.firstName} ${t.driver.lastName}${t.driver.licenseNumber ? ' (permis ' + t.driver.licenseNumber + ')' : ''}`,
            phone: t.driver.phone ?? '',
            purposeType: t.purposeType ?? '',
            destination: t.destination ?? '',
            regions: t.regions,
            cargo: t.cargo ?? '',
            voyages: t.tripsCount,
            startTime: t.startTime,
            endTime: t.endTime,
            startMileage: t.startMileage,
            endMileage: t.endMileage,
            fuelMileages: tf.map((f) => f.mileage),
            km,
            liters: Math.round(liters * 100) / 100,
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
      stock: {
        entries: movements.filter((m) => m.movementType === 'IN').length,
        exits: movements.filter((m) => m.movementType === 'OUT').length,
        movements: movements.map((m) => ({
          type: m.movementType,
          item: m.item.name,
          quantity: Number(m.quantity),
          unit: m.item.unit,
          reason: m.reason ?? '',
        })),
        belowMinimum: items
          .filter((i) => Number(i.currentQuantity) < Number(i.minimumQuantity))
          .map((i) => ({ item: i.name, quantity: Number(i.currentQuantity), minimum: Number(i.minimumQuantity), unit: i.unit })),
      },
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
      LECTEUR: 'Lecteur / Superviseur',
    };
    return {
      name: user ? `${user.firstName} ${user.lastName}` : '—',
      phone: user?.phone ?? '',
      service: user ? labels[user.role.name] ?? user.role.name : '',
    };
  }

  // Texte prêt à coller/partager sur WhatsApp
  dailyReportText(r: Awaited<ReturnType<ReportsService['dailyReport']>>, issuer: { name: string; phone: string; service: string }) {
    const [y, m, d] = r.date.split('-');
    const n = (v: number) => Math.round(v).toLocaleString('fr-FR');
    const t = r.fleet.trucks;
    const sv = r.fleet.serviceVehicles;
    const lines = [
      `*${r.organization} — Rapport journalier*`,
      `${r.site} • ${d}/${m}/${y}`,
      '',
      `🚛 *Camions* : ${t.available}/${t.total} disponibles, ${t.onMission} en mission, ${t.maintenance} en maintenance, ${t.immobilized} immobilisés`,
      `🚙 *Véhicules de service* : ${sv.available}/${sv.total} disponibles, ${sv.onMission} en mission, ${sv.maintenance + sv.immobilized} indisponibles`,
      `🛣️ *Missions* : ${r.trips.count} — ${n(r.trips.totalKm)} km${r.trips.totalVoyages ? ` — ${r.trips.totalVoyages} voyage(s)` : ''}`,
      `⛽ *Carburant* : ${n(r.fuel.liters)} L — ${n(r.fuel.cost)} GNF`,
      `   Cumul semaine (lun→ven) : ${n(r.fuel.week.liters)} L — ${n(r.fuel.week.cost)} GNF`,
      `📦 *Stock* : ${r.stock.entries} entrée(s), ${r.stock.exits} sortie(s), ${r.stock.belowMinimum.length} article(s) sous le seuil`,
    ];
    for (const x of r.trips.list) {
      const hh = (d: Date | null) => (d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '…');
      lines.push(`   - ${x.plate} ${x.driver.split(' (')[0]} : ${x.destination || x.regions.join(', ') || '—'}${x.cargo ? ' (' + x.cargo + ')' : ''}, ${hh(x.startTime)}→${hh(x.endTime)}, ${n(x.km)} km, ${x.liters} L${x.liters ? ' / ' + n(x.fuelCost) + ' GNF' : ''}${x.voyages ? ', ' + x.voyages + ' voyages' : ''}${x.maintenanceNeeded ? ' ⚠ maintenance : ' + x.maintenanceReason : ''}`);
    }
    const present = r.attendance.counts['PRESENT'] ?? 0;
    lines.push(`👥 *Chauffeurs* : ${present} présent(s), ${r.attendance.absences.length} absent(s)/indisponible(s)`);
    for (const a of r.attendance.absences) lines.push(`   - ${a.driver} (${a.status}${a.reason ? ' : ' + a.reason : ''})`);
    if (r.fleet.unavailable.length) {
      lines.push('', '⚠️ *Indisponibles* : ' + r.fleet.unavailable.map((v) => `${v.vehicle} (${v.status})`).join(', '));
    }
    lines.push('', `Établi par : ${issuer.name}${issuer.service ? ' — ' + issuer.service : ''}${issuer.phone ? ' — ' + issuer.phone : ''}`);
    return lines.join('\n');
  }

  // Liens WhatsApp vers la hiérarchie : numéros dans le paramètre REPORT_WHATSAPP_NUMBERS
  // (séparés par des virgules, format international). Sans numéro, WhatsApp laisse choisir le contact.
  async whatsappLinks(organizationId: string, text: string) {
    const setting = await this.prisma.setting.findUnique({
      where: { organizationId_key: { organizationId, key: 'REPORT_WHATSAPP_NUMBERS' } },
    });
    const numbers = (setting?.value ?? '')
      .split(',')
      .map((x) => x.replace(/\D/g, ''))
      .filter((x) => x.length >= 8);
    const encoded = encodeURIComponent(text);
    return numbers.length
      ? numbers.map((num) => ({ number: num, url: `https://wa.me/${num}?text=${encoded}` }))
      : [{ number: '', url: `https://wa.me/?text=${encoded}` }];
  }
}
