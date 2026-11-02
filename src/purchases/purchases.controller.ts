import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto, CreatePurchaseInvoiceDto, CreateReorderDraftsDto, CancelPurchaseOrderDto } from './dto/purchase.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('purchases')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('STOCK')
@Controller('purchases')
export class PurchasesController {
  constructor(private purchasesService: PurchasesService) {}

  // Articles à commander (par fournisseur) d'après seuils et consommation
  @Get('reorder')
  reorder(@Query('siteId') siteId: string, @Query('days') days?: string) {
    return this.purchasesService.reorderSuggestions(siteId, days ? Number(days) : 30);
  }

  @Post('reorder/create-drafts')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  createDrafts(@Body() dto: CreateReorderDraftsDto, @CurrentUser() actor: any) {
    return this.purchasesService.createDraftOrders(dto, actor.userId);
  }

  @Post('orders/:id/confirm')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  confirm(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.purchasesService.confirmOrder(id, actor.userId);
  }

  @Post('orders/:id/cancel')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  cancel(@Param('id') id: string, @Body() dto: CancelPurchaseOrderDto, @CurrentUser() actor: any) {
    return this.purchasesService.cancelOrder(id, dto, actor.userId);
  }

  @Get('orders/:id/pdf')
  async pdf(@Param('id') id: string, @CurrentUser() actor: any, @Res() res: Response) {
    const buffer = await this.purchasesService.orderPdf(id, actor.userId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="bon_commande_${id}.pdf"` });
    res.send(buffer);
  }

  @Post('orders')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  createOrder(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() actor: any) {
    return this.purchasesService.createOrder(dto, actor.userId);
  }

  @Get('orders')
  findAllOrders(@Query('siteId') siteId?: string, @Query('status') status?: string) {
    return this.purchasesService.findAllOrders({ siteId, status });
  }

  @Get('orders/:id')
  findOrder(@Param('id') id: string) {
    return this.purchasesService.findOrder(id);
  }

  @Post('orders/:id/receive')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  receive(@Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto, @CurrentUser() actor: any) {
    return this.purchasesService.receive(id, dto, actor.userId);
  }

  @Post('orders/:id/invoice')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  createInvoice(@Param('id') id: string, @Body() dto: CreatePurchaseInvoiceDto, @CurrentUser() actor: any) {
    return this.purchasesService.createInvoiceFromOrder(id, dto, actor.userId);
  }

  @Get('invoices')
  findAllInvoices(@Query('siteId') siteId?: string, @Query('status') status?: string) {
    return this.purchasesService.findAllInvoices({ siteId, status });
  }
}
