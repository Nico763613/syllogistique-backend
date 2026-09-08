import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';
import { ReportsController } from './reports.controller';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  controllers: [ReportsController],
  providers: [ReportsService, ExportService],
})
export class ReportsModule {}
