// Utilisateur authentifié (injecté par JwtStrategy dans request.user)
export interface Actor {
  userId: string;
  role: string;
  siteId?: string;
  department?: string;
}

// Rôles « direction commerciale » : ils valident (caisse, retours, annulations) sans seuil
export const COMMERCIAL_MANAGERS = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_COMMERCIAL'];
export const isCommercialManager = (actor: { role: string }): boolean => COMMERCIAL_MANAGERS.includes(actor.role);

export const toNumber = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
