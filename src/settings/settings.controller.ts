import { Body, Controller, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { SettingsService } from './settings.service';
import { SetSettingDto, UpdateOrganizationDto } from './dto/settings.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  list(@CurrentUser() actor: any) {
    return this.settingsService.list(actor.organizationId);
  }

  // Tarif carburant actuel (12 000 GNF/L par défaut)
  @Get('fuel-price')
  fuelPrice(@CurrentUser() actor: any) {
    return this.settingsService.fuelPrice(actor.organizationId);
  }

  @Get('organization')
  getOrganization(@CurrentUser() actor: any) {
    return this.settingsService.getOrganization(actor.organizationId);
  }

  @Patch('organization')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  updateOrganization(@Body() dto: UpdateOrganizationDto, @CurrentUser() actor: any) {
    return this.settingsService.updateOrganization(actor.organizationId, dto, actor.userId);
  }

  // ex: PUT /settings/FUEL_PRICE_PER_LITER  { "value": "12500", "reason": "Hausse à la pompe" }
  @Put(':key')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  set(@Param('key') key: string, @Body() dto: SetSettingDto, @CurrentUser() actor: any) {
    return this.settingsService.set(actor.organizationId, key, dto.value, actor.userId, dto.reason);
  }
}
