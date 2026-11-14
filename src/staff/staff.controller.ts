import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StaffService } from './staff.service';
import { CreateStaffDto, InviteStaffDto, StaffReportDto } from './staff.dto';

const OFFICE = [RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE];
const READERS = [RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_HSE, RoleName.LECTEUR];
const STAFF = [RoleName.AGENT_HSE, RoleName.GESTIONNAIRE_HSE, RoleName.MAGASINIER, RoleName.MECANICIEN, RoleName.POINTEUR];
const toList = (r?: string) => (r ? r.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('staff')
export class StaffController {
  constructor(private service: StaffService) {}

  @Post()
  @Roles(...OFFICE, RoleName.GESTIONNAIRE_HSE)
  create(@Body() dto: CreateStaffDto, @CurrentUser() actor: any) {
    return this.service.create(dto, actor, actor.organizationId, actor.role);
  }

  @Get()
  @Roles(...READERS)
  list(@Query('role') role?: string, @Query('siteId') siteId?: string, @CurrentUser() actor?: any) {
    return this.service.list(toList(role), siteId, actor.role);
  }

  @Post('invite')
  @Roles(...OFFICE, RoleName.GESTIONNAIRE_HSE)
  invite(@Body() dto: InviteStaffDto, @CurrentUser() actor: any) {
    return this.service.invite(dto.userId, dto.appUrl, actor, actor.role);
  }

  @Get('enrolment')
  @Roles(...READERS)
  enrolment(@Query('kind') kind: string, @Query('siteId') siteId?: string, @CurrentUser() actor?: any) {
    return this.service.enrolment(kind, siteId, actor.role);
  }

  @Get('reports/mine')
  @Roles(...STAFF)
  mine(@CurrentUser() actor: any) {
    return this.service.mine(actor.userId);
  }

  @Post('reports')
  @Roles(...STAFF)
  send(@Body() dto: StaffReportDto, @CurrentUser() actor: any) {
    return this.service.send(dto, actor);
  }

  @Get('reports')
  @Roles(...READERS)
  reports(@Query('role') role?: string, @Query('date') date?: string, @Query('siteId') siteId?: string) {
    return this.service.reports(toList(role), date, siteId);
  }

  @Get('reports/pending')
  @Roles(RoleName.SUPER_ADMIN, RoleName.RESPONSABLE_OPERATIONS)
  pending(@Query('siteId') siteId?: string) {
    return this.service.pendingValidation(siteId);
  }

  @Post('reports/:id/validate')
  @Roles(RoleName.SUPER_ADMIN, RoleName.RESPONSABLE_OPERATIONS)
  validate(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.service.validate(id, actor);
  }

  @Post('reports/:id/reject')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_HSE, RoleName.RESPONSABLE_OPERATIONS)
  reject(@Param('id') id: string, @Body() body: { note?: string }, @CurrentUser() actor: any) {
    return this.service.reject(id, body?.note ?? '', actor);
  }

  @Post('reports/:id/receive')
  @Roles(...READERS.filter((r) => r !== RoleName.LECTEUR))
  receive(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.service.receive(id, actor);
  }
}
