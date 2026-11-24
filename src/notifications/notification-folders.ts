// Classement des notifications en dossiers / sous-dossiers (affichage seulement : aucune donnée n'est modifiée).
// Une notification inconnue tombe dans « Informations générales / Autres notifications » : rien n'est masqué.
export type FolderKey = 'HSE' | 'CHAUFFEURS' | 'VEHICULES' | 'MISSIONS' | 'FICHES' | 'FINANCES' | 'GENERAL';

export const FOLDERS: { key: FolderKey; label: string; order: number }[] = [
  { key: 'HSE', label: 'Sécurité et HSE', order: 1 },
  { key: 'CHAUFFEURS', label: 'Chauffeurs et documents administratifs', order: 2 },
  { key: 'VEHICULES', label: 'Véhicules et maintenance', order: 3 },
  { key: 'MISSIONS', label: 'Missions et déplacements', order: 4 },
  { key: 'FICHES', label: 'Fiches journalières', order: 5 },
  { key: 'FINANCES', label: 'Finances et dépenses', order: 6 },
  { key: 'GENERAL', label: 'Informations générales', order: 7 },
];

const has = (t: string, re: RegExp) => re.test(t);
const soon = (t: string) => has(t, /expire dans|bientôt/);

// Seules les catégories réellement produites par l'application sont utilisées ; le reste tombe dans « Autres notifications non classées ».
export function classify(n: { entity?: string | null; title?: string | null }): { folder: FolderKey; sub: string } {
  const e = n.entity || '';
  const t = (n.title || '').toLowerCase();

  if (e.startsWith('Hse')) {
    if (e === 'HseIncident') return { folder: 'HSE', sub: has(t, /grave|critique/) ? 'Incidents HSE graves' : 'Incidents HSE mineurs' };
    if (e === 'HseCorrectiveAction') return { folder: 'HSE', sub: 'Actions correctives' };
    return { folder: 'HSE', sub: 'Inspections et formations' };
  }
  if (e === 'Driver' || e === 'DriverDevice' || e === 'DriverSignup' || e === 'DriverAttendance') {
    if (has(t, /permis/)) return { folder: 'CHAUFFEURS', sub: soon(t) ? 'Permis bientôt expirés' : 'Permis de conduire expirés' };
    if (has(t, /document|visite|médical/)) return { folder: 'CHAUFFEURS', sub: soon(t) ? 'Documents bientôt expirés' : 'Documents administratifs' };
    if (e === 'DriverDevice' || has(t, /appareil|téléphone/)) return { folder: 'CHAUFFEURS', sub: 'Appareils des chauffeurs' };
    if (e === 'DriverSignup' || has(t, /inscription|demande/)) return { folder: 'CHAUFFEURS', sub: 'Inscriptions' };
    return { folder: 'CHAUFFEURS', sub: 'Autres alertes chauffeurs' };
  }
  if (e === 'Document') return { folder: 'VEHICULES', sub: 'Échéances techniques des véhicules' };
  if (e === 'Vehicle' || e === 'VehicleDowntime' || e === 'MaintenancePlan' || e === 'MaintenancePlanned' || e === 'Maintenance' || e === 'DriverMaintenance' || e === 'ProblemReport' || e.startsWith('Downtime')) {
    if (has(t, /maintenance (déclarée|declaree)/) || e === 'DriverMaintenance') return { folder: 'VEHICULES', sub: 'Maintenances déclarées' };
    if (has(t, /anomalie|panne|signal/) || e === 'ProblemReport') return { folder: 'VEHICULES', sub: 'Anomalies mécaniques signalées' };
    if (has(t, /kilom|km/)) return { folder: 'VEHICULES', sub: 'Alertes kilométriques' };
    if (e === 'MaintenancePlan' || e === 'MaintenancePlanned' || has(t, /entretien|vidange|révision/)) return { folder: 'VEHICULES', sub: 'Entretien préventif' };
    if (e === 'VehicleDowntime' || e.startsWith('Downtime') || has(t, /immobilis/)) return { folder: 'VEHICULES', sub: 'Maintenances en cours et immobilisations' };
    if (has(t, /assurance|carte grise|visite|document/)) return { folder: 'VEHICULES', sub: 'Échéances techniques des véhicules' };
    return { folder: 'VEHICULES', sub: 'Maintenances déclarées' };
  }
  if (e === 'Trip' || e === 'TripNotStarted' || e === 'TripDelay') {
    if (e === 'TripDelay' || has(t, /retard/)) return { folder: 'MISSIONS', sub: 'Retards et incidents de déplacement' };
    if (e === 'TripNotStarted' || has(t, /non démarr/)) return { folder: 'MISSIONS', sub: 'Missions non démarrées' };
    if (has(t, /terminée|termin/)) return { folder: 'MISSIONS', sub: 'Missions terminées' };
    if (has(t, /annul/)) return { folder: 'MISSIONS', sub: 'Missions annulées' };
    if (has(t, /départ|depart/)) return { folder: 'MISSIONS', sub: 'Départs en mission' };
    return { folder: 'MISSIONS', sub: 'Nouvelles missions' };
  }
  if (e === 'DriverDailyReport') return { folder: 'FICHES', sub: has(t, /valid/) ? 'Fiches validées' : has(t, /rejet|corrig/) ? 'Fiches rejetées ou à corriger' : 'Nouvelles fiches reçues' };
  if (e === 'FuelTransaction') return { folder: 'FINANCES', sub: 'Carburant et consommations' };
  if (e === 'DriverExpense' || e === 'Expense' || e === 'CashExpense') return { folder: 'FINANCES', sub: has(t, /valid(ée|ee)/) ? 'Dépenses validées' : has(t, /rejet/) ? 'Dépenses rejetées' : 'Dépenses à valider' };
  if (e === 'CashSession' || e === 'Payment' || e === 'SalesInstallment') return { folder: 'FINANCES', sub: 'Paiements et échéances' };
  if (e === 'PurchaseOrder' || e === 'PurchaseInvoice' || e === 'SalesInvoice') return { folder: 'FINANCES', sub: 'Autres opérations financières' };
  if (e === 'InventoryItem' || e === 'InventoryCount' || e === 'StockMovement' || e === 'StockTransfer' || e === 'StockLot' || e === 'PointerCount' || e === 'NeedRequest' || e === 'Supplier') {
    return { folder: 'GENERAL', sub: 'Stock et approvisionnement' };
  }
  if (e === 'SalesOrder' || e === 'SalesReturn' || e === 'Customer') return { folder: 'GENERAL', sub: 'Nouvelles activités' };
  return { folder: 'GENERAL', sub: 'Autres notifications non classées' };
}

// Clé d'événement : seuls les vrais doublons (même événement copié par rôle) partagent la clé.
export function groupKey(n: { entity?: string | null; entityId?: string | null; title: string; message: string }) {
  return [n.entity || '', n.entityId || '', n.title, n.message].join('|');
}
