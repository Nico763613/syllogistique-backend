import { Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

// Appareils autorisés par utilisateur : seul le Super administrateur libère une place (changement d'appareil).
@ApiTags('user-devices')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(RoleName.SUPER_ADMIN)
@Controller('user-devices')
export class UserDevicesController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get()
  list() {
    return this.prisma.$queryRaw`select d.id, d.kind, d.name, d.status, d.attempts, d.first_seen as "firstSeen", d.last_seen as "lastSeen", u.first_name as "firstName", u.last_name as "lastName", r.name::text as role
      from user_devices d join users u on u.id = d.user_id join roles r on r.id = u.role_id where d.status in ('ACTIVE','REFUSED','BLOCKED') order by d.last_seen desc limit 300`;
  }

  @Post(':id/release')
  async release(@Param('id') id: string, @CurrentUser() actor: any) {
    const n = await this.prisma.$executeRaw`update user_devices set status = 'REVOKED', attempts = 0 where id = ${id}`;
    if (!n) throw new NotFoundException('Appareil introuvable.');
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'UserDevice', entityId: id, newValue: { status: 'REVOKED' } });
    return { ok: true };
  }
}
