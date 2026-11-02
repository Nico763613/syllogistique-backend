import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SyncService } from './sync.service';
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
  constructor(private syncService: SyncService) {}

  // Le client pousse son lot d'opérations enregistrées hors connexion
  @Post('push')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MAGASINIER, RoleName.CHAUFFEUR)
  push(@Body() dto: SyncPushDto, @CurrentUser() actor: any) {
    return this.syncService.push(dto.operations, actor.userId, actor.organizationId, actor);
  }

  @Get('pending-count')
  pendingCount(@Query('deviceId') deviceId?: string) {
    return this.syncService.pendingCount(deviceId);
  }

  @Get('log')
  log(@Query('deviceId') deviceId?: string) {
    return this.syncService.log(deviceId);
  }
}
