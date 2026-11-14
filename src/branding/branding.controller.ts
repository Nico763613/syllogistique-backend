import { Body, Controller, Get, NotFoundException, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

class UpdateBrandingDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(300) logoUrl?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Couleur invalide (ex. #163A5F).' }) brandColor?: string;
}

// Personnalisation à la marque de l'entreprise cliente : nom, logo, couleur principale.
// GET public : l'écran de connexion s'affiche déjà au nom de l'entreprise (une entreprise par installation).
@ApiTags('branding')
@Controller('branding')
export class BrandingController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Public()
  @Get()
  async get() {
    const o = await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    return { name: o?.name ?? 'SYL LOGISTIQUE', logoUrl: o?.logoUrl ?? null, brandColor: o?.brandColor ?? null };
  }

  @Patch()
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE)
  async update(@Body() dto: UpdateBrandingDto, @CurrentUser() user: any) {
    const org = await this.prisma.organization.findUnique({ where: { id: user.organizationId } });
    if (!org) throw new NotFoundException('Entreprise introuvable.');
    const logoUrl = dto.logoUrl === undefined ? undefined : dto.logoUrl === '' ? null : dto.logoUrl;
    const o = await this.prisma.organization.update({ where: { id: org.id }, data: { name: dto.name, logoUrl, brandColor: dto.brandColor } });
    await this.audit.log({ userId: user.userId, action: 'UPDATE', entity: 'Organization', entityId: org.id, newValue: { name: o.name, brandColor: o.brandColor } });
    return { name: o.name, logoUrl: o.logoUrl, brandColor: o.brandColor };
  }
}
