import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  create(@Body() dto: CreateDocumentDto, @CurrentUser() actor: any) {
    return this.documentsService.create(dto, actor.userId);
  }

  // ex: GET /documents?vehicleId=…  ou  GET /documents?expiringInDays=30
  @Get()
  findAll(
    @Query('vehicleId') vehicleId?: string,
    @Query('type') type?: string,
    @Query('expiringInDays') expiringInDays?: string,
  ) {
    return this.documentsService.findAll({
      vehicleId,
      type,
      expiringInDays: expiringInDays !== undefined && expiringInDays !== '' ? Number(expiringInDays) : undefined,
    });
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto, @CurrentUser() actor: any) {
    return this.documentsService.update(id, dto, actor.userId);
  }
}
