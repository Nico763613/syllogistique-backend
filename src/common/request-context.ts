import { AsyncLocalStorage } from 'async_hooks';

// Contexte de la requête en cours (site et rôle de l'utilisateur connecté), lu par le contrôle
// de cloisonnement de PrismaService. Vide pour les traitements internes (tâches planifiées, démarrage).
export interface RequestContext { siteId?: string; role?: string }
export const requestContext = new AsyncLocalStorage<RequestContext>();
