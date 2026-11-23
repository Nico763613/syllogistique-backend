import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { DowntimesService } from './downtimes.service';
import { PartsReceivedDto, PartsRequestDto, QualifyDowntimeDto, ReportDowntimeDto, ResolveDowntimeDto } from './dto/downtime.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('downtimes')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('LOGISTIQUE')
@Controller('downtimes')
export class DowntimesController {
  constructor(private service: DowntimesService) {}

  @Get()
  list(@Query('siteId') siteId: string, @Query('vehicleId') vehicleId?: string, @Query('open') open?: string, @CurrentUser() actor?: any) {
    return this.service.list(siteId, { vehicleId, open }, actor);
  }

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  report(@Body() dto: ReportDowntimeDto, @CurrentUser() actor: any) {
    return this.service.report(dto, actor.userId);
  }

  // Étape 2 — la logistique qualifie la panne : priorité + délai de remise en service
  @Post(':id/qualify')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  qualify(@Param('id') id: string, @Body() dto: QualifyDowntimeDto, @CurrentUser() actor: any) {
    return this.service.qualify(id, dto, actor);
  }

  // Étape 3 — le mécanicien prend la réparation en charge (le premier arrivé)
  @Post(':id/take')
  @Roles(RoleName.SUPER_ADMIN, RoleName.MECANICIEN)
  take(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.service.take(id, actor);
  }

  // Étape 4 — pièces nécessaires : état des besoins envoyé aux Achats
  @Post(':id/parts')
  @Departments('LOGISTIQUE', 'STOCK')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MECANICIEN)
  requestParts(@Param('id') id: string, @Body() dto: PartsRequestDto, @CurrentUser() actor: any) {
    return this.service.requestParts(id, dto, actor);
  }

  // Étape 5 — pièces reçues : la réparation reprend
  @Post(':id/parts-received')
  @Departments('LOGISTIQUE', 'STOCK')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MAGASINIER, RoleName.MECANICIEN)
  partsReceived(@Param('id') id: string, @Body() dto: PartsReceivedDto, @CurrentUser() actor: any) {
    return this.service.partsReceived(id, dto, actor);
  }

  @Post(':id/resolve')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MECANICIEN)
  resolve(@Param('id') id: string, @Body() dto: ResolveDowntimeDto, @CurrentUser() actor: any) {
    return this.service.resolve(id, dto, actor.userId, actor.role);
  }
}
