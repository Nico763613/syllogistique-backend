import { accountStateCache } from '../auth/account-state';
import { canManageRole, hierarchyMessage } from '../common/hierarchy';
import { Injectable, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Seul l'Administrateur Général peut créer, modifier ou réinitialiser un compte Administrateur Général
  // ou attribuer ce rôle : empêche un administrateur logistique de prendre le contrôle de la plateforme.
  private assertCanManage(actorRole: string | undefined, targetRole?: string | null, requestedRole?: string | null) {
    if (actorRole === 'SUPER_ADMIN') return;
    if (targetRole === 'SUPER_ADMIN' || requestedRole === 'SUPER_ADMIN') {
      throw new ForbiddenException('Seul l\'Administrateur Général peut gérer un compte Administrateur Général.');
    }
    // Hiérarchie : chacun ne gère que les rôles de son domaine (voir common/hierarchy.ts)
    for (const r of [targetRole, requestedRole]) {
      if (r && !canManageRole(actorRole, r)) throw new ForbiddenException(hierarchyMessage(actorRole));
    }
  }

  private clean(u: any) {
    if (!u) return u;
    const { passwordHash, refreshTokenHash, ...rest } = u;
    return rest;
  }

  async create(dto: CreateUserDto, organizationId: string, actorId: string, actorRole?: string) {
    this.assertCanManage(actorRole, null, dto.role);
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Cet email est déjà utilisé.');

    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new NotFoundException('Rôle introuvable.');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        organizationId,
        siteId: dto.siteId,
        department: dto.department ?? undefined,
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

  async update(id: string, dto: UpdateUserDto, actorId: string, actorRole?: string) {
    const before = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!before) throw new NotFoundException('Utilisateur introuvable.');
    this.assertCanManage(actorRole, before.role?.name, dto.role);

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
        ...((dto.status && dto.status !== 'ACTIVE') || roleId ? { refreshTokenHash: null } : {}),
        siteId: dto.siteId,
        department: dto.department,
        roleId,
      },
      include: { role: true },
    });
    accountStateCache.forget(id);

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      oldValue: this.clean(before),
      newValue: dto,
    });

    const { passwordHash, refreshTokenHash, ...safe } = user;
    return safe;
  }

  async remove(id: string, actorId: string) {
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: 'DISABLED', refreshTokenHash: null } });
    accountStateCache.forget(id);
    await this.audit.log({ userId: actorId, action: 'DELETE', entity: 'User', entityId: id });
    return { success: true };
  }

  // Réinitialisation du mot de passe par un administrateur (utilisateur qui a oublié le sien).
  // Les sessions existantes sont invalidées (refresh token supprimé).
  async resetPassword(id: string, newPassword: string, actorId: string, actorRole?: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    this.assertCanManage(actorRole, user.role?.name);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    // Mot de passe donné par l'administrateur : l'utilisateur devra le changer à sa prochaine connexion
    await this.prisma.user.update({ where: { id }, data: { passwordHash, refreshTokenHash: null, mustChangePassword: true } });
    accountStateCache.forget(id);
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'User', entityId: id, newValue: { passwordReset: true } });
    return { message: 'Mot de passe réinitialisé. Communiquez-le à l\'utilisateur et demandez-lui de le changer.' };
  }

  async revokeSessions(id: string, actorId: string, actorRole?: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    this.assertCanManage(actorRole, user.role?.name);
    await this.prisma.user.update({ where: { id }, data: { refreshTokenHash: null } });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'User', entityId: id, newValue: { sessionsRevoked: true } });
    return { message: "Sessions fermées. L'utilisateur devra se reconnecter (au plus tard dans 15 minutes). Son compte et ses données sont intacts." };
  }

  async revokeAllSessions(organizationId: string, actorId: string) {
    const r = await this.prisma.user.updateMany({ where: { organizationId, deletedAt: null, id: { not: actorId } }, data: { refreshTokenHash: null } });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'User', entityId: actorId, newValue: { allSessionsRevoked: r.count } });
    return { message: r.count + ' session(s) fermée(s). Aucun compte ni donnée n\'a été modifié.', count: r.count };
  }
}
