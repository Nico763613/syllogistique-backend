import PDFDocument = require('pdfkit');

export const NAVY = '#163A5F';
export const GOLD = '#E0A72E';
export const fmtN = (v: number) => Math.round(Number(v) || 0).toLocaleString('fr-FR');

export interface Issuer { name: string; phone: string; service: string }

// Document A4 avec bandeau d'en-tête (organisation + titre) : socle commun des documents imprimables
export function startDoc(orgName: string, title: string) {
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.rect(0, 0, doc.page.width, 70).fill(NAVY);
  doc.fillColor('#FFFFFF').fontSize(18).text(orgName || 'SYLLOGISTIQUE', 50, 20);
  doc.fillColor(GOLD).fontSize(12).text(title, 50, 44);
  doc.fillColor('#000000').fontSize(10);
  doc.y = 85;
  return { doc, done };
}

export function keyValues(doc: PDFKit.PDFDocument, rows: Array<[string, string]>) {
  for (const [k, v] of rows) {
    doc.fillColor(NAVY).text(k + ' : ', { continued: true }).fillColor('#000000').text(v || '—');
  }
}

// Bloc signatures : « Établi par » (automatique) + « Reçu / approuvé par » (à signer)
export function signatures(doc: PDFKit.PDFDocument, issuer: Issuer, rightLabel: string) {
  const y = Math.min(doc.y + 30, 680);
  doc.fillColor(NAVY).text('Établi par', 50, y, { underline: true });
  doc.fillColor('#000000').text(issuer.name, 50, y + 14);
  if (issuer.service) doc.text(issuer.service);
  if (issuer.phone) doc.text('Tél. : ' + issuer.phone);
  doc.fillColor(NAVY).text(rightLabel, 330, y, { underline: true });
  doc.fillColor('#555555').fontSize(8).text(`Généré le ${new Date().toLocaleString('fr-FR')} — SYLLOGISTIQUE`, 50, 780);
}
