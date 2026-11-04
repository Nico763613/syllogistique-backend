import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesDocumentsService } from './sales-documents.service';
import { SalesReturnsService } from './sales-returns.service';
import { SalesController } from './sales.controller';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  controllers: [SalesController],
  providers: [SalesService, SalesDocumentsService, SalesReturnsService],
})
export class SalesModule {}
