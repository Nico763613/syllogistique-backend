import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SimulationService } from './simulation.service';

// Réservé à l'administrateur principal
@ApiTags('simulation')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(RoleName.SUPER_ADMIN)
@Controller('simulation')
export class SimulationController {
  constructor(private service: SimulationService) {}

  @Get()
  status() { return this.service.status(); }

  @Post('setup')
  setup(@Body() dto: { appUrl: string }, @CurrentUser() actor: any) { return this.service.setup(dto?.appUrl, actor); }

  @Post('reset')
  reset(@Body() dto: { confirm: string }, @CurrentUser() actor: any) { return this.service.reset(dto?.confirm, actor); }
}
