import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { CorrectStockMovementDto, CreateInventoryItemDto, StockInDto, StockOutDto, UpdateInventoryItemDto } from './dto/inventory.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('STOCK')
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Post('items')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  createItem(@Body() dto: CreateInventoryItemDto, @CurrentUser() actor: any) {
    return this.inventoryService.createItem(dto, actor.userId);
  }

  // Modifier un article / ses seuils d'alerte — motif obligatoire (Audit Trail)
  @Patch('items/:id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  updateItem(@Param('id') id: string, @Body() dto: UpdateInventoryItemDto, @CurrentUser() actor: any) {
    return this.inventoryService.updateItem(id, dto, actor.userId);
  }

  @Get('categories')
  categories() {
    return this.inventoryService.categories();
  }

  @Get('items')
  findAll(
    @Query('siteId') siteId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('belowMinimum') belowMinimum?: string,
  ) {
    return this.inventoryService.findAll({ siteId, categoryId, belowMinimum: belowMinimum === 'true' });
  }

  @Get('items/:id')
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Post('movements/in')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  stockIn(@Body() dto: StockInDto, @CurrentUser() actor: any) {
    return this.inventoryService.stockIn(dto, actor.userId);
  }

  @Post('movements/out')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  stockOut(@Body() dto: StockOutDto, @CurrentUser() actor: any) {
    return this.inventoryService.stockOut(dto, actor.userId);
  }

  // Correction d'une erreur de saisie : motif obligatoire, stock recalculé automatiquement
  @Post('movements/:id/correct')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  correctMovement(@Param('id') id: string, @Body() dto: CorrectStockMovementDto, @CurrentUser() actor: any) {
    return this.inventoryService.correctMovement(id, dto, actor.userId);
  }

  // Journal des mouvements (fiche de stock) avec filtres : article, type (IN/OUT/ADJUSTMENT), période
  @Get('movements')
  movements(
    @Query('siteId') siteId?: string,
    @Query('itemId') itemId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.movements({ siteId, itemId, type, from, to, limit: limit ? Number(limit) : undefined });
  }

  @Get('movements/export/excel')
  async movementsExcel(
    @Res() res: Response,
    @Query('siteId') siteId?: string,
    @Query('itemId') itemId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.inventoryService.movementsExcel({ siteId, itemId, type, from, to });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="mouvements_stock.xlsx"',
    });
    res.send(buffer);
  }

  // Consommation, couverture en jours, état (rupture / sous seuil / surstock) et quantité conseillée à commander
  @Get('delivery-note')
  async deliveryNote(
    @Query('siteId') siteId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('beneficiary') beneficiary: string,
    @CurrentUser() actor: any,
    @Res() res: Response,
  ) {
    const buffer = await this.inventoryService.deliveryNotePdf({ siteId, from, to, beneficiary }, actor.userId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="bon_de_sortie.pdf"' });
    res.send(buffer);
  }

  @Get('analysis')
  analysis(@Query('siteId') siteId: string, @Query('days') days?: string) {
    return this.inventoryService.analysis(siteId, days ? Number(days) : 30);
  }

  @Get('valuation')
  valuation(@Query('siteId') siteId: string) {
    return this.inventoryService.valuation(siteId);
  }
}
