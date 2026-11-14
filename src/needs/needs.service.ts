import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { MessagingService } from '../messaging/messaging.service';
import { getIssuer } from '../common/issuer';
import { startDoc, keyValues, signatures, NAVY, GOLD, fmtN } from '../common/pdf-doc';
import { CreateNeedDto, NeedLineDto, SendNeedEmailDto, SetNeedStatusDto, UpdateNeedDto } from './dto/need.dto';

const STATUS_LABEL: Record<string, string> = {
  BROUILLON: 'Brouillon', ENVOYE: 'Envoyé', APPROUVE: 'Approuvé', REJETE: 'Rejeté', SATISFAIT: 'Satisfait',
};

// État des besoins : demande formelle à la hiérarchie. Le Super Admin peut tout corriger à tout moment ;
// les autres rôles uniquement tant que l'état est en brouillon.
@Injectable()
export class NeedsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private inventory: InventoryService,
    private messaging: MessagingService,
  ) {}

  private async nextReference() {
    const year = new Date().getFullYear();
    const count = await this.prisma.needRequest.count({ where: { reference: { startsWith: `EB-${year}-` } } });
    return `EB-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private lineData(l: NeedLineDto) {
    return {
      itemId: l.itemId, vehicleId: l.vehicleId, designation: l.designation.trim(), quantity: l.quantity,
      unit: l.unit, estimatedUnitPrice: l.estimatedUnitPrice, note: l.note,
    };
  }

  // Proposition automatique : articles en rupture / sous le seuil / à moins de 7 jours de couverture
  async suggestions(siteId: string) {
    const rows = await this.inventory.analysis(siteId, 30);
    return rows
      .filter((r) => r.suggestedQuantity > 0)
      .map((r) => ({
        itemId: r.itemId,
        designation: `${r.sku} — ${r.name}`,
        quantity: r.suggestedQuantity,
        unit: r.unit,
        estimatedUnitPrice: r.unitPrice || undefined,
        note: r.state === 'RUPTURE' ? 'Rupture de stock' : r.state === 'SOUS_SEUIL' ? 'Sous le seuil minimum' : `Couverture : ${r.coverageDays} j`,
      }));
  }

  async create(dto: CreateNeedDto, actorId: string) {
    const reference = await this.nextReference();
    const need = await this.prisma.needRequest.create({
      data: {
        siteId: dto.siteId, reference, title: dto.title.trim(), priority: dto.priority ?? 'NORMALE',
        recipient: dto.recipient, justification: dto.justification, createdById: actorId,
        lines: { create: dto.lines.map((l) => this.lineData(l)) },
      },
      include: { lines: true },
    });
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'NeedRequest', entityId: need.id, newValue: { reference, titre: need.title, lignes: dto.lines.length } });
    return need;
  }

  async list(siteId: string, status?: string) {
    if (!siteId) throw new BadRequestException('Le site (siteId) est obligatoire.');
    const rows = await this.prisma.needRequest.findMany({
      where: { siteId, ...(status ? { status } : {}) },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((n) => ({ ...n, total: this.total(n.lines) }));
  }

  async findOne(id: string) {
    const need = await this.prisma.needRequest.findUnique({ where: { id }, include: { lines: true } });
    if (!need) throw new NotFoundException('État des besoins introuvable.');
    return { ...need, total: this.total(need.lines) };
  }

  private total(lines: Array<{ quantity: unknown; estimatedUnitPrice: unknown }>) {
    return lines.reduce((s, l) => s + Number(l.quantity) * Number(l.estimatedUnitPrice ?? 0), 0);
  }

  async update(id: string, dto: UpdateNeedDto, actor: { userId: string; role: string }) {
    const need = await this.prisma.needRequest.findUnique({ where: { id } });
    if (!need) throw new NotFoundException('État des besoins introuvable.');
    if (need.status !== 'BROUILLON' && actor.role !== 'SUPER_ADMIN') {
      throw new BadRequestException('Cet état a déjà été envoyé : seul le Super Administrateur peut le modifier.');
    }
    const { lines, ...fields } = dto;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.needRequestLine.deleteMany({ where: { requestId: id } });
        await tx.needRequestLine.createMany({ data: lines.map((l) => ({ ...this.lineData(l), requestId: id })) });
      }
      return tx.needRequest.update({ where: { id }, data: fields, include: { lines: true } });
    });
    await this.audit.log({
      userId: actor.userId, action: 'UPDATE', entity: 'NeedRequest', entityId: id,
      oldValue: { titre: need.title, statut: need.status }, newValue: { ...fields, lignes: lines?.length },
    });
    return updated;
  }

  async setStatus(id: string, dto: SetNeedStatusDto, actorId: string) {
    const need = await this.prisma.needRequest.findUnique({ where: { id } });
    if (!need) throw new NotFoundException('État des besoins introuvable.');
    if ((dto.status === 'REJETE') && !(dto.note && dto.note.trim().length >= 3)) {
      throw new BadRequestException('Un motif est obligatoire pour un rejet.');
    }
    const updated = await this.prisma.needRequest.update({
      where: { id }, data: { status: dto.status, ...(dto.note ? { decisionNote: dto.note.trim() } : {}) },
    });
    await this.audit.log({
      userId: actorId, action: 'UPDATE', entity: 'NeedRequest', entityId: id,
      oldValue: { statut: need.status }, newValue: { statut: dto.status }, reason: dto.note?.trim(),
    });
    return updated;
  }

  async pdf(id: string, userId: string): Promise<Buffer> {
    const need = await this.prisma.needRequest.findUnique({ where: { id }, include: { lines: true } });
    if (!need) throw new NotFoundException('État des besoins introuvable.');
    const site = await this.prisma.site.findUnique({ where: { id: need.siteId }, include: { organization: true } });
    const issuer = await getIssuer(this.prisma, userId);
    const vehicleIds = need.lines.map((l) => l.vehicleId).filter((v): v is string => !!v);
    const vehicles = vehicleIds.length
      ? await this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, internalNumber: true } })
      : [];
    const vname = new Map(vehicles.map((v) => [v.id, v.internalNumber]));

    const { doc, done } = startDoc(site?.organization?.name ?? 'SYL LOGISTIQUE', 'ÉTAT DES BESOINS');
    keyValues(doc, [
      ['N°', need.reference],
      ['Date', new Date(need.createdAt).toLocaleDateString('fr-FR')],
      ['Site', site?.name ?? ''],
      ['Objet', need.title],
      ['Priorité', need.priority === 'URGENTE' ? 'URGENTE' : 'Normale'],
      ['À l\'attention de', need.recipient ?? ''],
      ['État', STATUS_LABEL[need.status] ?? need.status],
    ]);
    if (need.justification) { doc.moveDown(0.5); keyValues(doc, [['Justification', need.justification]]); }
    doc.moveDown();

    const x = [50, 80, 300, 360, 430, 490];
    let y = doc.y;
    doc.fillColor(NAVY).fontSize(9);
    ['N°', 'Désignation', 'Qté', 'Unité', 'P.U. est.', 'Total est.'].forEach((h, i) => doc.text(h, x[i], y));
    y += 16;
    doc.moveTo(50, y - 2).lineTo(545, y - 2).strokeColor(GOLD).stroke();
    doc.fillColor('#000000');
    let total = 0;
    need.lines.forEach((l, idx) => {
      if (y > 700) { doc.addPage(); y = 50; }
      const lt = Number(l.quantity) * Number(l.estimatedUnitPrice ?? 0);
      total += lt;
      const label = l.designation + (l.vehicleId && vname.get(l.vehicleId) ? ` (véh. ${vname.get(l.vehicleId)})` : '') + (l.note ? ` — ${l.note}` : '');
      const h = doc.heightOfString(label, { width: 215 });
      doc.text(String(idx + 1), x[0], y);
      doc.text(label, x[1], y, { width: 215 });
      doc.text(fmtN(Number(l.quantity)), x[2], y, { width: 55 });
      doc.text(l.unit ?? '', x[3], y, { width: 65 });
      doc.text(l.estimatedUnitPrice ? fmtN(Number(l.estimatedUnitPrice)) : '', x[4], y, { width: 55 });
      doc.text(lt ? fmtN(lt) : '', x[5], y, { width: 55 });
      y += Math.max(18, h + 6);
    });
    doc.moveTo(50, y).lineTo(545, y).strokeColor(GOLD).stroke();
    if (total) doc.fillColor(NAVY).fontSize(11).text(`Total estimé : ${fmtN(total)} GNF`, 50, y + 8, { align: 'right', width: 495 });
    doc.fillColor('#000000').fontSize(10);
    doc.y = y + 34;
    signatures(doc, issuer, 'Visa / décision de la hiérarchie');
    doc.end();
    return done;
  }

  async text(id: string, userId: string) {
    const need = await this.findOne(id);
    const issuer = await getIssuer(this.prisma, userId);
    const lines = need.lines.map((l, i) => `${i + 1}. ${l.designation} — ${fmtN(Number(l.quantity))} ${l.unit ?? ''}${l.note ? ' (' + l.note + ')' : ''}`);
    return [
      `*ÉTAT DES BESOINS ${need.reference}*${need.priority === 'URGENTE' ? ' — URGENT' : ''}`,
      `Objet : ${need.title}`,
      need.justification ? `Justification : ${need.justification}` : '',
      '',
      ...lines,
      need.total ? `\nTotal estimé : ${fmtN(need.total)} GNF` : '',
      `\nÉtabli par ${issuer.name}${issuer.service ? ' — ' + issuer.service : ''}${issuer.phone ? ' — ' + issuer.phone : ''}`,
    ].filter((x) => x !== '').join('\n');
  }

  async whatsapp(id: string, actor: { userId: string; organizationId: string }) {
    const text = await this.text(id, actor.userId);
    const setting = await this.prisma.setting.findUnique({
      where: { organizationId_key: { organizationId: actor.organizationId, key: 'REPORT_WHATSAPP_NUMBERS' } },
    });
    const numbers = (setting?.value ?? '').split(',').map((x) => x.replace(/\D/g, '')).filter((x) => x.length >= 8);
    const enc = encodeURIComponent(text);
    return {
      text,
      links: numbers.length ? numbers.map((n) => ({ number: n, url: `https://wa.me/${n}?text=${enc}` })) : [{ number: '', url: `https://wa.me/?text=${enc}` }],
    };
  }

  // Adresses habituelles du circuit : Achats (NEEDS_PURCHASING_EMAILS) puis comptabilité (NEEDS_ACCOUNTING_EMAILS, à défaut REPORT_ACCOUNTING_EMAILS)
  private async stageEmails(siteId: string, stage: 'PURCHASING' | 'ACCOUNTING') {
    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { organizationId: true } });
    if (!site) return '';
    const keys = stage === 'PURCHASING' ? ['NEEDS_PURCHASING_EMAILS'] : ['NEEDS_ACCOUNTING_EMAILS', 'REPORT_ACCOUNTING_EMAILS'];
    for (const key of keys) {
      const st = await this.prisma.setting.findUnique({ where: { organizationId_key: { organizationId: site.organizationId, key } } });
      if (st?.value?.trim()) return st.value;
    }
    return '';
  }

  async email(id: string, dto: SendNeedEmailDto, userId: string) {
    const stage = dto.stage ?? 'PURCHASING';
    const current = await this.findOne(id);
    if (stage === 'ACCOUNTING' && ['BROUILLON', 'REJETE'].includes(current.status)) {
      throw new BadRequestException("Envoyez d'abord l'état des besoins aux Achats : la comptabilité le reçoit ensuite.");
    }
    const to = dto.to && dto.to.trim() ? dto.to : await this.stageEmails(current.siteId, stage);
    if (!to.trim()) throw new BadRequestException(`Aucune adresse e-mail pour ${stage === 'PURCHASING' ? 'les Achats' : 'la comptabilité'} : saisissez-la ou enregistrez-la dans les destinataires.`);
    const recipients = to.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    if (recipients.length === 0 || recipients.length > 10 || !recipients.every((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) {
      throw new BadRequestException('Adresse(s) e-mail invalide(s) (10 maximum, séparées par des virgules).');
    }
    const need = await this.findOne(id);
    const buffer = await this.pdf(id, userId);
    const text = await this.text(id, userId);
    const result = await this.messaging.sendEmailWithAttachment({
      to: recipients.join(', '),
      subject: `État des besoins ${need.reference} — ${need.title}${stage === 'ACCOUNTING' ? ' (pour la comptabilité)' : ''}`,
      text: `Bonjour,\n\nVeuillez trouver ci-joint l'état des besoins ${need.reference}${stage === 'ACCOUNTING' ? ', transmis pour la comptabilité après traitement par les Achats' : ''}.\n\n${text}\n\nCordialement.`,
      filename: `etat_des_besoins_${need.reference}.pdf`,
      buffer,
      contentType: 'application/pdf',
    });
    // Un envoi réel passe l'état en « Envoyé » (un brouillon n'est jamais marqué envoyé sans envoi)
    if (result.sent && stage === 'PURCHASING' && need.status === 'BROUILLON') await this.prisma.needRequest.update({ where: { id }, data: { status: 'ENVOYE' } });
    if (result.sent && stage === 'ACCOUNTING') await this.prisma.needRequest.update({ where: { id }, data: { status: 'TRANSMIS_COMPTA' } });
    return { ...result, recipients };
  }
}
