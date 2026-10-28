import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { SitesService } from './sites.service';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('sites')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('sites')
export class SitesController {
  constructor(private sitesService: SitesService) {}

  @Get()
  findAll(@CurrentUser() actor: any) {
    return this.sitesService.findAll(actor.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.sitesService.findOne(id, actor.organizationId);
  }

  @Post()
  @Roles(RoleName.SUPER_ADMIN)
  create(@Body() dto: CreateSiteDto, @CurrentUser() actor: any) {
    return this.sitesService.create(dto, actor.organizationId, actor.userId);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  update(@Param('id') id: string, @Body() dto: UpdateSiteDto, @CurrentUser() actor: any) {
    return this.sitesService.update(id, dto, actor.organizationId, actor.userId);
  }
}
