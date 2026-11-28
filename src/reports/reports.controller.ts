import { BadRequestException, Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { MessagingService } from '../messaging/messaging.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// Vérifie la période demandée (dates AAAA-MM-JJ, début avant fin) avant tout calcul.
function checkPeriod(from: string, to: string) {
  const ok = (v: string) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(new Date(v).getTime());
  if (!ok(from) || !ok(to)) throw new BadRequestException('Indiquez une période valide : date de début et date de fin (AAAA-MM-JJ).');
  if (new Date(from).getTime() > new Date(to).getTime()) throw new BadRequestException('La date de début doit précéder la date de fin.');
}


@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(RolesGuard)
// Rapports : réservés au personnel de bureau (ni chauffeurs, ni mécaniciens, ni pointeurs, ni caissiers).
@Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.RESPONSABLE_OPERATIONS, RoleName.COMPTABLE, RoleName.DIRECTEUR_GENERAL, RoleName.LECTEUR, RoleName.MAGASINIER)
@Controller('reports')
export class ReportsController {
  constructor(
    private reportsService: ReportsService,
    private exportService: ExportService,
    private messaging: MessagingService,
  ) {}

  @Get('dashboard')
  dashboard(@Query('siteId') siteId: string) {
    return this.reportsService.dashboard(siteId);
  }

  // Rapport du jour (véhicules de service par défaut ; ?kind=TRUCK pour les camions) — date AAAA-MM-JJ (aujourd'hui par défaut)
  @Get('daily')
  async daily(@Query('siteId') siteId: string, @Query('date') date: string, @Query('kind') kind: string, @CurrentUser() actor: any) {
    const report = await this.reportsService.dailyReport(siteId, date, kind === 'TRUCK' ? 'TRUCK' : 'SERVICE_VEHICLE');
    const issuer = await this.reportsService.issuer(actor.userId);
    return { report, issuer, text: this.reportsService.dailyReportText(report, issuer) };
  }

  @Get('missions/pdf')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  async missionsPdf(@Query() q: Record<string, string>, @Res() res: Response) {
    const report = await this.reportsService.missionsReport(q.siteId, q.from, q.to, q.kind, q.vehicleId);
    const buffer = await this.exportService.missionsReportPdf(report, { name: (q.name || '').slice(0, 60), firstNames: (q.firstNames || '').slice(0, 80), phone: (q.phone || '').slice(0, 30), title: (q.title || '').slice(0, 60) });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="rapport_missions_${report.from}_${report.to}.pdf"` });
    res.send(buffer);
  }

  @Post('missions/send-email')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  async missionsEmail(@Body() b: Record<string, string>, @CurrentUser() actor: any) {
    let to = String(b.to ?? '').trim() || (b.audience === 'ACCOUNTING' ? await this.reportsService.accountingEmails(actor.organizationId) : await this.reportsService.hierarchyEmails(actor.organizationId));
    const recipients = to.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    if (recipients.length === 0 || recipients.length > 10 || !recipients.every((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) throw new BadRequestException('Adresse(s) e-mail invalide(s) (10 maximum, séparées par des virgules).');
    const report = await this.reportsService.missionsReport(b.siteId, b.from, b.to, b.kind, b.vehicleId);
    const signer = { name: (b.name || '').slice(0, 60), firstNames: (b.firstNames || '').slice(0, 80), phone: (b.phone || '').slice(0, 30), title: (b.title || '').slice(0, 60) };
    const buffer = await this.exportService.missionsReportPdf(report, signer);
    const result = await this.messaging.sendEmailWithAttachment({
      to: recipients.join(', '),
      subject: `${report.organization} — Rapport des missions (${report.kindLabel.toLowerCase()}) du ${report.from} au ${report.to}`,
      text: `Bonjour,\n\nVeuillez trouver ci-joint le rapport global des missions (${report.kindLabel.toLowerCase()}) du ${report.from} au ${report.to} : ${report.totals.missions} mission(s), ${report.totals.km} km.\n\nCordialement,\n${signer.name} ${signer.firstNames}${signer.phone ? '\nTél. : ' + signer.phone : ''}`,
      filename: `rapport_missions_${report.from}_${report.to}.pdf`,
      buffer,
      contentType: 'application/pdf',
    });
    return { ...result, recipients };
  }

  @Get('daily/export/pdf')
  async dailyPdf(
    @Query('siteId') siteId: string,
    @Query('date') date: string,
    @Query('kind') kind: string,
    @CurrentUser() actor: any,
    @Res() res: Response,
  ) {
    const report = await this.reportsService.dailyReport(siteId, date, kind === 'TRUCK' ? 'TRUCK' : 'SERVICE_VEHICLE');
    const issuer = await this.reportsService.issuer(actor.userId);
    const buffer = await this.exportService.dailyReportPdf(report, issuer);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="rapport_du_jour_${report.date}.pdf"`,
    });
    res.send(buffer);
  }

  // Envoi du rapport journalier (PDF en pièce jointe) par e-mail à un ou plusieurs destinataires.
  // Nécessite SMTP_HOST (voir .env) : sans SMTP l'envoi est simulé et la réponse l'indique (simulated: true).
  @Post('daily/send-email')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  async dailyEmail(
    @Body('to') to: string,
    @Body('siteId') siteId: string,
    @Body('date') date: string,
    @Body('kind') kind: string,
    @Body('audience') audience: string,
    @CurrentUser() actor: any,
  ) {
    if (!String(to ?? '').trim()) {
      // Sans adresse saisie : e-mails habituels de la hiérarchie (REPORT_EMAIL_RECIPIENTS) ou de la comptabilité (REPORT_ACCOUNTING_EMAILS)
      to = audience === 'ACCOUNTING' ? await this.reportsService.accountingEmails(actor.organizationId) : await this.reportsService.hierarchyEmails(actor.organizationId);
    }
    const recipients = String(to ?? '')
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (recipients.length === 0 || recipients.length > 10 || !recipients.every((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) {
      throw new BadRequestException('Adresse(s) e-mail invalide(s) (10 maximum, séparées par des virgules).');
    }
    const report = await this.reportsService.dailyReport(siteId, date, kind === 'TRUCK' ? 'TRUCK' : 'SERVICE_VEHICLE');
    const issuer = await this.reportsService.issuer(actor.userId);
    const buffer = await this.exportService.dailyReportPdf(report, issuer);
    const result = await this.messaging.sendEmailWithAttachment({
      to: recipients.join(', '),
      subject: `${report.organization} — Rapport du jour (${report.kindLabel.toLowerCase()}) du ${report.date} — ${report.site}`,
      text: `Bonjour,\n\nVeuillez trouver ci-joint le rapport du jour (${report.kindLabel.toLowerCase()}) du ${report.date}.\n\n${this.reportsService.dailyReportText(report, issuer)}\n\nCordialement,\n${issuer.name}`,
      filename: `rapport_du_jour_${report.date}.pdf`,
      buffer,
      contentType: 'application/pdf',
    });
    return { ...result, recipients };
  }

  // Récapitulatif kilométrage + carburant par véhicule et par semaine (?kind=TRUCK|SERVICE_VEHICLE)
  @Get('fleet-recap')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.LECTEUR, RoleName.RESPONSABLE_OPERATIONS)
  fleetRecap(@Query('siteId') siteId: string, @Query('kind') kind: string, @Query('from') from: string, @Query('to') to: string, @CurrentUser() actor: any) {
    return this.reportsService.fleetRecap(siteId || actor.siteId, kind, from, to);
  }

  @Get('period')
  periodReport(@Query('siteId') siteId: string, @Query('from') from: string, @Query('to') to: string) {
    checkPeriod(from, to);
    return this.reportsService.periodReport(siteId, from, to);
  }

  @Get('period/export/excel')
  async exportExcel(
    @Query('siteId') siteId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    checkPeriod(from, to);
    const buffer = await this.exportService.periodReportExcel(siteId, from, to);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="rapport_${from}_${to}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('period/export/pdf')
  async exportPdf(
    @Query('siteId') siteId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    checkPeriod(from, to);
    const buffer = await this.exportService.periodReportPdf(siteId, from, to);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="rapport_${from}_${to}.pdf"`,
    });
    res.send(buffer);
  }

  // Envoie le rapport de la période (PDF) par email — pratique pour le rapport hebdomadaire/mensuel
  @Post('period/send-email')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  async sendReportEmail(
    @Body('to') to: string,
    @Body('siteId') siteId: string,
    @Body('from') from: string,
    @Body('to_date') to_date: string,
  ) {
    const list = String(to ?? '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    if (!list.length || list.length > 10 || list.some((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) {
      throw new BadRequestException('Adresse(s) e-mail invalide(s) (10 destinataires au maximum).');
    }
    checkPeriod(from, to_date);
    const buffer = await this.exportService.periodReportPdf(siteId, from, to_date);
    return this.messaging.sendEmailWithAttachment({
      to,
      subject: `Rapport SYL LOGISTIQUE — ${from} au ${to_date}`,
      text: `Bonjour,\n\nVeuillez trouver ci-joint le rapport logistique de la période du ${from} au ${to_date}.\n\nCordialement,\nSYL LOGISTIQUE`,
      filename: `rapport_${from}_${to_date}.pdf`,
      buffer,
      contentType: 'application/pdf',
    });
  }

  // Lien WhatsApp pré-rempli pour partager le rapport (le PDF téléchargé est à joindre manuellement)
  @Get('period/whatsapp-link')
  whatsappLink(@Query('phone') phone: string, @Query('from') from: string, @Query('to') to: string) {
    checkPeriod(from, to);
    if (!phone || String(phone).replace(/[^\d]/g, '').length < 8) throw new BadRequestException('Indiquez un numéro WhatsApp valide.');
    const message = `Rapport SYL LOGISTIQUE — période du ${from} au ${to}. Voir le PDF joint.`;
    return { link: this.messaging.buildWhatsAppLink(phone, message) };
  }
}
