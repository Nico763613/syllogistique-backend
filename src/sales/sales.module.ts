import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesDocumentsService } from './sales-documents.service';
import { SalesController } from './sales.controller';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  controllers: [SalesController],
  providers: [SalesService, SalesDocumentsService],
})
export class SalesModule {}
