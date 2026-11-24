import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { MaintenancePlansService } from './maintenance-plans.service';
import { CompleteMaintenanceDto, CreateMaintenancePlanDto, SchedulePlanDto, UpdateMaintenancePlanDto } from './dto/maintenance-plan.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const FLEET = [RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE];

// Entretien préventif : plans par véhicule, planification, entretien effectué
@ApiTags('maintenance-plans')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('LOGISTIQUE')
@Controller('maintenance-plans')
export class MaintenancePlansController {
  constructor(private service: MaintenancePlansService) {}

  @Get()
  list(@Query('siteId') siteId: string, @Query('vehicleId') vehicleId: string | undefined, @CurrentUser() actor: any) {
    return this.service.list(siteId || actor.siteId, vehicleId);
  }

  @Post()
  @Roles(...FLEET)
  create(@Body() dto: CreateMaintenancePlanDto, @CurrentUser() actor: any) {
    return this.service.create(dto, actor);
  }

  @Patch(':id')
  @Roles(...FLEET)
  update(@Param('id') id: string, @Body() dto: UpdateMaintenancePlanDto, @CurrentUser() actor: any) {
    return this.service.update(id, dto, actor);
  }

  // La logistique planifie l'entretien : l'atelier est prévenu
  @Post(':id/schedule')
  @Roles(...FLEET)
  schedule(@Param('id') id: string, @Body() dto: SchedulePlanDto, @CurrentUser() actor: any) {
    return this.service.schedule(id, dto, actor);
  }

  // Le mécanicien (ou la logistique) déclare l'entretien planifié effectué
  @Post('complete/:maintenanceId')
  @Roles(...FLEET, RoleName.MECANICIEN)
  complete(@Param('maintenanceId') maintenanceId: string, @Body() dto: CompleteMaintenanceDto, @CurrentUser() actor: any) {
    return this.service.complete(maintenanceId, dto, actor);
  }
}
