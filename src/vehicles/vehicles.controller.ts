import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleName, VehicleType } from '@prisma/client';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto, UpdateVehicleDto } from './dto/vehicle.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('vehicles')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('LOGISTIQUE')
@Controller('vehicles')
export class VehiclesController {
  constructor(private vehiclesService: VehiclesService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  create(@Body() dto: CreateVehicleDto, @CurrentUser() actor: any) {
    return this.vehiclesService.create(dto, actor.userId);
  }

  @Get()
  findAll(
    @Query('siteId') siteId?: string,
    @Query('vehicleType') vehicleType?: VehicleType,
    @Query('status') status?: string,
  ) {
    return this.vehiclesService.findAll({ siteId, vehicleType, status });
  }

  @Get('availability')
  availability(@Query('siteId') siteId: string, @Query('vehicleType') vehicleType?: VehicleType) {
    return this.vehiclesService.fleetAvailability(siteId, vehicleType);
  }

  // Vue d'ensemble de la flotte (lecture seule) : mission en cours, immobilisation, entretien, activité du mois
  @Get('fleet-overview')
  fleetOverview(@CurrentUser() actor: any, @Query('siteId') siteId?: string, @Query('vehicleType') vehicleType?: VehicleType) {
    return this.vehiclesService.fleetOverview(actor, siteId, vehicleType);
  }

  // Dossier d'un véhicule (lecture seule) : missions, carburant, entretien, incidents, totaux
  @Get(':id/assignments')
  assignments(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.vehiclesService.assignments(id, actor);
  }

  @Get(':id/dossier')
  dossier(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.vehiclesService.dossier(id, actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto, @CurrentUser() actor: any) {
    return this.vehiclesService.update(id, dto, actor.userId);
  }
}
