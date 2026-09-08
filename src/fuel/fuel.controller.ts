import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FuelService } from './fuel.service';
import { CreateFuelTransactionDto } from './dto/fuel.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('fuel')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('fuel')
export class FuelController {
  constructor(private fuelService: FuelService) {}

  @Post()
  create(@Body() dto: CreateFuelTransactionDto, @CurrentUser() actor: any) {
    return this.fuelService.create(dto, actor.userId, actor.organizationId);
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
