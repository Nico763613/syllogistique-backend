import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto, CreatePurchaseInvoiceDto } from './dto/purchase.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('purchases')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private purchasesService: PurchasesService) {}

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
