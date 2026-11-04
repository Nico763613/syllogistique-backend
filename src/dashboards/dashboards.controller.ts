import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CommercialDashboardService } from './commercial-dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@ApiTags('dashboards')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('dashboards')
export class DashboardsController {
  constructor(private commercial: CommercialDashboardService) {}

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
}
