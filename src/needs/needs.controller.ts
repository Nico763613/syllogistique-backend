import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { NeedsService } from './needs.service';
import { CreateNeedDto, SendNeedEmailDto, SetNeedStatusDto, UpdateNeedDto } from './dto/need.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const WRITERS = [RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MAGASINIER];

@ApiTags('needs')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('needs')
export class NeedsController {
  constructor(private service: NeedsService) {}

  @Get('suggestions')
  suggestions(@Query('siteId') siteId: string) {
    return this.service.suggestions(siteId);
  }

  @Get()
  list(@Query('siteId') siteId: string, @Query('status') status?: string) {
    return this.service.list(siteId, status);
  }

  @Post()
  @Roles(...WRITERS)
  create(@Body() dto: CreateNeedDto, @CurrentUser() actor: any) {
    return this.service.create(dto, actor.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(...WRITERS)
  update(@Param('id') id: string, @Body() dto: UpdateNeedDto, @CurrentUser() actor: any) {
    return this.service.update(id, dto, actor);
  }

  @Post(':id/status')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  setStatus(@Param('id') id: string, @Body() dto: SetNeedStatusDto, @CurrentUser() actor: any) {
    return this.service.setStatus(id, dto, actor.userId);
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @CurrentUser() actor: any, @Res() res: Response) {
    const buffer = await this.service.pdf(id, actor.userId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="etat_des_besoins_${id}.pdf"` });
    res.send(buffer);
  }

  @Get(':id/whatsapp')
  whatsapp(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.service.whatsapp(id, actor);
  }

  @Post(':id/send-email')
  @Roles(...WRITERS)
  email(@Param('id') id: string, @Body() dto: SendNeedEmailDto, @CurrentUser() actor: any) {
    return this.service.email(id, dto, actor.userId);
  }
}
