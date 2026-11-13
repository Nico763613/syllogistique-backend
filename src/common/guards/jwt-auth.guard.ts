import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  // Le Directeur Général est en lecture seule absolue : aucune création, modification ni suppression
  // (seuls sa photo, son mot de passe et sa déconnexion restent possibles).
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const u = super.handleRequest(err, user, info, context);
    if (u && u.role === 'DIRECTEUR_GENERAL') {
      const req = context.switchToHttp().getRequest();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !String(req.path || '').startsWith('/auth/')) {
        throw new ForbiddenException('Le Directeur Général a un accès en lecture seule.');
      }
    }
    return u;
  }
}
