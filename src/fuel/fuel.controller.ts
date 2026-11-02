import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FuelService } from './fuel.service';
import { RoleName } from '@prisma/client';
import { CreateFuelTransactionDto, CorrectFuelTransactionDto } from './dto/fuel.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('fuel')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('CARBURANT')
@Controller('fuel')
export class FuelController {
  constructor(private fuelService: FuelService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MAGASINIER, RoleName.CHAUFFEUR)
  create(@Body() dto: CreateFuelTransactionDto, @CurrentUser() actor: any) {
    return this.fuelService.create(dto, actor.userId, actor.organizationId);
  }

  // Correction d'une erreur de saisie — motif obligatoire (Audit Trail)
  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  correct(@Param('id') id: string, @Body() dto: CorrectFuelTransactionDto, @CurrentUser() actor: any) {
    return this.fuelService.correct(id, dto, actor.userId);
  }

  @Get()
  findAll(
    @Query('siteId') siteId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.fuelService.findAll({ siteId, vehicleId, from, to });
  }

  @Get('vehicle/:vehicleId/stats')
  stats(@Param('vehicleId') vehicleId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.fuelService.consumptionStats(vehicleId, from, to);
  }
}
