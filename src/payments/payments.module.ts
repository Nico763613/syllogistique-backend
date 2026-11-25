import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PendingPaymentsService } from './pending-payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PendingPaymentsService],
})
export class PaymentsModule {}
