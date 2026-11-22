import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { RoleName } from '@prisma/client';
import { CreateTripDto, CloseTripDto, CorrectTripDto, SetTripCustomerDto } from './dto/trip.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('trips')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('LOGISTIQUE', 'CARBURANT')
@Controller('trips')
export class TripsController {
  constructor(private tripsService: TripsService) {}

  // Le chauffeur n'ouvre ni ne clôture ses missions par ici : tout passe par l'application chauffeur (/driver/sync)
  // qui applique les contrôles (permis, véhicule, fiche envoyée, kilométrage).
  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  create(@Body() dto: CreateTripDto, @CurrentUser() actor: any) {
    return this.tripsService.create(dto, actor.userId);
  }

  @Patch(':id/close')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  close(@Param('id') id: string, @Body() dto: CloseTripDto, @CurrentUser() actor: any) {
    return this.tripsService.close(id, dto, actor.userId);
  }

  // Correction d'une erreur de saisie — motif obligatoire (Audit Trail)
  @Patch(':id/correct')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  correct(@Param('id') id: string, @Body() dto: CorrectTripDto, @CurrentUser() actor: any) {
    return this.tripsService.correct(id, dto, actor.userId);
  }

  // Client de la mission (Responsable logistique)
  @Patch(':id/customer')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  setCustomer(@Param('id') id: string, @Body() dto: SetTripCustomerDto, @CurrentUser() actor: any) {
    return this.tripsService.setCustomer(id, dto.customerId, actor.userId);
  }

  @Get()
  findAll(
    @Query('siteId') siteId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('driverId') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.tripsService.findAll({ siteId, vehicleId, driverId, from, to });
  }

  @Get(':id/pdf')
  async sheet(@Param('id') id: string, @CurrentUser() actor: any, @Res() res: Response) {
    const buffer = await this.tripsService.sheetPdf(id, actor.userId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="fiche_de_bord_${id}.pdf"` });
    res.send(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tripsService.findOne(id);
  }
}
