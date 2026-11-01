import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  findAll(@Query('unreadOnly') unreadOnly?: string) {
    return this.notificationsService.findAll(unreadOnly === 'true');
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
