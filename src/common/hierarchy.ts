// Hiérarchie des comptes (contrôlée côté serveur) : qui peut créer, modifier, suspendre ou inviter quel rôle.
// L'administrateur principal (SUPER_ADMIN) garde tous les droits ; chaque responsable ne gère que son domaine.
export const MANAGEABLE_BY: Record<string, readonly string[]> = {
  DIRECTEUR_GENERAL: ['ADMIN_LOGISTIQUE', 'RESPONSABLE_OPERATIONS', 'COMPTABLE', 'GESTIONNAIRE_HSE', 'RESPONSABLE_COMMERCIAL', 'CAISSIER'],
  ADMIN_LOGISTIQUE: ['CHAUFFEUR', 'GESTIONNAIRE_FLOTTE', 'MAGASINIER', 'MECANICIEN', 'POINTEUR', 'LECTEUR'],
  GESTIONNAIRE_HSE: ['AGENT_HSE'],
};

export function canManageRole(actorRole: string | undefined, targetRole: string | null | undefined): boolean {
  if (actorRole === 'SUPER_ADMIN') return true;
  if (!actorRole || !targetRole) return false;
  return (MANAGEABLE_BY[actorRole] ?? []).includes(targetRole);
}

export function hierarchyMessage(actorRole: string | undefined): string {
  switch (actorRole) {
    case 'DIRECTEUR_GENERAL': return 'Le Directeur Général crée les comptes des responsables, pas ceux de la direction ni du personnel de terrain.';
    case 'ADMIN_LOGISTIQUE': return 'Le Responsable logistique gère uniquement le personnel logistique (chauffeurs, flotte, stock, atelier, pointage).';
    case 'GESTIONNAIRE_HSE': return 'Le responsable HSE gère uniquement les agents HSE.';
    default: return "Ce compte relève d'un niveau supérieur : vous n'avez pas le droit de le gérer.";
  }
}
