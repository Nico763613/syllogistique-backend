import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { RoleName } from '@prisma/client';
import { SalesService } from './sales.service';
import { SalesDocumentsService } from './sales-documents.service';
import { CreateSalesOrderDto, DeliverSalesOrderDto, CreateSalesInvoiceDto } from './dto/sale.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessagingService } from '../messaging/messaging.service';

@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('sales')
export class SalesController {
  constructor(
    private salesService: SalesService,
    private salesDocuments: SalesDocumentsService,
    private messaging: MessagingService,
  ) {}

  @Post('orders')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  createOrder(@Body() dto: CreateSalesOrderDto, @CurrentUser() actor: any) {
    return this.salesService.createOrder(dto, actor.userId);
  }

  @Get('orders')
  findAllOrders(@Query('siteId') siteId?: string, @Query('status') status?: string) {
    return this.salesService.findAllOrders({ siteId, status });
  }

  @Get('orders/:id')
  findOrder(@Param('id') id: string) {
    return this.salesService.findOrder(id);
  }

  @Post('orders/:id/confirm')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  confirm(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.salesService.confirm(id, actor.userId);
  }

  @Post('orders/:id/deliver')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  deliver(@Param('id') id: string, @Body() dto: DeliverSalesOrderDto, @CurrentUser() actor: any) {
    return this.salesService.deliver(id, dto, actor.userId);
  }

  @Post('orders/:id/invoice')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  createInvoice(@Param('id') id: string, @Body() dto: CreateSalesInvoiceDto, @CurrentUser() actor: any) {
    return this.salesService.createInvoiceFromOrder(id, dto, actor.userId);
  }

  @Get('invoices')
  findAllInvoices(@Query('siteId') siteId?: string, @Query('status') status?: string) {
    return this.salesService.findAllInvoices({ siteId, status });
  }

  @Get('invoices/:id')
  findInvoice(@Param('id') id: string) {
    return this.salesService.findInvoice(id);
  }

  // PDF prêt pour email / WhatsApp / impression + signature-tampon manuscrite
  @Get('invoices/:id/pdf')
  async invoicePdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.salesDocuments.invoicePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="facture.pdf"`,
    });
    res.send(buffer);
  }

  // Envoie la facture PDF par email (SMTP à configurer dans .env — sinon envoi simulé/loggé)
  @Post('invoices/:id/send-email')
  async sendInvoiceEmail(@Param('id') id: string, @Body('to') to: string) {
    const invoice = await this.salesService.findInvoice(id);
    const buffer = await this.salesDocuments.invoicePdf(id);
    return this.messaging.sendEmailWithAttachment({
      to,
      subject: `Facture ${invoice.reference} — SYLLOGISTIQUE`,
      text: `Bonjour,\n\nVeuillez trouver ci-joint la facture ${invoice.reference} d'un montant de ${Number(invoice.totalAmount).toLocaleString('fr-FR')} GNF.\n\nCordialement,\nSYLLOGISTIQUE`,
      filename: `facture_${invoice.reference}.pdf`,
      buffer,
      contentType: 'application/pdf',
    });
  }

  // Lien WhatsApp pré-rempli (à ouvrir depuis le téléphone — le PDF téléchargé est à joindre manuellement)
  @Get('invoices/:id/whatsapp-link')
  async whatsappLink(@Param('id') id: string, @Query('phone') phone: string) {
    const invoice = await this.salesService.findInvoice(id);
    const message = `Bonjour ${invoice.customer.name}, voici votre facture ${invoice.reference} d'un montant de ${Number(invoice.totalAmount).toLocaleString('fr-FR')} GNF. — SYLLOGISTIQUE`;
    return { link: this.messaging.buildWhatsAppLink(phone, message) };
  }
}
