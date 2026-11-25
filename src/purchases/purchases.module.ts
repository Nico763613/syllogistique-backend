import { Module } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { PriceRequestsService } from './price-requests.service';
import { PriceRequestsController } from './price-requests.controller';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [PurchasesController, PriceRequestsController],
  providers: [PurchasesService, PriceRequestsService],
})
export class PurchasesModule {}
