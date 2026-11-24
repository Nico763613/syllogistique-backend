// Classement des notifications en dossiers / sous-dossiers (affichage seulement : aucune donnée n'est modifiée).
// Une notification inconnue tombe dans « Informations générales / Autres notifications » : rien n'est masqué.
export type FolderKey = 'CHAUFFEURS' | 'MISSIONS' | 'VEHICULES' | 'DEPENSES' | 'STOCK' | 'HSE' | 'GENERAL';

export const FOLDERS: { key: FolderKey; label: string; order: number }[] = [
  { key: 'CHAUFFEURS', label: 'Chauffeurs & conformité', order: 1 },
  { key: 'MISSIONS', label: 'Missions & fiches de bord', order: 2 },
  { key: 'VEHICULES', label: 'Véhicules & maintenance', order: 3 },
  { key: 'DEPENSES', label: 'Carburant & dépenses', order: 4 },
  { key: 'STOCK', label: 'Stock & achats', order: 5 },
  { key: 'HSE', label: 'HSE & incidents', order: 6 },
  { key: 'GENERAL', label: 'Informations générales', order: 7 },
];

const has = (t: string, re: RegExp) => re.test(t);

export function classify(n: { entity?: string | null; title?: string | null }): { folder: FolderKey; sub: string } {
  const e = n.entity || '';
  const t = (n.title || '').toLowerCase();

  if (e === 'Driver' || e === 'DriverDevice' || e === 'DriverSignup' || e === 'DriverAttendance') {
    if (has(t, /permis/)) return { folder: 'CHAUFFEURS', sub: 'Permis de conduire' };
    if (e === 'DriverDevice' || has(t, /appareil|téléphone/)) return { folder: 'CHAUFFEURS', sub: 'Appareils' };
    if (e === 'DriverSignup' || has(t, /inscription|demande/)) return { folder: 'CHAUFFEURS', sub: 'Inscriptions' };
    return { folder: 'CHAUFFEURS', sub: 'Autres alertes chauffeurs' };
  }
  if (e === 'Trip' || e === 'TripNotStarted' || e === 'TripDelay' || e === 'DriverDailyReport') {
    if (e === 'DriverDailyReport' || has(t, /fiche/)) return { folder: 'MISSIONS', sub: 'Fiches journalières' };
    if (e === 'TripDelay' || has(t, /retard/)) return { folder: 'MISSIONS', sub: 'Retards' };
    if (e === 'TripNotStarted' || has(t, /non démarr/)) return { folder: 'MISSIONS', sub: 'Missions non démarrées' };
    return { folder: 'MISSIONS', sub: 'Départs et fins de mission' };
  }
  if (e === 'Document') return { folder: 'VEHICULES', sub: 'Documents du véhicule' };
  if (e === 'Vehicle' || e === 'VehicleDowntime' || e === 'MaintenancePlan' || e === 'MaintenancePlanned' || e === 'Maintenance' || e === 'DriverMaintenance' || e === 'ProblemReport' || e.startsWith('Downtime')) {
    if (has(t, /anomalie|panne|signal/) || e === 'ProblemReport') return { folder: 'VEHICULES', sub: 'Pannes et anomalies' };
    if (has(t, /entretien|vidange|maintenance|révision/) || e.startsWith('Maintenance') || e === 'Maintenance' || e === 'DriverMaintenance') return { folder: 'VEHICULES', sub: 'Entretien préventif' };
    if (e === 'VehicleDowntime' || e.startsWith('Downtime') || has(t, /immobilis/)) return { folder: 'VEHICULES', sub: 'Immobilisations' };
    if (has(t, /assurance|carte grise|visite|document/)) return { folder: 'VEHICULES', sub: 'Documents du véhicule' };
    return { folder: 'VEHICULES', sub: 'Autres alertes véhicules' };
  }
  if (e === 'FuelTransaction') return { folder: 'DEPENSES', sub: 'Carburant' };
  if (e === 'DriverExpense' || e === 'Expense' || e === 'CashExpense') return { folder: 'DEPENSES', sub: 'Dépenses à valider' };
  if (e === 'CashSession' || e === 'Payment') return { folder: 'DEPENSES', sub: 'Caisse et paiements' };
  if (e === 'InventoryItem' || e === 'InventoryCount' || e === 'StockMovement' || e === 'StockTransfer' || e === 'StockLot' || e === 'PointerCount') {
    if (e === 'InventoryItem' || has(t, /seuil|rupture/)) return { folder: 'STOCK', sub: 'Stock sous le seuil' };
    return { folder: 'STOCK', sub: 'Mouvements et inventaires' };
  }
  if (e === 'PurchaseOrder' || e === 'PurchaseInvoice' || e === 'NeedRequest' || e === 'Supplier') {
    return { folder: 'STOCK', sub: e === 'NeedRequest' ? 'Besoins' : 'Achats' };
  }
  if (e.startsWith('Hse')) {
    if (e === 'HseIncident') return { folder: 'HSE', sub: 'Incidents' };
    if (e === 'HseCorrectiveAction') return { folder: 'HSE', sub: 'Actions correctives' };
    return { folder: 'HSE', sub: 'Inspections et formations' };
  }
  if (e === 'SalesOrder' || e === 'SalesInvoice' || e === 'SalesReturn' || e === 'SalesInstallment' || e === 'Customer') return { folder: 'GENERAL', sub: 'Ventes' };
  return { folder: 'GENERAL', sub: 'Autres notifications' };
}

// Clé d'événement : seuls les vrais doublons (même événement copié par rôle) partagent la clé.
export function groupKey(n: { entity?: string | null; entityId?: string | null; title: string; message: string }) {
  return [n.entity || '', n.entityId || '', n.title, n.message].join('|');
}
