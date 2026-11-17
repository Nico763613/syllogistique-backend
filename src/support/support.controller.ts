import { Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma.service';

class ReportDto {
  @IsOptional() @IsString() @MaxLength(500) message?: string;
  @IsOptional() @IsString() @MaxLength(120) screen?: string;
  @IsOptional() @IsString() @MaxLength(200) device?: string;
  @IsOptional() @IsString() @MaxLength(40) appVersion?: string;
  @IsOptional() @IsString() @MaxLength(40) network?: string;
  @IsOptional() @IsString() @MaxLength(500) lastError?: string;
}
class StatusDto {
  @IsIn(['NEW', 'IN_PROGRESS', 'SOLVED']) status: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

// Signalements : tout utilisateur connecté peut signaler un problème (le contexte part automatiquement) ;
// l'administrateur les suit (nouveau / en cours / résolu).
@ApiTags('support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private prisma: PrismaService) {}

  @Post('reports')
  async create(@Body() dto: ReportDto, @CurrentUser() user: any) {
    const u = await this.prisma.user.findUnique({ where: { id: user.userId }, include: { role: true } });
    const name = u ? `${u.firstName} ${u.lastName}` : 'Utilisateur';
    const r = await this.prisma.problemReport.create({
      data: { userId: user.userId, userName: name, role: user.role, screen: dto.screen, device: dto.device, appVersion: dto.appVersion, network: dto.network, lastError: dto.lastError, message: dto.message },
    });
    await this.prisma.notification
      .create({ data: { title: 'Nouveau signalement', message: `${name} (${user.role}) a signalé un problème${dto.screen ? ' sur « ' + dto.screen + ' »' : ''}.`, severity: 'WARNING', entity: 'ProblemReport', entityId: r.id, roleName: 'SUPER_ADMIN' } })
      .catch(() => undefined);
    return { id: r.id };
  }

  @Get('reports')
  @UseGuards(RolesGuard)
  @Roles(RoleName.SUPER_ADMIN)
  list() {
    return this.prisma.problemReport.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @Patch('reports/:id')
  @UseGuards(RolesGuard)
  @Roles(RoleName.SUPER_ADMIN)
  async setStatus(@Param('id') id: string, @Body() dto: StatusDto) {
    const r = await this.prisma.problemReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Signalement introuvable.');
    return this.prisma.problemReport.update({ where: { id }, data: { status: dto.status, note: dto.note ?? r.note } });
  }
}
