import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RoleName } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { randomUUID } from 'crypto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

class SignupDto {
  @IsString() @MinLength(2) @MaxLength(60) firstName: string;
  @IsString() @MinLength(2) @MaxLength(60) lastName: string;
  @IsString() @MinLength(8) @MaxLength(30) phone: string;
  @IsOptional() @IsIn(['TRUCK', 'SERVICE_VEHICLE']) activity?: string;
}

// Inscription libre d'un chauffeur (nom, prénom, téléphone) : la demande attend la validation du responsable.
// Aucun compte n'est créé tant qu'elle n'est pas approuvée ; l'approbation crée la fiche chauffeur, puis le responsable
// génère le QR d'accès (invitation) depuis la liste des chauffeurs.
@ApiTags('driver-signup')
@Controller('driver-signup')
export class SignupController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post()
  async request(@Body() dto: SignupDto) {
    const digits = dto.phone.replace(/\D/g, '');
    if (digits.length < 8) throw new BadRequestException('Numéro de téléphone invalide.');
    const last9 = digits.slice(-9);
    const rows = await this.prisma.$queryRaw<{ phone: string }[]>`select phone from driver_signups where status = 'PENDING'`;
    if (rows.some((r) => r.phone.replace(/\D/g, '').slice(-9) === last9)) {
      return { ok: true, message: "Votre demande est déjà enregistrée. Le responsable va la valider." };
    }
    const id = randomUUID();
    await this.prisma.$executeRaw`insert into driver_signups (id, first_name, last_name, phone, activity) values (${id}, ${dto.firstName.trim()}, ${dto.lastName.trim()}, ${dto.phone.trim()}, ${dto.activity ?? null})`;
    for (const roleName of ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'SUPER_ADMIN']) {
      await this.prisma.notification
        .create({ data: { title: "Demande d'inscription chauffeur", message: `${dto.firstName.trim()} ${dto.lastName.trim()} (${dto.phone.trim()}) demande à s'inscrire comme chauffeur.`, severity: 'INFO', entity: 'DriverSignup', entityId: id, roleName } })
        .catch(() => undefined);
    }
    return { ok: true, message: "Demande envoyée. Le responsable va la valider puis vous remettre votre code d'accès." };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  @Get()
  list() {
    return this.prisma.$queryRaw`select id, first_name as "firstName", last_name as "lastName", phone, activity, status, created_at as "createdAt" from driver_signups where status = 'PENDING' order by created_at desc limit 100`;
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  @Post(':id/approve')
  async approve(@Param('id') id: string, @CurrentUser() actor: any) {
    const r = (await this.prisma.$queryRaw<any[]>`select * from driver_signups where id = ${id} and status = 'PENDING'`)[0];
    if (!r) throw new NotFoundException('Demande introuvable ou déjà traitée.');
    const site = actor.siteId ? { id: actor.siteId } : await this.prisma.site.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!site) throw new BadRequestException('Aucun site configuré.');
    const driver = await this.prisma.driver.create({ data: { siteId: site.id, firstName: r.first_name, lastName: r.last_name, phone: r.phone, activity: r.activity ?? undefined } });
    await this.prisma.$executeRaw`update driver_signups set status = 'APPROVED', decided_by = ${actor.userId}, decided_at = now(), driver_id = ${driver.id} where id = ${id}`;
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'Driver', entityId: driver.id, newValue: { via: 'inscription' } });
    return { driverId: driver.id };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  @Post(':id/reject')
  async reject(@Param('id') id: string, @CurrentUser() actor: any) {
    const n = await this.prisma.$executeRaw`update driver_signups set status = 'REJECTED', decided_by = ${actor.userId}, decided_at = now() where id = ${id} and status = 'PENDING'`;
    if (!n) throw new NotFoundException('Demande introuvable ou déjà traitée.');
    return { ok: true };
  }
}
