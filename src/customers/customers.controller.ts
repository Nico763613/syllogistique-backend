import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('STOCK')
@Controller('customers')
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER, RoleName.RESPONSABLE_COMMERCIAL)
  create(@Body() dto: CreateCustomerDto, @CurrentUser() actor: any) {
    return this.customersService.create(dto, actor.userId);
  }

  @Get()
  findAll(@Query('siteId') siteId?: string) {
    return this.customersService.findAll(siteId);
  }

  // Vérification en direct pendant la saisie (nom / téléphone)
  @Get('check-duplicates')
  check(@Query('siteId') siteId: string, @Query('name') name?: string, @Query('phone') phone?: string) {
    return this.customersService.findDuplicates(siteId, name, phone);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER, RoleName.RESPONSABLE_COMMERCIAL)
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() actor: any) {
    return this.customersService.update(id, dto, actor.userId);
  }
}
