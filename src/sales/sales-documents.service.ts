import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma.service';

// Génère la facture client en PDF — prête à être envoyée par email/WhatsApp
// ou imprimée pour signature/tampon manuscrit.
@Injectable()
export class SalesDocumentsService {
  constructor(private prisma: PrismaService) {}

  async invoicePdf(invoiceId: string, orgName = 'SYLLOGISTIQUE'): Promise<Buffer> {
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

      doc.fontSize(18).fillColor('#163A5F').text(orgName, { align: 'left' });
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
        doc.text(Number(l.unitPrice).toLocaleString('fr-FR'), 350, doc.y, { continued: true, width: 90 });
        doc.text(Number(l.lineTotal).toLocaleString('fr-FR'), 450, doc.y);
      }
      doc.moveDown();

      doc.fontSize(10);
      doc.text(`Sous-total : ${Number(invoice.subtotal).toLocaleString('fr-FR')} GNF`, { align: 'right' });
      doc.text(`Remise : ${Number(invoice.discountAmount).toLocaleString('fr-FR')} GNF`, { align: 'right' });
      doc.text(`Taxe : ${Number(invoice.taxAmount).toLocaleString('fr-FR')} GNF`, { align: 'right' });
      doc.fontSize(12).fillColor('#163A5F').text(`TOTAL : ${Number(invoice.totalAmount).toLocaleString('fr-FR')} GNF`, { align: 'right' });
      doc.fontSize(10).fillColor('#000').text(`Déjà payé : ${Number(invoice.amountPaid).toLocaleString('fr-FR')} GNF`, { align: 'right' });
      doc.text(`Reste à payer : ${(Number(invoice.totalAmount) - Number(invoice.amountPaid)).toLocaleString('fr-FR')} GNF`, { align: 'right' });

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
