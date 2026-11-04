import { Module } from '@nestjs/common';
import { DashboardsController } from './dashboards.controller';
import { CommercialDashboardService } from './commercial-dashboard.service';
import { LogisticsDashboardService } from './logistics-dashboard.service';

// PrismaService est fourni par AuditModule (@Global)
@Module({
  controllers: [DashboardsController],
  providers: [CommercialDashboardService, LogisticsDashboardService],
})
export class DashboardsModule {}
