import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DriversModule } from './drivers/drivers.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { TripsModule } from './trips/trips.module';
import { FuelModule } from './fuel/fuel.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { InventoryModule } from './inventory/inventory.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { SyncModule } from './sync/sync.module';
import { CustomersModule } from './customers/customers.module';
import { PurchasesModule } from './purchases/purchases.module';
import { SalesModule } from './sales/sales.module';
import { PaymentsModule } from './payments/payments.module';
import { UploadsModule } from './uploads/uploads.module';
import { QrcodesModule } from './qrcodes/qrcodes.module';
import { MessagingModule } from './messaging/messaging.module';
import { SettingsModule } from './settings/settings.module';
import { SitesModule } from './sites/sites.module';
import { DocumentsModule } from './documents/documents.module';
import { ExpensesModule } from './expenses/expenses.module';
import { SearchModule } from './search/search.module';

import { HealthController } from './health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),
    AuditModule, // @Global — expose PrismaService + AuditService à tous les modules
    AuthModule,
    UsersModule,
    DriversModule,
    VehiclesModule,
    TripsModule,
    FuelModule,
    MaintenanceModule,
    InventoryModule,
    SuppliersModule,
    NotificationsModule,
    ReportsModule,
    SyncModule,
    CustomersModule,
    PurchasesModule,
    SalesModule,
    PaymentsModule,
    UploadsModule,
    QrcodesModule,
    MessagingModule,
    SettingsModule,
    SitesModule,
    DocumentsModule,
    ExpensesModule,
    SearchModule,
  ],
  controllers: [HealthController],
  providers: [
    // Authentification JWT obligatoire sur toutes les routes, sauf @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
