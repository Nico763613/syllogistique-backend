import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { requestContext } from '../request-context';

// Cloisonnement par site, appliqué à TOUTE l'API : un utilisateur rattaché à un site
// ne peut ni lire ni filtrer un autre site via le paramètre ?siteId=.
// - sans ?siteId : il est forcé sur le site de l'utilisateur ;
// - avec un autre site : 403.
// Le Super Admin (et les comptes sans site) restent libres de choisir.
@Injectable()
export class SiteScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (user && user.role !== 'SUPER_ADMIN' && user.siteId && req.query) {
      const asked = req.query.siteId;
      if (typeof asked === 'string' && asked && asked !== user.siteId) {
        throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
      }
      // Express 5 recalcule req.query à chaque lecture : une simple affectation serait perdue.
      // On remplace donc la propriété par un objet fixe qui contient le site de l'utilisateur.
      Object.defineProperty(req, 'query', {
        value: { ...req.query, siteId: user.siteId }, writable: true, configurable: true, enumerable: true,
      });
      const bodySite = req.body && typeof req.body === 'object' ? req.body.siteId : undefined;
      if (typeof bodySite === 'string' && bodySite && bodySite !== user.siteId) {
        throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
      }
    }
    // Le contexte suit tout le traitement de la requête : la base refuse ensuite l'accès par identifiant
    // à un élément d'un autre site (voir PrismaService).
    if (user && user.role !== 'SUPER_ADMIN' && user.siteId) {
      const ctx = { siteId: user.siteId as string, role: user.role as string };
      return new Observable((sub) => requestContext.run(ctx, () => next.handle().subscribe(sub)));
    }
    return next.handle();
  }
}
