import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { AuditService } from './audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

// Journal d'audit : consultable uniquement par l'Administrateur
@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  search(
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.search({ entity, entityId, userId, from, to, limit: limit ? Number(limit) : undefined });
  }
}
