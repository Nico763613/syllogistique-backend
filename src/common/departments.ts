// Départements (cahier des charges) : cloisonnement des ACTIONS (création / modification / suppression).
// La consultation (GET) reste ouverte aux utilisateurs connectés (listes de véhicules, chauffeurs, etc.).
// Un utilisateur sans département n'est pas restreint ; le SUPER_ADMIN (Administrateur Général) a toujours un accès global.
export const DEPARTMENTS = ['LOGISTIQUE', 'CARBURANT', 'STOCK', 'RH'] as const;
export type Department = (typeof DEPARTMENTS)[number];

// Entités synchronisées hors ligne → départements autorisés à les modifier
export const ENTITY_DEPARTMENTS: Record<string, Department[]> = {
  Trip: ['LOGISTIQUE', 'CARBURANT'],
  FuelTransaction: ['CARBURANT'],
  Maintenance: ['LOGISTIQUE'],
  DriverAttendance: ['RH', 'LOGISTIQUE'],
  InventoryItem: ['STOCK'],
  StockMovement: ['STOCK'],
  Vehicle: ['LOGISTIQUE'],
  Driver: ['LOGISTIQUE', 'RH'],
};

export function departmentAllows(
  user: { role?: string; department?: string | null } | undefined,
  allowed: readonly Department[],
): boolean {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN' || !user.department) return true;
  return (allowed as readonly string[]).includes(user.department);
}
