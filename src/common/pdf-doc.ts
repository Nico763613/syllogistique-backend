import { readUpload } from '../uploads/file-links';
import { currentOrganizationId } from './tenant-scope';
import PDFDocument = require('pdfkit');
import { readFile } from 'fs/promises';
import { join, basename } from 'path';

export const NAVY = '#163A5F';
export const GOLD = '#E0A72E';
export const fmtN = (v: number) => Math.round(Number(v) || 0).toLocaleString('fr-FR');

export interface Issuer { name: string; phone: string; service: string }

// Document A4 avec bandeau d'en-tête (organisation + titre) : socle commun des documents imprimables
// Logo de l'entreprise cliente (fichier envoyé, image intégrée ou adresse web). Indisponible = document sans logo, jamais d'erreur.
// L'entreprise est celle de l'utilisateur connecté (jamais la première entreprise de la plateforme).
export async function orgLogo(prisma: { organization: { findFirst: (a: any) => Promise<{ logoUrl?: string | null } | null> } }): Promise<Buffer | null> {
  try {
    const orgId = currentOrganizationId();
    const org = await prisma.organization.findFirst({ where: orgId ? { id: orgId } : undefined, orderBy: { createdAt: 'asc' }, select: { logoUrl: true } });
    const url = org?.logoUrl;
    if (!url) return null;
    if (url.startsWith('data:image/')) return Buffer.from(url.split(',')[1] || '', 'base64');
    if (url.includes('/uploads/')) return await readUpload(prisma, url);
    if (/^https?:\/\//i.test(url)) {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    }
  } catch { /* logo indisponible */ }
  return null;
}

export function startDoc(orgName: string, title: string, logo?: Buffer | null) {
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.rect(0, 0, doc.page.width, 70).fill(NAVY);
  let textX = 50;
  if (logo) {
    try {
      doc.roundedRect(50, 10, 66, 50, 4).fill('#FFFFFF');
      doc.image(logo, 54, 13, { fit: [58, 44], align: 'center', valign: 'center' });
      textX = 128;
    } catch { /* format non pris en charge (ex. SVG) : en-tête sans logo */ }
  }
  doc.fillColor('#FFFFFF').fontSize(18).text(orgName || 'SYL LOGISTIQUE', textX, 20);
  doc.fillColor(GOLD).fontSize(12).text(title, textX, 44);
  // Petite signature discrète de l'éditeur (le logo mis en avant est celui de l'entreprise cliente)
  doc.fillColor('#B7C7E6').fontSize(7.5).text('by SYL LOGISTIQUE', doc.page.width - 170, 56, { width: 120, align: 'right', lineBreak: false });
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
  doc.fillColor('#555555').fontSize(8).text(`Généré le ${new Date().toLocaleString('fr-FR')} — SYL LOGISTIQUE`, 50, 780);
}
