import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: any) {
    return this.usersService.create(dto, actor.organizationId, actor.userId);
  }

  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.LECTEUR)
  findAll(@CurrentUser() actor: any) {
    return this.usersService.findAll(actor.organizationId);
  }

  @Get(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: any) {
    return this.usersService.update(id, dto, actor.userId);
  }

  @Post(':id/reset-password')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @CurrentUser() actor: any) {
    return this.usersService.resetPassword(id, dto.newPassword, actor.userId);
  }

  @Delete(':id')
  @Roles(RoleName.SUPER_ADMIN)
  remove(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.usersService.remove(id, actor.userId);
  }
}
