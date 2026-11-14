import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { DowntimesService } from './downtimes.service';
import { ReportDowntimeDto, ResolveDowntimeDto } from './dto/downtime.dto';
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

  @Post(':id/resolve')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MECANICIEN)
  resolve(@Param('id') id: string, @Body() dto: ResolveDowntimeDto, @CurrentUser() actor: any) {
    return this.service.resolve(id, dto, actor.userId, actor.role);
  }
}
