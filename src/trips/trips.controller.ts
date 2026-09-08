import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto, CloseTripDto } from './dto/trip.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('trips')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('trips')
export class TripsController {
  constructor(private tripsService: TripsService) {}

  @Post()
  create(@Body() dto: CreateTripDto, @CurrentUser() actor: any) {
    return this.tripsService.create(dto, actor.userId);
  }

  @Patch(':id/close')
  close(@Param('id') id: string, @Body() dto: CloseTripDto, @CurrentUser() actor: any) {
    return this.tripsService.close(id, dto, actor.userId);
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tripsService.findOne(id);
  }
}
