import { AsyncLocalStorage } from 'async_hooks';

// Contexte de la requête en cours, lu par le cloisonnement central de PrismaService (src/common/tenant-scope.ts).
// - organizationId : l'entreprise de l'utilisateur connecté (toujours renseignée pour un utilisateur connecté) ;
// - siteId : son site, s'il est rattaché à un site (sinon il voit tous les sites de SON entreprise) ;
// - siteIds : sites autorisés, calculés à la première requête en base puis gardés pour la requête ;
// - bypass : réservé aux contrôles internes du cloisonnement (lectures de vérification).
// Le contexte est vide pour les traitements internes (tâches planifiées, démarrage) : pas de cloisonnement.
export interface RequestContext {
  userId?: string;
  organizationId?: string;
  siteId?: string;
  role?: string;
  siteIds?: string[];
  bypass?: boolean;
  expectedVersion?: number;
  expectedTarget?: string;
  versionUsed?: boolean;
}
export const requestContext = new AsyncLocalStorage<RequestContext>();
