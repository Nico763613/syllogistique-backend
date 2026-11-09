import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { AuditService } from './audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

// Journal d'audit (bouton « Historique » de chaque écran) ; les secrets sont masqués dans les réponses
@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MAGASINIER)
  search(
    @Query('entity') entity?: string,
    @Query('entities') entities?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.search({ entity, entities: entities ? entities.split(',').map((x) => x.trim()).filter(Boolean) : undefined, entityId, userId, from, to, limit: limit ? Number(limit) : undefined });
  }
}
