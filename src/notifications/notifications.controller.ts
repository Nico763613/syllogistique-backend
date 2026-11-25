import { BadRequestException, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RoleAlertsService } from './role-alerts.service';
import { resolveSite } from '../dashboards/dashboard-common';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService, private roleAlerts: RoleAlertsService) {}

  @Get()
  findAll(@CurrentUser() actor: any, @Query('unreadOnly') unreadOnly?: string, @Query('all') all?: string, @Query('limit') limit?: string) {
    return this.notificationsService.findAll(unreadOnly === 'true', actor, { all: all === 'true', limit: limit ? Number(limit) : undefined });
  }

  // Déclenche manuellement les alertes par département (sinon : chaque jour à 06:30)
  @Post('run-role-alerts')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  async runRoleAlerts() {
    return { generated: await this.roleAlerts.run() };
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.notificationsService.markRead(id, actor);
  }

  @Patch(':id/unread')
  markUnread(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.notificationsService.markUnread(id, actor);
  }

  @Patch(':id/handle')
  handle(@Param('id') id: string, @CurrentUser() actor: any, @Query('undo') undo?: string) {
    return this.notificationsService.markHandled(id, undo !== 'true', actor);
  }

  @Post('run-checks')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  runChecks(@Query('siteId') siteId: string, @CurrentUser() actor: any) {
    const site = resolveSite(actor, siteId);
    if (!site) throw new BadRequestException('Indiquez le site à contrôler (paramètre siteId).');
    return this.notificationsService.runDailyChecks(site);
  }
}
