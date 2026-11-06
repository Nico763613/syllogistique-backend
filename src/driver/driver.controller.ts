import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DriverDeviceGuard } from './driver-device.guard';
import { DriverAppService } from './driver-app.service';
import { DriverDevicesService } from './driver-devices.service';
import { DriverHistoryService } from './driver-history.service';
import { ActivateDeviceDto, DeviceReasonDto, LinkDriverDto, ProvisionDeviceDto, SyncDto } from './driver.dto';

// --- Application mobile du chauffeur (compte personnel + appareil activé) ---
@ApiTags('driver')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('driver')
export class DriverController {
  constructor(private app: DriverAppService, private devices: DriverDevicesService) {}

  @Post('activate')
  @Roles(RoleName.CHAUFFEUR)
  activate(@Body() dto: ActivateDeviceDto, @CurrentUser() user: any) {
    return this.devices.activate(user.userId, dto);
  }

  @Get('me')
  @Roles(RoleName.CHAUFFEUR)
  @UseGuards(DriverDeviceGuard)
  me(@CurrentUser() user: any, @Req() req: any) {
    return this.app.me(user.userId, req.driverDevice);
  }

  @Post('sync')
  @Roles(RoleName.CHAUFFEUR)
  @UseGuards(DriverDeviceGuard)
  sync(@Body() dto: SyncDto, @CurrentUser() user: any) {
    return this.app.sync(user.userId, user.organizationId, dto.ops);
  }
}

// --- Administration (gestionnaire de flotte) : liaison, QR/OTP, blocage, historique ---
const MANAGERS = [RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE];

@ApiTags('driver-admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...MANAGERS)
@Controller('driver-admin')
export class DriverAdminController {
  constructor(private devices: DriverDevicesService, private history: DriverHistoryService) {}

  @Get('overview')
  overview(@CurrentUser() actor: any, @Query('siteId') siteId?: string) {
    return this.devices.overview(actor, siteId);
  }

  @Post('link')
  link(@Body() dto: LinkDriverDto, @CurrentUser() actor: any) {
    return this.devices.link(dto.driverId, dto.email, actor);
  }

  @Post('provision')
  provision(@Body() dto: ProvisionDeviceDto, @CurrentUser() actor: any) {
    return this.devices.provision(dto.driverId, actor);
  }

  @Post('devices/:id/block')
  block(@Param('id') id: string, @Body() dto: DeviceReasonDto, @CurrentUser() actor: any) {
    return this.devices.setStatus(id, 'BLOCKED', dto.reason, actor);
  }

  @Post('devices/:id/unblock')
  unblock(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.devices.setStatus(id, 'ACTIVE', 'Déblocage', actor);
  }

  @Post('devices/:id/revoke')
  revoke(@Param('id') id: string, @Body() dto: DeviceReasonDto, @CurrentUser() actor: any) {
    return this.devices.setStatus(id, 'REVOKED', dto.reason, actor);
  }

  @Get('history/vehicle/:id')
  vehicleHistory(@Param('id') id: string) {
    return this.history.forVehicle(id);
  }

  @Get('history/driver/:id')
  driverHistory(@Param('id') id: string) {
    return this.history.forDriver(id);
  }
}
