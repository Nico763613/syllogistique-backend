import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { PendingPaymentsService } from './pending-payments.service';
import { CreatePaymentDto } from './dto/payment.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService, private pendingService: PendingPaymentsService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.RESPONSABLE_COMMERCIAL, RoleName.CAISSIER)
  create(@Body() dto: CreatePaymentDto, @CurrentUser() actor: any) {
    // Les rôles commerciaux n'enregistrent que des encaissements clients (jamais de règlement fournisseur)
    if (
      (actor.role === RoleName.RESPONSABLE_COMMERCIAL || actor.role === RoleName.CAISSIER) &&
      (dto.direction !== 'IN' || !dto.salesInvoiceId || dto.purchaseInvoiceId)
    ) {
      throw new ForbiddenException('Votre rôle ne peut enregistrer que des règlements clients.');
    }
    return this.paymentsService.create(dto, actor.userId, actor);
  }

  // Paiements mobile en attente de confirmation de l'opérateur
  @Post('pending')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.RESPONSABLE_COMMERCIAL, RoleName.CAISSIER)
  declare(@Body() dto: any, @CurrentUser() actor: any) { return this.pendingService.declare(dto || {}, actor); }

  @Get('pending')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.RESPONSABLE_COMMERCIAL, RoleName.CAISSIER, RoleName.COMPTABLE, RoleName.DIRECTEUR_GENERAL)
  pending(@Query('siteId') siteId: string, @Query('status') status: string, @CurrentUser() actor: any) { return this.pendingService.list({ siteId, status }, actor); }

  @Post('pending/:id/confirm')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.RESPONSABLE_COMMERCIAL, RoleName.COMPTABLE)
  confirmPending(@Param('id') id: string, @CurrentUser() actor: any) { return this.pendingService.confirm(id, actor); }

  @Post('pending/:id/reject')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.RESPONSABLE_COMMERCIAL, RoleName.COMPTABLE)
  rejectPending(@Param('id') id: string, @Body() dto: any, @CurrentUser() actor: any) { return this.pendingService.reject(id, (dto && dto.reason) || '', actor); }

  @Get()
  findAll(@Query('salesInvoiceId') salesInvoiceId?: string, @Query('purchaseInvoiceId') purchaseInvoiceId?: string) {
    return this.paymentsService.findAll({ salesInvoiceId, purchaseInvoiceId });
  }
}
