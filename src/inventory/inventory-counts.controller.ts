import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { InventoryCountsService } from './inventory-counts.service';
import { CloseInventoryCountDto, SaveCountLinesDto, StartInventoryCountDto } from './dto/inventory.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// Inventaire physique : comptage par le magasinier, validation par l'administrateur
@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('STOCK')
@Controller('inventory/counts')
export class InventoryCountsController {
  constructor(private counts: InventoryCountsService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  start(@Body() dto: StartInventoryCountDto, @CurrentUser() actor: any) {
    return this.counts.start(dto, actor.userId);
  }

  @Get()
  list(@Query('siteId') siteId?: string) {
    return this.counts.list(siteId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.counts.findOne(id);
  }

  @Post(':id/lines')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  saveLines(@Param('id') id: string, @Body() dto: SaveCountLinesDto) {
    return this.counts.saveLines(id, dto);
  }

  @Post(':id/validate')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  validate(@Param('id') id: string, @Body() dto: CloseInventoryCountDto, @CurrentUser() actor: any) {
    return this.counts.validate(id, dto, actor.userId);
  }

  @Post(':id/cancel')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  cancel(@Param('id') id: string, @Body() dto: CloseInventoryCountDto, @CurrentUser() actor: any) {
    return this.counts.cancel(id, dto, actor.userId);
  }
}
