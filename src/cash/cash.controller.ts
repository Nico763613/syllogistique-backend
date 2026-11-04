import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CashService } from './cash.service';
import { CashExpenseDto, CloseCashSessionDto, OpenCashSessionDto } from './dto/cash.dto';

const CASH_ROLES = [RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.RESPONSABLE_COMMERCIAL, RoleName.CAISSIER];

@ApiTags('cash-sessions')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('cash-sessions')
export class CashController {
  constructor(private cash: CashService) {}

  @Post('open')
  @Roles(...CASH_ROLES)
  open(@Body() dto: OpenCashSessionDto, @CurrentUser() actor: any) {
    return this.cash.open(actor, dto);
  }

  // Ma caisse ouverte (null si aucune) avec les totaux en direct
  @Get('current')
  @Roles(...CASH_ROLES)
  current(@CurrentUser() actor: any) {
    return this.cash.current(actor);
  }

  @Get()
  @Roles(...CASH_ROLES, RoleName.LECTEUR)
  list(@CurrentUser() actor: any, @Query('siteId') siteId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.cash.list(actor, { siteId, from, to });
  }

  @Get(':id')
  @Roles(...CASH_ROLES, RoleName.LECTEUR)
  get(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.cash.get(id, actor);
  }

  @Post(':id/expenses')
  @Roles(...CASH_ROLES)
  addExpense(@Param('id') id: string, @Body() dto: CashExpenseDto, @CurrentUser() actor: any) {
    return this.cash.addExpense(id, dto, actor);
  }

  @Post(':id/close')
  @Roles(...CASH_ROLES)
  close(@Param('id') id: string, @Body() dto: CloseCashSessionDto, @CurrentUser() actor: any) {
    return this.cash.close(id, dto, actor);
  }

  @Post(':id/validate')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.RESPONSABLE_COMMERCIAL)
  validate(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.cash.validate(id, actor);
  }
}
