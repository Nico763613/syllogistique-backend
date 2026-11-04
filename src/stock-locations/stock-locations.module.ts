import { Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { RoleName } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Departments } from '../common/decorators/departments.decorator';

export class CreateLocationDto {
  @IsString() siteId: string;
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() zone?: string;
}
export class UpdateLocationDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() zone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
export class StockLocationsService {
  constructor(private prisma: PrismaService) {}
  list(siteId?: string) {
    return this.prisma.stockLocation.findMany({ where: siteId ? { siteId } : {}, orderBy: [{ zone: 'asc' }, { code: 'asc' }] });
  }
  async create(dto: CreateLocationDto) {
    const dup = await this.prisma.stockLocation.findFirst({ where: { siteId: dto.siteId, code: dto.code } });
    if (dup) throw new ConflictException('Ce code emplacement existe déjà sur ce site.');
    return this.prisma.stockLocation.create({ data: dto });
  }
  async update(id: string, dto: UpdateLocationDto) {
    const l = await this.prisma.stockLocation.findUnique({ where: { id } });
    if (!l) throw new NotFoundException('Emplacement introuvable.');
    return this.prisma.stockLocation.update({ where: { id }, data: dto });
  }
}

@ApiTags('stock-locations')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Departments('STOCK')
@Controller('stock-locations')
export class StockLocationsController {
  constructor(private service: StockLocationsService) {}
  @Get() list(@Query('siteId') siteId?: string) { return this.service.list(siteId); }
  @Post() @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  create(@Body() dto: CreateLocationDto) { return this.service.create(dto); }
  @Patch(':id') @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.MAGASINIER)
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto) { return this.service.update(id, dto); }
}

@Module({ controllers: [StockLocationsController], providers: [StockLocationsService] })
export class StockLocationsModule {}
