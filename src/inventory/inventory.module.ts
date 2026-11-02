import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { InventoryCountsService } from './inventory-counts.service';
import { InventoryCountsController } from './inventory-counts.controller';

@Module({
  controllers: [InventoryController, InventoryCountsController],
  providers: [InventoryService, InventoryCountsService],
  exports: [InventoryService],
})
export class InventoryModule {}
