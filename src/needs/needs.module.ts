import { Module } from '@nestjs/common';
import { NeedsService } from './needs.service';
import { NeedsController } from './needs.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [InventoryModule, MessagingModule],
  controllers: [NeedsController],
  providers: [NeedsService],
})
export class NeedsModule {}
