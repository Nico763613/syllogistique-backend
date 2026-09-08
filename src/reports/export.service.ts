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
}
