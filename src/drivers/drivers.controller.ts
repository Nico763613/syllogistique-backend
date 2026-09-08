import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { DriversService } from './drivers.service';
import { CreateDriverDto, UpdateDriverDto, MarkAttendanceDto } from './dto/driver.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('drivers')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('drivers')
export class DriversController {
  constructor(private driversService: DriversService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  create(@Body() dto: CreateDriverDto, @CurrentUser() actor: any) {
    return this.driversService.create(dto, actor.userId);
  }

  @Get()
  findAll(@Query('siteId') siteId?: string) {
    return this.driversService.findAll(siteId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.driversService.findOne(id);
  }

  @Get(':id/attendance-stats')
  attendanceStats(@Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    return this.driversService.attendanceStats(id, from, to);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  update(@Param('id') id: string, @Body() dto: UpdateDriverDto, @CurrentUser() actor: any) {
    return this.driversService.update(id, dto, actor.userId);
  }

  @Post('attendance')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  markAttendance(@Body() dto: MarkAttendanceDto, @CurrentUser() actor: any) {
    return this.driversService.markAttendance(dto, actor.userId);
  }
}
