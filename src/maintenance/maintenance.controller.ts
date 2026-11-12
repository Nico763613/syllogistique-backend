import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceDto } from './dto/maintenance.dto';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('maintenance')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('LOGISTIQUE')
@Controller('maintenance')
export class MaintenanceController {
  constructor(private maintenanceService: MaintenanceService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MECANICIEN)
  create(@Body() dto: CreateMaintenanceDto, @CurrentUser() actor: any) {
    return this.maintenanceService.create(dto, actor.userId);
  }

  @Get()
  findAll(@Query('vehicleId') vehicleId?: string) {
    return this.maintenanceService.findAll({ vehicleId });
  }

  @Get('types')
  types() {
    return this.maintenanceService.types();
  }

  @Get('alerts')
  alerts(@Query('siteId') siteId: string) {
    return this.maintenanceService.alerts(siteId);
  }
}
