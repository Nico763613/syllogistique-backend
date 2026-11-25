import { Body, Controller, Get, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { PriceRequestsService } from './price-requests.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// Demandes de prix aux fournisseurs, comparatif et validation (le bon de commande est créé automatiquement à la validation).
@ApiTags('purchases')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('STOCK')
@Controller('purchases/price-requests')
export class PriceRequestsController {
  constructor(private svc: PriceRequestsService) {}

  @Get()
  list(@Query('siteId') siteId: string, @Query('status') status: string, @CurrentUser() actor: any) {
    return this.svc.list({ siteId, status }, actor);
  }

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  create(@Body() dto: any, @CurrentUser() actor: any) { return this.svc.create(dto, actor); }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() actor: any) { return this.svc.get(id, actor); }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @CurrentUser() actor: any, @Res() res: Response) {
    const buf = await this.svc.pdf(id, actor);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="demande_prix_${id}.pdf"` });
    res.send(buf);
  }

  @Put(':id/quotes/:supplierId')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  saveQuote(@Param('id') id: string, @Param('supplierId') supplierId: string, @Body() dto: any, @CurrentUser() actor: any) {
    return this.svc.saveQuote(id, supplierId, dto || {}, actor);
  }

  @Post(':id/validate')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.DIRECTEUR_GENERAL)
  validate(@Param('id') id: string, @Body() dto: any, @CurrentUser() actor: any) { return this.svc.validate(id, dto || {}, actor); }

  @Post(':id/cancel')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.DIRECTEUR_GENERAL)
  cancel(@Param('id') id: string, @Body() dto: any, @CurrentUser() actor: any) { return this.svc.cancel(id, (dto && dto.reason) || '', actor); }
}
