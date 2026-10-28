import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: CreateUserDto, organizationId: string, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Cet email est déjà utilisé.');

    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new NotFoundException('Rôle introuvable.');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        organizationId,
        siteId: dto.siteId,
        roleId: role.id,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
      },
      include: { role: true },
    });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      newValue: { email: user.email, role: role.name },
    });

    const { passwordHash: _omit, refreshTokenHash: _omit2, ...safe } = user;
    return safe;
  }

  async findAll(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null },
      include: { role: true, site: true },
      orderBy: { createdAt: 'desc' },
    });
    return users.map(({ passwordHash, refreshTokenHash, ...u }) => u);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true, site: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    const { passwordHash, refreshTokenHash, ...safe } = user;
    return safe;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Utilisateur introuvable.');

    let roleId: string | undefined;
    if (dto.role) {
      const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
      roleId = role?.id;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        status: dto.status,
        siteId: dto.siteId,
        roleId,
      },
      include: { role: true },
    });

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      oldValue: before,
      newValue: dto,
    });

    const { passwordHash, refreshTokenHash, ...safe } = user;
    return safe;
  }

  async remove(id: string, actorId: string) {
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: 'DISABLED' } });
    await this.audit.log({ userId: actorId, action: 'DELETE', entity: 'User', entityId: id });
    return { success: true };
  }

  // Réinitialisation du mot de passe par un administrateur (utilisateur qui a oublié le sien).
  // Les sessions existantes sont invalidées (refresh token supprimé).
  async resetPassword(id: string, newPassword: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash, refreshTokenHash: null } });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'User', entityId: id, newValue: { passwordReset: true } });
    return { message: 'Mot de passe réinitialisé. Communiquez-le à l\'utilisateur et demandez-lui de le changer.' };
  }
}
