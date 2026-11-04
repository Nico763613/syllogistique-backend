import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RoleAlertsService } from './role-alerts.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService, private roleAlerts: RoleAlertsService) {}

  @Get()
  findAll(@CurrentUser() actor: any, @Query('unreadOnly') unreadOnly?: string) {
    return this.notificationsService.findAll(unreadOnly === 'true', actor);
  }

  // Déclenche manuellement les alertes par département (sinon : chaque jour à 06:30)
  @Post('run-role-alerts')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  async runRoleAlerts() {
    return { generated: await this.roleAlerts.run() };
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.notificationsService.markRead(id);
  }

  @Post('run-checks')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  runChecks(@Query('siteId') siteId: string) {
    return this.notificationsService.runDailyChecks(siteId);
  }
}
