import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SimulationService } from './simulation.service';

@ApiTags('simulation')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('simulation')
export class SimulationController {
  constructor(private service: SimulationService) {}

  @Post('setup')
  @Roles(RoleName.SUPER_ADMIN)
  setup(@Body() body: { appUrl: string }, @CurrentUser() actor: any) {
    return this.service.setup(body?.appUrl, actor);
  }
}
