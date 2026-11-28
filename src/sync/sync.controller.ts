import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { ConflictsService } from './conflicts.service';
import { ResolveConflictDto } from './sync.dto';
import { SyncPushDto } from './sync.dto';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('sync')
export class SyncController {
  constructor(private syncService: SyncService, private conflicts: ConflictsService) {}

  // Le client pousse son lot d'opérations enregistrées hors connexion
  @Post('push')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MAGASINIER)
  push(@Body() dto: SyncPushDto, @CurrentUser() actor: any) {
    return this.syncService.push(dto.operations, actor.userId, actor.organizationId, actor);
  }

  @Get('pending-count')
  pendingCount(@Query('deviceId') deviceId?: string) {
    return this.syncService.pendingCount(deviceId);
  }

  // Journal réservé aux responsables : il contient les données brutes envoyées par tous les appareils.
  @Get('log')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  log(@Query('deviceId') deviceId?: string) {
    return this.syncService.log(deviceId);
  }

  // --- Conflits de synchronisation (saisies hors ligne sur une fiche modifiée entre-temps) ---
  // Les responsables voient les conflits de leur périmètre ; les autres profils voient les leurs.
  @Get('conflicts')
  listConflicts(@CurrentUser() actor: any, @Query('status') status?: string) {
    return this.conflicts.list(actor, status);
  }

  @Get('conflicts/count')
  countConflicts(@CurrentUser() actor: any) {
    return this.conflicts.count(actor);
  }

  @Post('conflicts/:id/resolve')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.RESPONSABLE_OPERATIONS, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MAGASINIER)
  resolveConflict(@Param('id') id: string, @Body() dto: ResolveConflictDto, @CurrentUser() actor: any) {
    return this.conflicts.resolve(id, dto.choice, dto.note, actor);
  }
}
