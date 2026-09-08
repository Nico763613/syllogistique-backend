import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  create(@Body() dto: CreateCustomerDto, @CurrentUser() actor: any) {
    return this.customersService.create(dto, actor.userId);
  }

  @Get()
  findAll(@Query('siteId') siteId?: string) {
    return this.customersService.findAll(siteId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() actor: any) {
    return this.customersService.update(id, dto, actor.userId);
  }
}
