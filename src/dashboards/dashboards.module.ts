import { Module } from '@nestjs/common';
import { DashboardsController } from './dashboards.controller';
import { CommercialDashboardService } from './commercial-dashboard.service';

// PrismaService est fourni par AuditModule (@Global)
@Module({
  controllers: [DashboardsController],
  providers: [CommercialDashboardService],
})
export class DashboardsModule {}
