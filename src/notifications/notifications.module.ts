import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsScheduler } from './notifications.scheduler';
import { RoleAlertsService } from './role-alerts.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsScheduler, RoleAlertsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
