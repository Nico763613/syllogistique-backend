import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto, StockInDto, StockOutDto } from './dto/inventory.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Post('items')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  createItem(@Body() dto: CreateInventoryItemDto, @CurrentUser() actor: any) {
    return this.inventoryService.createItem(dto, actor.userId);
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

  @Get('valuation')
  valuation(@Query('siteId') siteId: string) {
    return this.inventoryService.valuation(siteId);
  }
}
