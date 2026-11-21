import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { resolveSite } from '../dashboards/dashboard-common';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  // GET /search?q=camion12
  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.LECTEUR, RoleName.DIRECTEUR_GENERAL, RoleName.RESPONSABLE_OPERATIONS)
  search(@Query('q') q: string, @Query('siteId') siteId: string | undefined, @CurrentUser() actor: any) {
    // Le site demandé doit appartenir au périmètre de l'utilisateur (sauf Super Admin)
    return this.searchService.search(q, resolveSite(actor, siteId));
  }
}
