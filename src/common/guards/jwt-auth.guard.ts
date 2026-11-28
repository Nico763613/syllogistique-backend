import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // Route publique : si un jeton valable est fourni, on reconnaît quand même l'utilisateur
      // (ex. /branding renvoie alors le nom et le logo de SA propre entreprise). Sans jeton ou jeton
      // invalide, la route reste accessible comme avant, sans utilisateur.
      const req = context.switchToHttp().getRequest();
      if (!req?.headers?.authorization) return true;
      try { return (await (super.canActivate(context) as Promise<boolean>)) || true; } catch { return true; }
    }
    return (await super.canActivate(context)) as boolean;
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
    // Moindre privilège pour le compte Chauffeur : il n'utilise que l'application chauffeur.
    // Il n'a donc accès qu'à ses propres écrans (/driver/…), à son compte (/auth/…), à l'envoi de photos
    // de reçus, à ses alertes et au signalement d'un problème. Les écrans du bureau (dépenses, carburant,
    // stock, clients…) lui sont refusés, même en consultation.
    if (u && u.role === 'CHAUFFEUR') {
      const req = context.switchToHttp().getRequest();
      const path = String(req.path || '');
      // Seule exception : déclarer un incident ou un presque-accident HSE (sans pouvoir lister ceux des autres).
      if (!JwtAuthGuard.driverAllowed(path) && !(req.method === 'POST' && path === '/hse/incidents')) throw new ForbiddenException('Le compte chauffeur ne donne accès qu\'à l\'application chauffeur.');
    }
    if (u && u.role === 'DIRECTEUR_GENERAL') {
      const req = context.switchToHttp().getRequest();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !String(req.path || '').startsWith('/auth/') && req.path !== '/support/reports' && !(req.method === 'PATCH' && /^\/notifications\/[^/]+\/read$/.test(String(req.path || ''))) && !JwtAuthGuard.dgStaffWrite(req.method, String(req.path || ''))) {
        throw new ForbiddenException('Le Directeur Général a un accès en lecture seule.');
      }
    }
    return u;
  }

  static driverAllowed(path: string): boolean {
    return /^\/(driver|auth|uploads|notifications|support)(\/|$)/.test(path) || ['/branding', '/license', '/health'].some((x) => path === x || path.startsWith(x + '/'));
  }

  // Écritures autorisées au DG sur les comptes de ses responsables (jamais sur les rapports du personnel).
  static dgStaffWrite(method: string, path: string): boolean {
    if (path.startsWith('/staff/reports')) return false;
    if (method === 'POST' && (path === '/staff' || path === '/staff/invite' || /^\/staff\/[^/]+\/status$/.test(path))) return true;
    if (method === 'PATCH' && /^\/staff\/[^/]+$/.test(path)) return true;
    return false;
  }
}
