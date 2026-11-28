import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Injectable, Module, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { createHash, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { forgetOrgSites } from '../common/tenant-scope';

class CreateOrganizationDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsString() @MinLength(2) @MaxLength(120) siteName: string;
  @IsOptional() @IsString() @MaxLength(120) siteLocation?: string;
  @IsString() @MinLength(2) @MaxLength(80) adminFirstName: string;
  @IsString() @MinLength(2) @MaxLength(80) adminLastName: string;
  @IsEmail() @MaxLength(160) adminEmail: string;
  @IsOptional() @IsString() @MaxLength(30) adminPhone?: string;
  @IsString() @MinLength(8) @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Le mot de passe provisoire doit contenir des lettres et des chiffres.' })
  adminTemporaryPassword: string;
}

// Contrôle de la clé AVANT la validation du contenu : sans la bonne clé, aucune information
// (ni message de validation) n'est renvoyée.
@Injectable()
class PlatformKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const expected = process.env.PLATFORM_ADMIN_KEY || '';
    if (expected.length < 24) throw new NotFoundException();
    const a = createHash('sha256').update(String(req.headers['x-platform-key'] || '')).digest();
    const b = createHash('sha256').update(expected).digest();
    if (!timingSafeEqual(a, b)) throw new ForbiddenException('Clé plateforme invalide.');
    return true;
  }
}

// Accès « plateforme » (éditeur de SYL uniquement) : création d'une nouvelle entreprise cliente avec
// son premier site et son Super administrateur (mot de passe provisoire à changer à la 1re connexion).
// Protégé par la clé PLATFORM_ADMIN_KEY (en-tête x-platform-key), comparée en temps constant.
// Sans cette variable sur le serveur, la route n'existe pas (404).
@ApiTags('platform')
@Controller('platform')
export class PlatformController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(PlatformKeyGuard)
  @Post('organizations')
  async createOrganization(@Body() dto: CreateOrganizationDto) {
    const role = await this.prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
    if (!role) throw new NotFoundException('Rôle Super administrateur absent.');
    const email = dto.adminEmail.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ForbiddenException('Cette adresse e-mail est déjà utilisée.');
    const passwordHash = await bcrypt.hash(dto.adminTemporaryPassword, 10);
    const r = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: dto.name.trim() } });
      const site = await tx.site.create({ data: { organizationId: org.id, name: dto.siteName.trim(), location: dto.siteLocation?.trim() } });
      const admin = await tx.user.create({
        data: {
          organizationId: org.id, siteId: null, roleId: role.id, email, phone: dto.adminPhone?.trim() || null,
          firstName: dto.adminFirstName.trim(), lastName: dto.adminLastName.trim(), passwordHash, mustChangePassword: true,
        },
      });
      return { organizationId: org.id, siteId: site.id, adminUserId: admin.id };
    });
    forgetOrgSites(r.organizationId);
    await this.audit.log({ userId: r.adminUserId, action: 'CREATE', entity: 'Organization', entityId: r.organizationId, newValue: { name: dto.name, via: 'plateforme' } }).catch(() => undefined);
    return { ...r, message: 'Entreprise créée. Le Super administrateur devra changer son mot de passe provisoire à la première connexion.' };
  }
}

@Module({ controllers: [PlatformController] })
export class PlatformModule {}
