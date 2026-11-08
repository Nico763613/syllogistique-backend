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
import { DriverSheetService } from './driver-sheet.service';
import { ProcessSheetDto, ExpenseDecisionDto, ActivateDeviceDto, DeviceReasonDto, LinkDriverDto, ProvisionDeviceDto, InviteDto, SyncDto, SendSheetDto, TakeoverDto, TransferDeviceDto, UpdateProfileDto } from './driver.dto';

// --- Application mobile du chauffeur (compte personnel + appareil activé) ---
@ApiTags('driver')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('driver')
export class DriverController {
  constructor(private app: DriverAppService, private devices: DriverDevicesService, private sheets: DriverSheetService) {}

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

  @Post('profile')
  @Roles(RoleName.CHAUFFEUR)
  @UseGuards(DriverDeviceGuard)
  profile(@Body() dto: UpdateProfileDto, @CurrentUser() user: any) {
    return this.app.updateProfile(user.userId, dto.phone);
  }

  @Get('vehicles')
  @Roles(RoleName.CHAUFFEUR)
  @UseGuards(DriverDeviceGuard)
  vehicles(@CurrentUser() user: any) {
    return this.app.availableVehicles(user.userId);
  }

  @Post('takeover')
  @Roles(RoleName.CHAUFFEUR)
  @UseGuards(DriverDeviceGuard)
  takeover(@Body() dto: TakeoverDto, @CurrentUser() user: any) {
    return this.app.takeover(user.userId, dto.vehicleId, dto.reason, dto.note);
  }

  @Get('transmissions')
  @Roles(RoleName.CHAUFFEUR)
  @UseGuards(DriverDeviceGuard)
  async transmissions(@CurrentUser() user: any) {
    return this.app.transmissions(user.userId);
  }

  @Get('history')
  @Roles(RoleName.CHAUFFEUR)
  @UseGuards(DriverDeviceGuard)
  async missionHistory(@Query('page') page: string | undefined, @Query('q') q: string | undefined, @CurrentUser() user: any) {
    return this.app.missionHistory(user.userId, page ? Number(page) : 1, q);
  }

  @Get('trips/:id/timeline')
  @Roles(RoleName.CHAUFFEUR)
  @UseGuards(DriverDeviceGuard)
  async timeline(@Param('id') id: string, @CurrentUser() user: any) {
    return this.app.timeline(user.userId, id);
  }

  @Get('sheet')
  @Roles(RoleName.CHAUFFEUR)
  @UseGuards(DriverDeviceGuard)
  sheet(@Query('date') date: string | undefined, @CurrentUser() user: any) {
    return this.app.sheet(user.userId, date);
  }

  @Post('sheet/send')
  @Roles(RoleName.CHAUFFEUR)
  @UseGuards(DriverDeviceGuard)
  sendSheet(@Body() dto: SendSheetDto, @CurrentUser() user: any) {
    return this.app.sendSheet(user.userId, dto.date);
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
  constructor(private devices: DriverDevicesService, private history: DriverHistoryService, private sheets: DriverSheetService) {}

  @Get('overview')
  overview(@CurrentUser() actor: any, @Query('siteId') siteId?: string) {
    return this.devices.overview(actor, siteId);
  }

  @Post('link')
  link(@Body() dto: LinkDriverDto, @CurrentUser() actor: any) {
    return this.devices.link(dto.driverId, dto.email, actor);
  }

  @Post('invite')
  invite(@Body() dto: InviteDto, @CurrentUser() actor: any) {
    return this.devices.invite(dto.driverId, dto.appUrl, actor, actor.organizationId);
  }

  @Post('provision')
  provision(@Body() dto: ProvisionDeviceDto, @CurrentUser() actor: any) {
    return this.devices.provision(dto.driverId, actor);
  }

  @Post('devices/:id/block')
  block(@Param('id') id: string, @Body() dto: DeviceReasonDto, @CurrentUser() actor: any) {
    return this.devices.setStatus(id, 'BLOCKED', dto.reason, actor);
  }

  @Post('devices/:id/transfer')
  transfer(@Param('id') id: string, @Body() dto: TransferDeviceDto, @CurrentUser() actor: any) {
    return this.devices.transfer(id, dto.driverId, dto.reason, actor);
  }

  @Post('devices/:id/unblock')
  unblock(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.devices.setStatus(id, 'ACTIVE', 'Déblocage', actor);
  }

  @Post('devices/:id/revoke')
  revoke(@Param('id') id: string, @Body() dto: DeviceReasonDto, @CurrentUser() actor: any) {
    return this.devices.setStatus(id, 'REVOKED', dto.reason, actor);
  }

  @Get('expenses')
  expenses(@Query('status') status: string | undefined, @Query('siteId') siteId: string | undefined, @CurrentUser() actor: any) {
    return this.sheets.listExpenses(actor.role === 'SUPER_ADMIN' ? siteId : actor.siteId ?? siteId, status);
  }

  @Post('expenses/:id/decision')
  decideExpense(@Param('id') id: string, @Body() dto: ExpenseDecisionDto, @CurrentUser() actor: any) {
    return this.sheets.decideExpense(id, dto.decision, dto.note, actor.userId);
  }

  @Post('sheets/process')
  processSheet(@Body() dto: ProcessSheetDto, @CurrentUser() actor: any) {
    return this.sheets.processSheet(dto.driverId, dto.date, dto.note, actor.userId);
  }

  @Get('missions')
  missions(@Query() q: Record<string, string>, @CurrentUser() actor: any) {
    return this.sheets.missions({ ...q, siteId: actor.role === 'SUPER_ADMIN' ? q.siteId : actor.siteId ?? q.siteId, page: q.page ? Number(q.page) : 1 });
  }

  @Get('trips/:id/timeline')
  tripTimeline(@Param('id') id: string) {
    return this.sheets.timeline(id);
  }

  @Get('board')
  board(@Query('date') date: string | undefined, @Query('siteId') siteId: string | undefined, @CurrentUser() actor: any) {
    return this.sheets.board(actor.role === 'SUPER_ADMIN' ? siteId : actor.siteId ?? siteId, date);
  }

  @Get('sheets')
  sheetsOfDay(@Query('date') date: string | undefined, @Query('siteId') siteId: string | undefined, @CurrentUser() actor: any) {
    return this.sheets.listForDay(actor.role === 'SUPER_ADMIN' ? siteId : actor.siteId ?? siteId, date, actor.userId);
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
