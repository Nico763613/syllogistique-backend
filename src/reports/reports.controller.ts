import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { MessagingService } from '../messaging/messaging.service';

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
