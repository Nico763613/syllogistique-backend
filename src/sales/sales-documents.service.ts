import { currentOrganizationId } from '../common/tenant-scope';
import { readUpload } from '../uploads/file-links';
import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { readFile } from 'fs/promises';
import { join, basename } from 'path';
import { PrismaService } from '../prisma.service';

// Génère la facture client en PDF — prête à être envoyée par email/WhatsApp
// ou imprimée pour signature/tampon manuscrit.
@Injectable()
export class SalesDocumentsService {
  constructor(private prisma: PrismaService) {}

  // Logo de l'entreprise (envoyé : fichier du serveur ou adresse web). Échec = facture sans logo, jamais d'erreur.
  private async loadLogo(url?: string | null): Promise<Buffer | null> {
    if (!url) return null;
    try {
      if (url.startsWith('data:image/')) return Buffer.from(url.split(',')[1] || '', 'base64');
      if (url.includes('/uploads/')) return await readUpload(this.prisma, url);
      if (/^https?:\/\//i.test(url)) {
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
      }
    } catch { /* logo indisponible */ }
    return null;
  }

  async invoicePdf(invoiceId: string, orgName = 'SYL LOGISTIQUE'): Promise<Buffer> {
    const orgId = currentOrganizationId();
    const org = await this.prisma.organization.findFirst({ where: orgId ? { id: orgId } : undefined, orderBy: { createdAt: 'asc' }, select: { name: true, logoUrl: true } });
    // Sans logo propre au client : logo SYL LOGISTIQUE par défaut
    const logo = (await this.loadLogo(org?.logoUrl)) ?? (await readFile(join(__dirname, '..', '..', 'public', 'logo-syl.png')).catch(() => null));
    if (org?.name) orgName = org.name;
    const invoice = await this.prisma.salesInvoice.findUnique({
      where: { id: invoiceId },
      include: { customer: true, salesOrder: { include: { lines: { include: { item: true } } } } },
    });
    if (!invoice) throw new NotFoundException('Facture introuvable.');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let drewLogo = false;
      if (logo) {
        try {
          doc.image(logo, 50, 45, { fit: [90, 60] });
          doc.fontSize(18).fillColor('#163A5F').text(orgName, 155, 60);
          doc.x = 50; doc.y = Math.max(doc.y, 115);
          drewLogo = true;
        } catch { /* format d'image non pris en charge (ex. SVG) : on continue sans logo */ }
      }
      if (!drewLogo) doc.fontSize(18).fillColor('#163A5F').text(orgName, { align: 'left' });
      doc.fontSize(12).fillColor('#000').text('FACTURE', { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#555')
        .text(`N° ${invoice.reference}`)
        .text(`Date : ${invoice.invoiceDate.toLocaleDateString('fr-FR')}`)
        .text(`Échéance : ${invoice.dueDate ? invoice.dueDate.toLocaleDateString('fr-FR') : '—'}`)
        .text(`Condition : ${invoice.paymentTerm === 'CASH' ? 'Comptant' : 'Crédit'}`);
      doc.moveDown();

      doc.fillColor('#000').fontSize(11).text('Client :', { continued: false });
      doc.fontSize(10).text(invoice.customer.name);
      if (invoice.customer.phone) doc.text(invoice.customer.phone);
      if (invoice.customer.address) doc.text(invoice.customer.address);
      doc.moveDown();

      // Tableau des lignes
      const lines = invoice.salesOrder?.lines ?? [];
      doc.fontSize(10).fillColor('#163A5F');
      doc.text('Article', 50, doc.y, { continued: true, width: 220 });
      doc.text('Qté', 280, doc.y, { continued: true, width: 60 });
      doc.text('PU (GNF)', 350, doc.y, { continued: true, width: 90 });
      doc.text('Total (GNF)', 450, doc.y);
      doc.moveDown(0.3);
      doc.fillColor('#000');
      for (const l of lines) {
        doc.text(l.item.name, 50, doc.y, { continued: true, width: 220 });
        doc.text(String(l.quantityOrdered), 280, doc.y, { continued: true, width: 60 });
        doc.text(Number(l.unitPrice).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' '), 350, doc.y, { continued: true, width: 90 });
        doc.text(Number(l.lineTotal).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' '), 450, doc.y);
      }
      if (!lines.length && invoice.description) doc.text(invoice.description, 50, doc.y, { width: 500 });
      doc.moveDown();

      doc.fontSize(10);
      doc.text(`Sous-total : ${Number(invoice.subtotal).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} GNF`, { align: 'right' });
      doc.text(`Remise : ${Number(invoice.discountAmount).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} GNF`, { align: 'right' });
      doc.text(`Taxe : ${Number(invoice.taxAmount).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} GNF`, { align: 'right' });
      doc.fontSize(12).fillColor('#163A5F').text(`TOTAL : ${Number(invoice.totalAmount).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} GNF`, { align: 'right' });
      doc.fontSize(10).fillColor('#000').text(`Déjà payé : ${Number(invoice.amountPaid).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} GNF`, { align: 'right' });
      doc.text(`Reste à payer : ${(Number(invoice.totalAmount) - Number(invoice.amountPaid)).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} GNF`, { align: 'right' });

      // Zone signature / tampon
      doc.moveDown(3);
      const y = doc.y;
      doc.fontSize(9).fillColor('#6B7A8F');
      doc.text('Signature / Tampon', 50, y);
      doc.rect(50, y + 14, 200, 70).strokeColor('#D9D9D9').stroke();
      doc.text('Client', 350, y);
      doc.rect(350, y + 14, 200, 70).strokeColor('#D9D9D9').stroke();

      doc.end();
    });
  }
}
