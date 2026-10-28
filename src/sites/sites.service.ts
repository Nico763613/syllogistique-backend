import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';

// Multi-site (§39) : Organisation → Site. Un site peut être désactivé, jamais supprimé.
@Injectable()
export class SitesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  findAll(organizationId: string) {
    return this.prisma.site.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
  }

  async findOne(id: string, organizationId: string) {
    const site = await this.prisma.site.findFirst({ where: { id, organizationId } });
    if (!site) throw new NotFoundException('Site introuvable.');
    return site;
  }

  async create(dto: CreateSiteDto, organizationId: string, actorId: string) {
    const site = await this.prisma.site.create({ data: { ...dto, organizationId } });
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Site', entityId: site.id, newValue: dto });
    return site;
  }

  async update(id: string, dto: UpdateSiteDto, organizationId: string, actorId: string) {
    const old = await this.findOne(id, organizationId);
    const site = await this.prisma.site.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'Site', entityId: id, oldValue: old, newValue: dto });
    return site;
  }
}
