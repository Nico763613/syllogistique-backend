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
import { currentOrganizationId } from '../common/tenant-scope';
import { orgDocCode } from '../common/doc-numbers';

class SignupDto {
  @IsString() @MinLength(2) @MaxLength(60) firstName: string;
  @IsString() @MinLength(2) @MaxLength(60) lastName: string;
  @IsString() @MinLength(8) @MaxLength(30) phone: string;
  @IsOptional() @IsIn(['TRUCK', 'SERVICE_VEHICLE']) activity?: string;
  // Code de l'entreprise inscrit dans le lien d'inscription (?entreprise=VTX)
  @IsOptional() @IsString() @MaxLength(12) company?: string;
}

// Inscription libre d'un chauffeur (nom, prénom, téléphone) : la demande attend la validation du responsable.
// Aucun compte n'est créé tant qu'elle n'est pas approuvée ; l'approbation crée la fiche chauffeur, puis le responsable
// génère le QR d'accès (invitation) depuis la liste des chauffeurs.
@ApiTags('driver-signup')
@Controller('driver-signup')
export class SignupController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Chaque demande est rattachée à une entreprise (migration 0005) : celle dont le code figure dans le lien
  // d'inscription, sinon l'entreprise principale (la plus ancienne), comme avant. Une entreprise ne voit,
  // n'approuve et ne refuse que ses propres demandes.
  private async mainOrganizationId(): Promise<string | null> {
    // Lecture directe (hors filtre) : entreprise principale de toute la plateforme.
    const rows = await this.prisma.$queryRaw<{ o: string }[]>`select organization_id as o from sites order by created_at asc limit 1`;
    return rows[0]?.o ?? null;
  }

  private async organizationOfCode(code?: string): Promise<string | null> {
    const c = (code || '').trim().toUpperCase();
    if (c && /^[A-Z0-9]{2,12}$/.test(c)) {
      try {
        const rows = await this.prisma.$queryRaw<{ id: string }[]>`select id from organizations where doc_code = ${c} limit 1`;
        if (rows[0]) return rows[0].id;
      } catch { /* migration 0004 absente */ }
    }
    return this.mainOrganizationId();
  }

  private async firstSiteOf(orgId: string | null): Promise<string | null> {
    if (!orgId) return null;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`select id from sites where organization_id = ${orgId} order by created_at asc limit 1`;
    return rows[0]?.id ?? null;
  }

  // Entreprise de l'utilisateur connecté (les demandes sans entreprise appartiennent à l'entreprise principale).
  private async callerOrganization(): Promise<{ org: string; main: string | null }> {
    const org = currentOrganizationId();
    if (!org) throw new NotFoundException('Demande introuvable ou déjà traitée.');
    return { org, main: await this.mainOrganizationId() };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post()
  async request(@Body() dto: SignupDto) {
    const digits = dto.phone.replace(/\D/g, '');
    if (digits.length < 8) throw new BadRequestException('Numéro de téléphone invalide.');
    const last9 = digits.slice(-9);
    const orgId = await this.organizationOfCode(dto.company);
    if (!orgId) throw new BadRequestException('Inscription impossible pour le moment.');
    const rows = await this.prisma.$queryRaw<{ phone: string }[]>`select phone from driver_signups where status = 'PENDING' and organization_id = ${orgId}`;
    if (rows.some((r) => r.phone.replace(/\D/g, '').slice(-9) === last9)) {
      return { ok: true, message: "Votre demande est déjà enregistrée. Le responsable va la valider." };
    }
    const id = randomUUID();
    await this.prisma.$executeRaw`insert into driver_signups (id, first_name, last_name, phone, activity, organization_id) values (${id}, ${dto.firstName.trim()}, ${dto.lastName.trim()}, ${dto.phone.trim()}, ${dto.activity ?? null}, ${orgId})`;
    const siteId = await this.firstSiteOf(orgId);
    for (const roleName of ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'SUPER_ADMIN']) {
      await this.prisma.notification
        .create({ data: { title: "Demande d'inscription chauffeur", message: `${dto.firstName.trim()} ${dto.lastName.trim()} (${dto.phone.trim()}) demande à s'inscrire comme chauffeur.`, severity: 'INFO', entity: 'DriverSignup', entityId: id, roleName, siteId: siteId ?? undefined } })
        .catch(() => undefined);
    }
    return { ok: true, message: "Demande envoyée. Le responsable va la valider puis vous remettre votre code d'accès." };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  @Get()
  async list() {
    const org = currentOrganizationId();
    if (!org) return [];
    const main = await this.mainOrganizationId();
    return this.prisma.$queryRaw`select id, first_name as "firstName", last_name as "lastName", phone, activity, status, created_at as "createdAt" from driver_signups where status = 'PENDING' and coalesce(organization_id, ${main}) = ${org} order by created_at desc limit 100`;
  }

  // Lien d'inscription propre à l'entreprise, à partager aux chauffeurs (WhatsApp, affiche, QR).
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  @Get('link')
  async link() {
    const org = currentOrganizationId();
    if (!org) throw new NotFoundException();
    const code = await orgDocCode(this.prisma as any, org);
    return { code, path: code ? `/?entreprise=${encodeURIComponent(code)}` : '/' };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  @Post(':id/approve')
  async approve(@Param('id') id: string, @CurrentUser() actor: any) {
    const { org, main } = await this.callerOrganization();
    const r = (await this.prisma.$queryRaw<any[]>`select * from driver_signups where id = ${id} and status = 'PENDING' and coalesce(organization_id, ${main}) = ${org}`)[0];
    if (!r) throw new NotFoundException('Demande introuvable ou déjà traitée.');
    // Site du responsable, sinon le premier site de SON entreprise (jamais celui d'une autre entreprise).
    const siteId = actor.siteId || (await this.firstSiteOf(org));
    if (!siteId) throw new BadRequestException('Aucun site configuré.');
    const driver = await this.prisma.driver.create({ data: { siteId, firstName: r.first_name, lastName: r.last_name, phone: r.phone, activity: r.activity ?? undefined } });
    await this.prisma.$executeRaw`update driver_signups set status = 'APPROVED', decided_by = ${actor.userId}, decided_at = now(), driver_id = ${driver.id} where id = ${id}`;
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'Driver', entityId: driver.id, newValue: { via: 'inscription' } });
    return { driverId: driver.id };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE)
  @Post(':id/reject')
  async reject(@Param('id') id: string, @CurrentUser() actor: any) {
    const { org, main } = await this.callerOrganization();
    const n = await this.prisma.$executeRaw`update driver_signups set status = 'REJECTED', decided_by = ${actor.userId}, decided_at = now() where id = ${id} and status = 'PENDING' and coalesce(organization_id, ${main}) = ${org}`;
    if (!n) throw new NotFoundException('Demande introuvable ou déjà traitée.');
    return { ok: true };
  }
}
