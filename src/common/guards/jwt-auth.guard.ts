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

  // Le Directeur Général est en lecture seule : aucune création, modification ni suppression,
  // sauf sa photo, son mot de passe, sa déconnexion et la gestion des comptes de ses responsables
  // (création, invitation, modification, suspension via /staff). La hiérarchie (canManageRole)
  // limite ces écritures aux seuls rôles qu'il encadre.
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const u = super.handleRequest(err, user, info, context);
    // Mot de passe provisoire : tant qu'il n'est pas changé, seules les routes de compte (/auth/…) répondent.
    if (u && u.mustChangePassword) {
      const req = context.switchToHttp().getRequest();
      if (!String(req.path || '').startsWith('/auth/')) throw new ForbiddenException('Changez d\'abord votre mot de passe provisoire.');
    }
    if (u && u.role === 'DIRECTEUR_GENERAL') {
      const req = context.switchToHttp().getRequest();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !String(req.path || '').startsWith('/auth/') && req.path !== '/support/reports' && !(req.method === 'PATCH' && /^\/notifications\/[^/]+\/read$/.test(String(req.path || ''))) && !JwtAuthGuard.dgStaffWrite(req.method, String(req.path || ''))) {
        throw new ForbiddenException('Le Directeur Général a un accès en lecture seule.');
      }
    }
    return u;
  }

  // Écritures autorisées au DG sur les comptes de ses responsables (jamais sur les rapports du personnel).
  static dgStaffWrite(method: string, path: string): boolean {
    if (path.startsWith('/staff/reports')) return false;
    if (method === 'POST' && (path === '/staff' || path === '/staff/invite' || /^\/staff\/[^/]+\/status$/.test(path))) return true;
    if (method === 'PATCH' && /^\/staff\/[^/]+$/.test(path)) return true;
    return false;
  }
}
