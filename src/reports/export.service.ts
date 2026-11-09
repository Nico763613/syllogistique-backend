import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ReportsService } from './reports.service';

// Export PDF/Excel des rapports périodiques (§23 du cahier des charges).
// Les tableaux/graphiques restent simples : l'objectif est un document
// professionnel exploitable, pas un moteur de mise en page avancé.
@Injectable()
export class ExportService {
  constructor(private reportsService: ReportsService) {}

  async periodReportExcel(siteId: string, from: string, to: string, orgName = 'SYLLOGISTIQUE'): Promise<Buffer> {
    const report = await this.reportsService.periodReport(siteId, from, to);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SYLLOGISTIQUE';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Rapport');
    sheet.addRow([orgName]);
    sheet.addRow([`Période : ${from} → ${to}`]);
    sheet.addRow([`Généré le : ${new Date().toLocaleString('fr-FR')}`]);
    sheet.addRow([]);

    sheet.addRow(['MISSIONS']);
    sheet.addRow(['Nombre de missions', report.trips.count]);
    sheet.addRow(['Kilomètres parcourus', report.trips.totalKm]);
    sheet.addRow([]);

    sheet.addRow(['CARBURANT']);
    sheet.addRow(['Litres consommés', report.fuel.totalLiters]);
    sheet.addRow(['Coût carburant (GNF)', report.fuel.totalCost]);
    sheet.addRow([]);

    sheet.addRow(['MAINTENANCE']);
    sheet.addRow(['Nombre d\'entretiens', report.maintenance.count]);
    sheet.addRow(['Coût maintenance (GNF)', report.maintenance.totalCost]);
    sheet.addRow(['Véhicule', 'Type', 'Date', 'Coût (GNF)']);
    for (const item of report.maintenance.items) {
      sheet.addRow([item.vehicle, item.type, item.date, item.cost ?? 0]);
    }
    sheet.addRow([]);

    sheet.addRow(['STOCK']);
    sheet.addRow(['Entrées', report.stock.entries]);
    sheet.addRow(['Sorties', report.stock.exits]);

    sheet.getColumn(1).width = 28;
    sheet.getColumn(2).width = 18;

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async periodReportPdf(siteId: string, from: string, to: string, orgName = 'SYLLOGISTIQUE'): Promise<Buffer> {
    const report = await this.reportsService.periodReport(siteId, from, to);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text(orgName, { align: 'left' });
      doc.fontSize(14).text('Rapport logistique', { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#555').text(`Période : ${from} → ${to}`);
      doc.text(`Généré le : ${new Date().toLocaleString('fr-FR')}`);
      doc.moveDown();
      doc.fillColor('#000');

      const section = (title: string, rows: [string, string | number][]) => {
        doc.fontSize(13).text(title, { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10);
        for (const [label, value] of rows) {
          doc.text(`${label} : ${value}`);
        }
        doc.moveDown();
      };

      section('Missions', [
        ['Nombre de missions', report.trips.count],
        ['Kilomètres parcourus', report.trips.totalKm],
      ]);

      section('Carburant', [
        ['Litres consommés', report.fuel.totalLiters],
        ['Coût carburant (GNF)', report.fuel.totalCost],
      ]);

      section('Maintenance', [
        ["Nombre d'entretiens", report.maintenance.count],
        ['Coût total (GNF)', report.maintenance.totalCost],
      ]);
      doc.fontSize(10);
      for (const item of report.maintenance.items) {
        doc.text(`• ${item.vehicle} — ${item.type} — ${new Date(item.date).toLocaleDateString('fr-FR')} — ${item.cost ?? 0} GNF`);
      }
      doc.moveDown();

      section('Stock', [
        ['Entrées', report.stock.entries],
        ['Sorties', report.stock.exits],
      ]);

      doc.end();
    });
  }

  // PDF du rapport journalier (en-tête, indicateurs, détails, émetteur/signataire)
  async dailyReportPdf(
    report: Awaited<ReturnType<ReportsService['dailyReport']>>,
    issuer: { name: string; phone: string; service: string },
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const [y, m, d] = report.date.split('-');
      const n = (v: number) => Math.round(v).toLocaleString('fr-FR');
      const navy = '#163A5F';
      const gold = '#E0A72E';

      doc.rect(0, 0, doc.page.width, 70).fill(navy);
      doc.fillColor('#FFFFFF').fontSize(18).text(report.organization, 50, 20);
      doc.fillColor(gold).fontSize(12).text(`Rapport du jour — ${report.kindLabel}`, 50, 44);
      doc.fillColor('#000000').fontSize(10).text(`${report.site} — ${d}/${m}/${y}`, 50, 85);
      doc.moveDown();

      const title = (t: string) => {
        doc.moveDown(0.6);
        doc.fillColor(navy).fontSize(13).text(t, { underline: true });
        doc.fillColor('#000000').fontSize(10).moveDown(0.2);
      };
      const line = (t: string) => doc.text(t);

      const f = report.fleet;
      title(report.kindLabel);
      line(`${f.available}/${f.total} disponibles — ${f.onMission} en mission — ${f.maintenance} en maintenance — ${f.immobilized} immobilisés`);
      for (const v of report.fleet.unavailable) line(`• ${v.vehicle} (${v.registration}) — ${v.status}`);

      title('Missions');
      line(`${report.trips.count} mission(s) — ${n(report.trips.totalKm)} km`);
      if (report.trips.totalVoyages) line(`Voyages : ${report.trips.totalVoyages}`);
      const hh = (d: Date | null) => (d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '…');
      for (const x of report.trips.list) {
        doc.moveDown(0.3);
        doc.fillColor(navy).text(`${x.plate}${x.plateIT ? ' (plaque IT)' : ''} — ${x.brand || x.vehicle} — ${x.driver}${x.phone ? ' — ' + x.phone : ''}`).fillColor('#000000');
        line(`   Destination : ${x.destination || x.regions.join(', ') || '—'}${x.cargo ? ' — ' + x.cargo : ''}${x.purposeType ? ' — ' + x.purposeType.toLowerCase() : ''}`);
        line(`   Horaires : ${hh(x.startTime)} → ${hh(x.endTime)}${x.voyages ? ' — ' + x.voyages + ' voyage(s)' : ''}`);
        line(`   Compteur : ${n(x.startMileage)} → ${x.endMileage !== null ? n(x.endMileage) : 'en cours'}${x.fuelMileages.length ? ' (plein à ' + x.fuelMileages.map(n).join(', ') + ')' : ''} — ${n(x.km)} km`);
        line(`   Réservoir : ${x.tankStart ?? '?'} L au départ → ${x.tankEnd ?? '?'} L à l'arrivée${x.tankUsed !== null ? ' — ' + x.tankUsed + ' L utilisés' : ''}`);
        line(`   Pleins : ${x.liters} L — ${n(x.fuelCost)} GNF${x.consumption !== null ? ' — ' + x.consumption + ' L/100 km' : ''}`);
        if (x.condition === 'ANOMALIE') line(`   Anomalie avant départ : ${x.anomalies}`);
        if (x.maintenanceNeeded) line(`   Maintenance : OUI — ${x.maintenanceReason}`);
      }

      title('Carburant (pleins)');
      line(`Jour : ${n(report.fuel.liters)} L — ${n(report.fuel.cost)} GNF`);
      line(`Cumul semaine (lundi → vendredi, depuis le ${report.fuel.week.from}) : ${n(report.fuel.week.liters)} L — ${n(report.fuel.week.cost)} GNF`);
      for (const x of report.fuel.byVehicle) line(`• ${x.vehicle} — ${n(x.liters)} L — ${n(x.cost)} GNF`);

      title('Chauffeurs');
      line(`En service : ${report.drivers.onDuty} — Absents / indisponibles : ${report.attendance.absences.length}`);
      for (const a of report.attendance.absences) line(`• ${a.driver} — ${a.status}${a.reason ? ' : ' + a.reason : ''}`);

      doc.moveDown(2);
      doc.fillColor(navy).fontSize(10).text('Établi par', { underline: true });
      doc.fillColor('#000000');
      line(issuer.name);
      if (issuer.service) line(issuer.service);
      if (issuer.phone) line(`Tél. : ${issuer.phone}`);
      doc.fillColor('#555555').text(`Généré le ${new Date().toLocaleString('fr-FR')} — SYLLOGISTIQUE`);

      doc.end();
    });
  }
}
