import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CommercialDashboardService } from './commercial-dashboard.service';
import { LogisticsDashboardService } from './logistics-dashboard.service';
import { StockDashboardService } from './stock-dashboard.service';
import { FleetDashboardService } from './fleet-dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@ApiTags('dashboards')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('dashboards')
export class DashboardsController {
  constructor(private commercial: CommercialDashboardService, private logistics: LogisticsDashboardService, private stock: StockDashboardService, private fleet: FleetDashboardService) {}

  // Tableau de bord Commercial & Caisse. Le caissier ne reçoit que les données de sa propre session.
  @Get('commercial')
  @Roles(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LOGISTIQUE,
    RoleName.RESPONSABLE_COMMERCIAL,
    RoleName.CAISSIER,
    RoleName.LECTEUR,
  )
  commercialDashboard(@Query() query: DashboardQueryDto, @CurrentUser() actor: any) {
    return this.commercial.get(actor, query);
  }

  // Tableau de bord Logistique & Approvisionnements (les données financières sont masquées au magasinier)
  @Get('logistics')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER, RoleName.LECTEUR)
  logisticsDashboard(@Query() query: DashboardQueryDto, @CurrentUser() actor: any) {
    return this.logistics.get(actor, query);
  }

  // Tableau de bord Entrepôt & Stocks (valorisation masquée au magasinier)
  @Get('stock')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER, RoleName.LECTEUR)
  stockDashboard(@Query() query: DashboardQueryDto, @CurrentUser() actor: any) {
    return this.stock.get(actor, query);
  }

  // Tableau de bord Charroi & Flotte
  @Get('fleet')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.LECTEUR)
  fleetDashboard(@Query() query: DashboardQueryDto, @CurrentUser() actor: any) {
    return this.fleet.get(actor, query);
  }
}
