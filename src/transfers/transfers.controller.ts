import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TransfersService } from './transfers.service';
import { CancelTransferDto, CreateTransferDto, ReceiveTransferDto } from './dto/transfer.dto';

@ApiTags('transfers')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('STOCK')
@Controller('transfers')
export class TransfersController {
  constructor(private service: TransfersService) {}

  @Get()
  findAll(@CurrentUser() actor: any, @Query('siteId') siteId?: string, @Query('status') status?: string) {
    return this.service.findAll(actor, { siteId, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.service.findOne(id, actor);
  }

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  create(@Body() dto: CreateTransferDto, @CurrentUser() actor: any) {
    return this.service.create(dto, actor);
  }

  @Post(':id/receive')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  receive(@Param('id') id: string, @Body() dto: ReceiveTransferDto, @CurrentUser() actor: any) {
    return this.service.receive(id, dto, actor);
  }

  @Post(':id/cancel')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  cancel(@Param('id') id: string, @Body() dto: CancelTransferDto, @CurrentUser() actor: any) {
    return this.service.cancel(id, dto, actor);
  }
}
