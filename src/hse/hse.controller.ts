import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { HseService } from './hse.service';
import * as D from './hse.dto';

const HSE_TEAM = [RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_HSE, RoleName.AGENT_HSE];
// Tout le personnel peut déclarer un incident ou un presque-accident
const DECLARERS = [...HSE_TEAM, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MAGASINIER, RoleName.CHAUFFEUR, RoleName.RESPONSABLE_COMMERCIAL, RoleName.CAISSIER];
const HSE_MANAGERS = [RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_HSE];

@ApiTags('hse')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('hse')
export class HseController {
  constructor(private s: HseService) {}

  @Post('incidents') @Roles(...DECLARERS)
  createIncident(@Body() dto: D.CreateIncidentDto, @CurrentUser() a: any) { return this.s.createIncident(dto, a); }
  @Get('incidents') @Roles(...HSE_TEAM, RoleName.LECTEUR)
  listIncidents(@CurrentUser() a: any, @Query('siteId') siteId?: string, @Query('status') status?: string) { return this.s.listIncidents(a, siteId, status); }
  @Patch('incidents/:id/close') @Roles(...HSE_MANAGERS)
  closeIncident(@Param('id') id: string, @Body() dto: D.CloseIncidentDto, @CurrentUser() a: any) { return this.s.closeIncident(id, dto, a); }

  @Post('actions') @Roles(...HSE_TEAM)
  createAction(@Body() dto: D.CreateActionDto, @CurrentUser() a: any) { return this.s.createAction(dto, a); }
  @Get('actions') @Roles(...HSE_TEAM, RoleName.LECTEUR)
  listActions(@CurrentUser() a: any, @Query('siteId') siteId?: string, @Query('status') status?: string) { return this.s.listActions(a, siteId, status); }
  @Patch('actions/:id/done') @Roles(...HSE_TEAM)
  completeAction(@Param('id') id: string, @CurrentUser() a: any) { return this.s.completeAction(id, a); }

  @Post('talks') @Roles(...HSE_TEAM)
  createTalk(@Body() dto: D.CreateTalkDto) { return this.s.createTalk(dto); }
  @Get('talks') @Roles(...HSE_TEAM, RoleName.LECTEUR)
  listTalks(@CurrentUser() a: any, @Query('siteId') siteId?: string) { return this.s.listTalks(a, siteId); }
  @Patch('talks/:id/hold') @Roles(...HSE_TEAM)
  holdTalk(@Param('id') id: string, @Body() dto: D.HoldTalkDto, @CurrentUser() a: any) { return this.s.holdTalk(id, dto, a); }

  @Post('inspections') @Roles(...HSE_TEAM)
  createInspection(@Body() dto: D.CreateInspectionDto, @CurrentUser() a: any) { return this.s.createInspection(dto, a); }
  @Get('inspections') @Roles(...HSE_TEAM, RoleName.LECTEUR)
  listInspections(@CurrentUser() a: any, @Query('siteId') siteId?: string) { return this.s.listInspections(a, siteId); }

  @Post('ppe') @Roles(...HSE_TEAM)
  createPpe(@Body() dto: D.CreatePpeDto) { return this.s.createPpe(dto); }
  @Post('trainings') @Roles(...HSE_MANAGERS)
  createTraining(@Body() dto: D.CreateTrainingDto) { return this.s.createTraining(dto); }
  @Put('worked-hours') @Roles(...HSE_MANAGERS)
  setHours(@Body() dto: D.SetWorkedHoursDto) { return this.s.setWorkedHours(dto); }
}
