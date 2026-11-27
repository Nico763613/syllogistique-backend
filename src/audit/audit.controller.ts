import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { AuditService } from './audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// Moindre privilège : le stock et la flotte ne lisent que l'historique de leur propre domaine
export const AUDIT_SCOPE: Record<string, string[]> = {
  MAGASINIER: ['InventoryItem', 'StockMovement', 'PurchaseOrder', 'GoodsReceipt', 'Need', 'Supplier', 'Warehouse', 'StockCount'],
  GESTIONNAIRE_FLOTTE: ['Vehicle', 'Document', 'VehicleDowntime', 'Driver', 'DriverDevice', 'FuelTransaction', 'Maintenance', 'DriverMaintenance', 'MaintenancePlan', 'DriverExpense', 'DriverDailyReport', 'Trip'],
};

// Journal d'audit (bouton « Historique » de chaque écran) ; les secrets sont masqués dans les réponses
@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.DIRECTEUR_GENERAL, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MAGASINIER)
  search(
    @Query('entity') entity?: string,
    @Query('entities') entities?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: any,
  ) {
    let list = entities ? entities.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
    const scope = AUDIT_SCOPE[user?.role];
    if (scope) {
      if (entity && !scope.includes(entity)) throw new ForbiddenException("Cet historique ne relève pas de votre domaine.");
      list = list ? list.filter((x) => scope.includes(x)) : scope;
      if (!list.length) throw new ForbiddenException("Cet historique ne relève pas de votre domaine.");
    }
    return this.auditService.search({ entity, entities: list, entityId, userId, from, to, limit: limit ? Number(limit) : undefined });
  }
}
