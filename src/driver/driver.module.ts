import { Module } from '@nestjs/common';
import { DriverController, DriverAdminController } from './driver.controller';
import { DriverAppService } from './driver-app.service';
import { DriverDevicesService } from './driver-devices.service';
import { DriverHistoryService } from './driver-history.service';
import { DriverDeviceGuard } from './driver-device.guard';

@Module({
  controllers: [DriverController, DriverAdminController],
  providers: [DriverAppService, DriverDevicesService, DriverHistoryService, DriverDeviceGuard],
})
export class DriverModule {}
