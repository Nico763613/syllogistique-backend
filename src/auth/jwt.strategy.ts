import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { accountStateCache } from './account-state';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: string;
  organizationId: string;
  siteId?: string;
  department?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // Le jeton seul ne suffit pas : un compte suspendu, supprimé ou désactivé perd l'accès immédiatement
    // (au plus 20 s de mémoire), sans attendre l'expiration du jeton.
    let st = accountStateCache.get(payload.sub);
    if (!st) {
      const u = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { status: true, deletedAt: true, mustChangePassword: true } });
      accountStateCache.set(payload.sub, { active: !!u && u.status === 'ACTIVE' && !u.deletedAt, mustChangePassword: !!u?.mustChangePassword });
      st = accountStateCache.get(payload.sub)!;
    }
    if (!st.active) throw new UnauthorizedException('Ce compte est suspendu ou désactivé.');
    // Injecté dans request.user — utilisé par RolesGuard et @CurrentUser()
    return {
      mustChangePassword: st.mustChangePassword,
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
      siteId: payload.siteId,
      department: payload.department,
    };
  }
}
