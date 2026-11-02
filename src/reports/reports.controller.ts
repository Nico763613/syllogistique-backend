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

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(RolesGuard)
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

  // Rapport journalier (JSON + texte WhatsApp) — date au format AAAA-MM-JJ (aujourd'hui par défaut)
  @Get('daily')
  async daily(@Query('siteId') siteId: string, @Query('date') date: string, @CurrentUser() actor: any) {
    const report = await this.reportsService.dailyReport(siteId, date);
    const issuer = await this.reportsService.issuer(actor.userId);
    return { report, issuer, whatsappText: this.reportsService.dailyReportText(report, issuer) };
  }

  @Get('daily/export/pdf')
  async dailyPdf(
    @Query('siteId') siteId: string,
    @Query('date') date: string,
    @CurrentUser() actor: any,
    @Res() res: Response,
  ) {
    const report = await this.reportsService.dailyReport(siteId, date);
    const issuer = await this.reportsService.issuer(actor.userId);
    const buffer = await this.exportService.dailyReportPdf(report, issuer);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="rapport_journalier_${report.date}.pdf"`,
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
    @CurrentUser() actor: any,
  ) {
    const recipients = String(to ?? '')
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (recipients.length === 0 || recipients.length > 10 || !recipients.every((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) {
      throw new BadRequestException('Adresse(s) e-mail invalide(s) (10 maximum, séparées par des virgules).');
    }
    const report = await this.reportsService.dailyReport(siteId, date);
    const issuer = await this.reportsService.issuer(actor.userId);
    const buffer = await this.exportService.dailyReportPdf(report, issuer);
    const result = await this.messaging.sendEmailWithAttachment({
      to: recipients.join(', '),
      subject: `${report.organization} — Rapport journalier du ${report.date} (${report.site})`,
      text: `Bonjour,\n\nVeuillez trouver ci-joint le rapport journalier du ${report.date}.\n\n${this.reportsService.dailyReportText(report, issuer)}\n\nCordialement,\n${issuer.name}`,
      filename: `rapport_journalier_${report.date}.pdf`,
      buffer,
      contentType: 'application/pdf',
    });
    return { ...result, recipients };
  }

  // Liens WhatsApp (hiérarchie : paramètre REPORT_WHATSAPP_NUMBERS) avec le texte du rapport
  @Get('daily/whatsapp')
  async dailyWhatsapp(@Query('siteId') siteId: string, @Query('date') date: string, @CurrentUser() actor: any) {
    const report = await this.reportsService.dailyReport(siteId, date);
    const issuer = await this.reportsService.issuer(actor.userId);
    const text = this.reportsService.dailyReportText(report, issuer);
    return { text, links: await this.reportsService.whatsappLinks(actor.organizationId, text) };
  }

  @Get('period')
  periodReport(@Query('siteId') siteId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reportsService.periodReport(siteId, from, to);
  }

  @Get('period/export/excel')
  async exportExcel(
    @Query('siteId') siteId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
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
    const buffer = await this.exportService.periodReportPdf(siteId, from, to_date);
    return this.messaging.sendEmailWithAttachment({
      to,
      subject: `Rapport SYLLOGISTIQUE — ${from} au ${to_date}`,
      text: `Bonjour,\n\nVeuillez trouver ci-joint le rapport logistique de la période du ${from} au ${to_date}.\n\nCordialement,\nSYLLOGISTIQUE`,
      filename: `rapport_${from}_${to_date}.pdf`,
      buffer,
      contentType: 'application/pdf',
    });
  }

  // Lien WhatsApp pré-rempli pour partager le rapport (le PDF téléchargé est à joindre manuellement)
  @Get('period/whatsapp-link')
  whatsappLink(@Query('phone') phone: string, @Query('from') from: string, @Query('to') to: string) {
    const message = `Rapport SYLLOGISTIQUE — période du ${from} au ${to}. Voir le PDF joint.`;
    return { link: this.messaging.buildWhatsAppLink(phone, message) };
  }
}
