import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesDocumentsService } from './sales-documents.service';
import { SalesPdfsService } from './sales-pdfs.service';
import { SalesReturnsService } from './sales-returns.service';
import { SalesController } from './sales.controller';
import { TransportBillingController } from './transport-billing.controller';
import { TransportBillingService } from './transport-billing.service';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  controllers: [SalesController, TransportBillingController],
  providers: [SalesService, SalesDocumentsService, SalesPdfsService, SalesReturnsService, TransportBillingService],
})
export class SalesModule {}
