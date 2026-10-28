import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/expense.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('expenses')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class ExpensesController {
  constructor(private expensesService: ExpensesService) {}

  @Post('expenses')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  create(@Body() dto: CreateExpenseDto, @CurrentUser() actor: any) {
    return this.expensesService.create(dto, actor.userId);
  }

  @Get('expenses')
  findAll(
    @Query('vehicleId') vehicleId?: string,
    @Query('category') category?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.expensesService.findAll({ vehicleId, category, from, to });
  }

  // GET /costs/summary?siteId=…&from=2026-10-01&to=2026-10-31
  @Get('costs/summary')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.LECTEUR)
  costSummary(@Query('siteId') siteId: string, @Query('from') from: string, @Query('to') to: string, @CurrentUser() actor: any) {
    return this.expensesService.costSummary(siteId || actor.siteId, from, to);
  }
}
