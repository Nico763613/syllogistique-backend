import { Module } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';
import { DowntimesService } from './downtimes.service';
import { DowntimesController } from './downtimes.controller';

@Module({
  controllers: [VehiclesController, DowntimesController],
  providers: [VehiclesService, DowntimesService],
})
export class VehiclesModule {}
