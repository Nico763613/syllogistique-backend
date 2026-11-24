import { Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { MaintenancePlansService } from './maintenance-plans.service';
import { MaintenancePlansController } from './maintenance-plans.controller';

@Module({
  controllers: [MaintenanceController, MaintenancePlansController],
  providers: [MaintenanceService, MaintenancePlansService],
})
export class MaintenanceModule {}
