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
const STAFF = [RoleName.AGENT_HSE, RoleName.GESTIONNAIRE_HSE, RoleName.MAGASINIER];
const toList = (r?: string) => (r ? r.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('staff')
export class StaffController {
  constructor(private service: StaffService) {}

  @Post()
  @Roles(...OFFICE)
  create(@Body() dto: CreateStaffDto, @CurrentUser() actor: any) {
    return this.service.create(dto, actor, actor.organizationId);
  }

  @Get()
  @Roles(...READERS)
  list(@Query('role') role?: string, @Query('siteId') siteId?: string) {
    return this.service.list(toList(role), siteId);
  }

  @Post('invite')
  @Roles(...OFFICE)
  invite(@Body() dto: InviteStaffDto, @CurrentUser() actor: any) {
    return this.service.invite(dto.userId, dto.appUrl, actor);
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

  @Post('reports/:id/receive')
  @Roles(...READERS.filter((r) => r !== RoleName.LECTEUR))
  receive(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.service.receive(id, actor);
  }
}
