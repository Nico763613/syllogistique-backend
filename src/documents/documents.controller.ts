import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, RenewDocumentDto, UpdateDocumentDto } from './dto/document.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('LOGISTIQUE')
@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  create(@Body() dto: CreateDocumentDto, @CurrentUser() actor: any) {
    return this.documentsService.create(dto, actor);
  }

  // ex: GET /documents?vehicleId=…  ou  GET /documents?expiringInDays=30
  @Get()
  findAll(
    @Query('vehicleId') vehicleId?: string,
    @Query('type') type?: string,
    @Query('expiringInDays') expiringInDays?: string,
    @Query('history') history?: string,
    @CurrentUser() actor?: any,
  ) {
    return this.documentsService.findAll(actor, {
      vehicleId,
      type,
      history: history === 'true',
      expiringInDays: expiringInDays !== undefined && expiringInDays !== '' ? Number(expiringInDays) : undefined,
    });
  }

  @Get('compliance')
  compliance(@CurrentUser() actor: any) {
    return this.documentsService.compliance(actor);
  }

  @Post(':id/renew')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  renew(@Param('id') id: string, @Body() dto: RenewDocumentDto, @CurrentUser() actor: any) {
    return this.documentsService.renew(id, dto, actor);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto, @CurrentUser() actor: any) {
    return this.documentsService.update(id, dto, actor);
  }
}
