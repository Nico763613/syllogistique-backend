/* =====================================================================
   ESPACES PAR PROFIL — SYL Logistique & Transport
   Chaque profil arrive dans SON espace : un accueil (indicateurs réels),
   des dossiers numérotés et des sous-dossiers qui ouvrent les écrans
   EXISTANTS de l'application. Rien n'est supprimé : les anciens menus
   restent dans la page (masqués) et tous les écrans restent accessibles.
   Les chiffres viennent uniquement du serveur ; une donnée absente
   s'affiche « — » (jamais inventée).
   Pour ajouter une rubrique : ajouter [libellé, vue, aide] dans PROFILES.
   Une vue à null = rubrique prévue, pas encore d'écran (affichée « bientôt »).
   ===================================================================== */

const PROF_IC = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;

const PROFILES = {
  /* ---------------- 1. DIRECTION GÉNÉRALE (vue globale, lecture) ---------------- */
  DG: {
    roles: ['DIRECTEUR_GENERAL', 'SUPER_ADMIN'],
    title: 'Tableau de bord DG', space: 'Direction générale',
    todo: 'Consultez les indicateurs, traitez les alertes, puis ouvrez le dossier du responsable concerné.',
    folders: [
      { t: 'Direction et administration', ic: 'building', subs: [
        ['Organisation de l\'entreprise', 'settings', 'Nom, coordonnées et sites de l\'entreprise.'],
        ['Départements', 'home', 'Les départements actifs et leur accès direct.'],
        ['Responsables', 'personnel', 'Créer les responsables et leur envoyer leur invitation.', ['DIRECTEUR_GENERAL']],
        ['Responsables (administrateur)', 'staff-managers', 'Comptes DG et Responsable logistique.', ['SUPER_ADMIN']],
        ['Personnel', 'personnel', 'Comptes actifs, désactivés, invitations.', ['DIRECTEUR_GENERAL']],
        ['Affectations', 'drivers', 'Chauffeurs et véhicules affectés.'],
        ['Historique des décisions', '#history', 'Journal des validations et décisions.', ['SUPER_ADMIN']],
        ['Historique des décisions', null, 'Journal des validations et décisions.', ['DIRECTEUR_GENERAL']],
      ] },
      { t: 'Gestion logistique', ic: 'truck', subs: [
        ['Flotte de camions', 'trucks', 'Dossier du Responsable logistique : camions.'],
        ['Véhicules de service', 'service-vehicles', 'Véhicules de service et IT.'],
        ['Chauffeurs', 'drivers', 'Liste, affectations, appareils.'],
        ['Missions et déplacements', 'driver-missions', 'Historique des missions.'],
        ['Carburant', 'fuel', 'Approvisionnements et consommation.'],
        ['Maintenance', 'maintenance', 'Pannes, entretiens, réparations.'],
        ['Dépenses logistiques', 'driver-expenses', 'Dépenses et reçus des chauffeurs.'],
        ['Validation des fiches', 'ops-validation', 'Fiches vérifiées à valider.', ['SUPER_ADMIN']],
      ] },
      { t: 'Gestion des stocks', ic: 'package', subs: [
        ['Stock global', 'dash-stock', 'Indicateurs de l\'entrepôt.'],
        ['Articles', 'stock', 'Catalogue des articles.'],
        ['Entrées et sorties', 'stock', 'Mouvements de stock.'],
        ['Inventaires', 'stock', 'Comptages et écarts.'],
        ['Alertes', 'dash-stock', 'Ruptures, seuils, péremptions.'],
        ['Réapprovisionnement', 'needs', 'États des besoins.'],
        ['Valorisation du stock', 'dash-stock', 'Valeur du stock (GNF).'],
      ] },
      { t: 'Ressources humaines', ic: 'users', subs: [
        ['Personnel administratif', 'personnel', 'Comptes du personnel.', ['DIRECTEUR_GENERAL']],
        ['Chauffeurs', 'drivers', 'Fiches chauffeurs.'],
        ['Mécaniciens', 'staff-mech', 'Mécaniciens et leurs rapports.'],
        ['Agents HSE', 'staff-hse', 'Agents HSE et leurs rapports.'],
        ['Gestionnaires de stock', 'staff-store', 'Magasiniers et leurs rapports.'],
        ['Responsables', 'personnel', 'Responsables de départements.', ['DIRECTEUR_GENERAL']],
        ['Dossiers individuels', 'personnel', 'Fiche de chaque employé.', ['DIRECTEUR_GENERAL']],
      ] },
      { t: 'Comptabilité et dépenses', ic: 'receipt', subs: [
        ['Dépenses par département', 'compta', 'Dépenses validées et à valider.'],
        ['Dépenses par véhicule', 'reports-truck', 'Coûts par camion et véhicule.'],
        ['Dépenses par période', 'dashboard', 'Filtre jour, semaine, mois, année.'],
        ['Justificatifs', 'driver-expenses', 'Reçus photographiés.'],
        ['Rapports financiers', 'reports-dg', 'Synthèse financière.'],
      ] },
      { t: 'Rapports et statistiques', ic: 'chart', subs: [
        ['Tableau de bord détaillé', 'dashboard', 'Graphiques, filtres jour, semaine, mois, année.'],
        ['Alertes et notifications', '#alerts', 'Incidents et rappels.'],
        ['Rapports journaliers', 'daily', 'Rapports du jour de chaque département.'],
        ['Rapports hebdomadaires', 'reports-dg', 'Synthèse de la semaine.'],
        ['Rapports mensuels', 'reports-dg', 'Synthèse du mois.'],
        ['Rapports par département', 'reports-truck', 'Camions, véhicules, stock, HSE.'],
        ['Rapports consolidés', 'reports-dg', 'Vue d\'ensemble de l\'entreprise.'],
        ['Exports et archives', 'reports-dg', 'Télécharger, imprimer, envoyer.'],
      ] },
      { t: 'Paramètres et sécurité', ic: 'shield', subs: [
        ['Entreprise', 'settings', 'Identité de l\'entreprise.'],
        ['Logo', 'settings', 'Logo affiché dans l\'application.'],
        ['Utilisateurs', 'personnel', 'Comptes utilisateurs.', ['DIRECTEUR_GENERAL']],
        ['Utilisateurs (administrateur)', 'staff-managers', 'Comptes des responsables.', ['SUPER_ADMIN']],
        ['Rôles et autorisations', 'personnel', 'Rôle de chaque compte.', ['DIRECTEUR_GENERAL']],
        ['Appareils autorisés', 'driver-devices', 'Téléphones des chauffeurs.'],
        ['Invitations', 'personnel', 'Invitations WhatsApp individuelles.', ['DIRECTEUR_GENERAL']],
        ['Journal d\'activité', '#history', 'Qui a fait quoi, et quand.', ['SUPER_ADMIN']],
        ['Journal d\'activité', null, 'Qui a fait quoi, et quand.', ['DIRECTEUR_GENERAL']],
        ['Signalements des utilisateurs', 'signalements', 'Problèmes signalés depuis l\'application.', ['SUPER_ADMIN']],
        ['Simulation (test)', 'simulation', 'Comptes de test et scénario.', ['SUPER_ADMIN']],
        ['Sauvegardes', 'sync', 'Synchronisation et sauvegarde.'],
      ] },
    ],
  },

  /* ---------------- 2. RESPONSABLE LOGISTIQUE ---------------- */
  LOGI: {
    roles: ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'LECTEUR'],
    title: 'Tableau de bord logistique', space: 'Responsable logistique',
    todo: 'Vérifiez les fiches de bord reçues, traitez les pannes et les alertes carburant, puis transmettez.',
    folders: [
      { t: 'Flotte de camions', ic: 'truck', subs: [
        ['Liste des camions', 'trucks', 'Tous les camions et leur statut.'],
        ['Fiche individuelle', 'trucks', 'Ouvrez un camion pour voir sa fiche complète.'],
        ['Documents administratifs', 'trucks', 'Onglet « Documents » de la fiche du camion.'],
        ['Chauffeur affecté', 'drivers', 'Affectation chauffeur ↔ camion.'],
        ['Missions et trajets', 'driver-missions', 'Historique des missions.'],
        ['Rapports journaliers', 'driver-sheets', 'Fiches de bord du jour.'],
        ['Carburant', 'fuel', 'Pleins et consommation.'],
        ['Pannes', 'maintenance', 'Pannes déclarées par les chauffeurs.'],
        ['Maintenance', 'maintenance', 'Entretiens et réparations.'],
        ['Dépenses', 'driver-expenses', 'Dépenses et reçus.'],
        ['Historique complet', 'reports-truck', 'Rapports camions.'],
      ] },
      { t: 'Véhicules de service', ic: 'car', subs: [
        ['Liste des véhicules', 'service-vehicles', 'Véhicules de service et IT.'],
        ['Fiche individuelle', 'service-vehicles', 'Ouvrez un véhicule pour sa fiche.'],
        ['Conducteur affecté', 'drivers', 'Affectation conducteur ↔ véhicule.'],
        ['Documents', 'service-vehicles', 'Onglet « Documents » de la fiche.'],
        ['Déplacements', 'driver-missions', 'Historique des déplacements.'],
        ['Rapports', 'reports-service', 'Rapports véhicules de service.'],
        ['Carburant', 'fuel', 'Pleins et consommation.'],
        ['Maintenance', 'maintenance', 'Entretiens et réparations.'],
        ['Dépenses', 'driver-expenses', 'Dépenses et reçus.'],
        ['Historique', 'reports-service', 'Historique par véhicule.'],
      ] },
      { t: 'Chauffeurs', ic: 'users', subs: [
        ['Liste des chauffeurs', 'drivers', 'Tous les chauffeurs.'],
        ['Fiche individuelle', 'drivers', 'Photo, coordonnées, permis.'],
        ['Camion ou véhicule affecté', 'drivers', 'Affectation en cours.'],
        ['Missions', 'driver-board', 'Suivi du jour.'],
        ['Rapports', 'reports-drivers', 'Présence et fiches de bord.'],
        ['Incidents', 'dash-hse', 'Incidents signalés.'],
        ['Pointage', 'pointage', 'Présence du jour.'],
        ['Enrôlement WhatsApp', 'enrol', 'Envoyer le lien d\'installation.', ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE']],
        ['Appareils', 'driver-devices', 'Téléphone autorisé de chaque chauffeur.'],
      ] },
      { t: 'Carburant', ic: 'fuel', subs: [
        ['Approvisionnements', 'fuel', 'Pleins enregistrés.'],
        ['Consommation des camions', 'dash-fleet', 'L/100 km par camion.'],
        ['Consommation des véhicules', 'dash-fleet', 'L/100 km par véhicule.'],
        ['Consommation par chauffeur', 'reports-drivers', 'Par chauffeur.'],
        ['Coûts', 'dash-fleet', 'Coût carburant de la période.'],
        ['Écarts et anomalies', 'dash-fleet', 'Consommations anormales.'],
        ['Historique', 'fuel', 'Tous les pleins.'],
        ['Rapports périodiques', 'reports-truck', 'Rapports carburant.'],
      ] },
      { t: 'Maintenance', ic: 'wrench', subs: [
        ['Maintenance des camions', 'maintenance', 'Entretiens des camions.'],
        ['Maintenance des véhicules', 'maintenance', 'Entretiens des véhicules de service.'],
        ['Pannes', 'maintenance', 'Qualifier la priorité et le délai.'],
        ['Interventions', 'maintenance', 'Interventions en cours.'],
        ['Pièces utilisées', 'stock', 'Sorties de stock imputées aux véhicules.'],
        ['Coûts', 'dash-fleet', 'Coût d\'entretien.'],
        ['Préventive et corrective', 'dash-fleet', 'Entretiens dus au kilométrage ou à la date.'],
        ['Mécaniciens & rapports', 'staff-mech', 'Rapports des mécaniciens.'],
      ] },
      { t: 'HSE', ic: 'hard-hat', subs: [
        ['Tableau HSE', 'dash-hse', 'Indicateurs sécurité.'],
        ['Agents HSE et rapports', 'reports-hse', 'Rapports journaliers, hebdomadaires, mensuels.'],
        ['Incidents et accidents', 'dash-hse', 'Incidents ouverts.'],
        ['Mesures correctives', 'dash-hse', 'Actions correctives ouvertes.'],
      ] },
      { t: 'Dépenses et rapports', ic: 'chart', subs: [
        ['Dépenses par camion', 'reports-truck', 'Coûts par camion.'],
        ['Dépenses par véhicule', 'reports-service', 'Coûts par véhicule.'],
        ['Dépenses des chauffeurs', 'driver-expenses', 'Dépenses et reçus.'],
        ['Statistiques flotte', 'dash-fleet', 'Disponibilité, km, coûts.'],
        ['Achats et besoins', 'purchases', 'Achats et réapprovisionnement.'],
        ['Archives', 'driver-missions', 'Historique des fiches.'],
      ] },
      { t: 'Personnel logistique', ic: 'user', subs: [
        ['Gestion du personnel', 'personnel', 'Gestionnaires de stock, mécaniciens, pointeurs.', ['ADMIN_LOGISTIQUE']],
      ] },
    ],
  },

  /* ---------------- 3. GESTIONNAIRE DE STOCK ---------------- */
  STOCK: {
    roles: ['MAGASINIER'],
    title: 'Tableau de bord stock', space: 'Gestionnaire de stock',
    todo: 'Enregistrez chaque entrée et sortie le jour même, traitez les articles sous le minimum, puis envoyez votre rapport.',
    folders: [
      { t: 'Gestion des articles', ic: 'package', subs: [
        ['Catalogue des articles', 'stock', 'Tous les articles et leur quantité.'],
        ['Fiche article', 'stock', 'Ouvrez un article pour sa fiche.'],
        ['Historique des mouvements', 'stock', 'Entrées et sorties par article.'],
      ] },
      { t: 'Entrées de stock', ic: 'download', subs: [
        ['Nouvelle entrée', '#stock-in', 'Réception fournisseur ou de pièces.'],
        ['Historique des entrées', 'stock', 'Entrées enregistrées.'],
      ] },
      { t: 'Sorties de stock', ic: 'upload', subs: [
        ['Nouvelle sortie', '#stock-out', 'Affectation à un véhicule ou un département.'],
        ['Historique des sorties', 'stock', 'Sorties enregistrées.'],
      ] },
      { t: 'Inventaires', ic: 'clipboard', subs: [
        ['Inventaires', 'stock', 'Quantité théorique, physique et écarts.'],
      ] },
      { t: 'Analyse et calculs', ic: 'scale', subs: [
        ['Indicateurs du stock', 'dash-stock', 'Rotation, couverture, stock dormant.'],
      ] },
      { t: 'Alertes', ic: 'alert', subs: [
        ['Stock faible et ruptures', 'dash-stock', 'Articles sous le seuil ou en rupture.'],
        ['Besoins de réapprovisionnement', 'needs', 'États des besoins à transmettre.'],
      ] },
      { t: 'Fournisseurs et rapports', ic: 'file', subs: [
        ['Mon rapport du jour', 'my-report', 'Rapport journalier à envoyer.'],
        ['Rapports de stock', 'reports-stock', 'Rapports et consommation.'],
        ['Répertoire fournisseurs', null, 'Géré par les Achats (Responsable logistique).'],
      ] },
    ],
  },

  /* ---------------- 5. MÉCANICIEN ---------------- */
  MECA: {
    roles: ['MECANICIEN'],
    title: 'Tableau de bord maintenance', space: 'Mécanicien',
    todo: 'Prenez en charge les pannes en attente, notez les pièces utilisées, puis clôturez l\'intervention.',
    folders: [
      { t: 'Interventions', ic: 'wrench', subs: [
        ['Atelier : interventions', 'atelier', 'Nouvelles, affectées, en cours, clôture.'],
      ] },
      { t: 'Véhicules', ic: 'truck', subs: [
        ['Camions', 'trucks', 'Fiches et historique (lecture).'],
        ['Véhicules de service', 'service-vehicles', 'Fiches et historique (lecture).'],
      ] },
      { t: 'Pièces détachées', ic: 'package', subs: [
        ['Consulter le stock', 'stock', 'Pièces disponibles.'],
        ['Demander des pièces', 'needs', 'État des besoins envoyé aux Achats.'],
      ] },
      { t: 'Rapports', ic: 'file', subs: [
        ['Mon rapport du jour', 'my-report', 'Rapport journalier.'],
        ['Mon espace et historique', 'espace', 'Interventions récentes.'],
      ] },
    ],
  },

  /* ---------------- 6. HSE ---------------- */
  HSE: {
    roles: ['GESTIONNAIRE_HSE', 'AGENT_HSE'],
    title: 'Tableau de bord HSE', space: 'Santé, sécurité, environnement',
    todo: 'Réalisez les inspections prévues, signalez tout incident avec photos, puis complétez votre rapport.',
    folders: [
      { t: 'Inspections', ic: 'eye', subs: [
        ['Inspections et contrôles', 'dash-hse', 'Camions, véhicules, équipements, sites.'],
      ] },
      { t: 'Incidents et accidents', ic: 'alert', subs: [
        ['Incidents et suivi', 'dash-hse', 'Déclarer, décrire, suivre le traitement.'],
      ] },
      { t: 'Équipements de protection', ic: 'hard-hat', subs: [
        ['Conformité EPI', 'dash-hse', 'Distribution, contrôles, renouvellements.'],
      ] },
      { t: 'Rapports HSE', ic: 'file', subs: [
        ['Mon rapport du jour', 'my-report', 'Rapport journalier.'],
        ['Rapports et historique', 'reports-hse', 'Rapports hebdomadaires et mensuels.', ['GESTIONNAIRE_HSE']],
        ['Mon espace', 'espace', 'Inspections et incidents récents.'],
        ['Enrôlement des agents', 'enrol', 'Envoyer le lien aux agents HSE.', ['GESTIONNAIRE_HSE']],
      ] },
    ],
  },
};

const PROF = { key: null, crumb: null };
function profKey(role) { return Object.keys(PROFILES).find((k) => PROFILES[k].roles.includes(role)) || null; }
function profCur() { return PROF.key ? PROFILES[PROF.key] : null; }
function profSubs(f) { const r = state.user && state.user.role; return f.subs.filter((s) => !s[3] || s[3].includes(r)); }

/* ---------- Données réelles de l'accueil (tolérant aux erreurs, rien n'est inventé) ---------- */
function profQ() { return state.siteId ? '?siteId=' + encodeURIComponent(state.siteId) : ''; }
async function profTry(p) { try { return await api(p); } catch (e) { return null; } }
const profN = (v, u) => (v === null || v === undefined || v === '' ? '—' : (typeof v === 'number' ? fmt(v) : esc(String(v))) + (u ? ' ' + u : ''));
function profKpisFrom(d, keys) { // kpis[] des tableaux de bord serveur → tuiles
  if (!d || !Array.isArray(d.kpis)) return [];
  return d.kpis.filter((k) => !keys || keys.includes(k.key)).map((k) => ({ l: k.label, v: profN(k.value, k.unit === 'GNF' || k.unit === '%' ? k.unit : ''), s: k.status }));
}
async function profData(key) {
  const q = profQ();
  if (key === 'DG') {
    const [d, fl, st] = await Promise.all([profTry('/dashboards/direction' + q), profTry('/dashboards/fleet' + q), profTry('/dashboards/stock' + q)]);
    const t = [];
    if (d) {
      const f = d.fleet || {};
      t.push({ l: 'Disponibilité de la flotte', v: profN(f.availabilityPct, '%'), s: f.availabilityPct !== null && f.availabilityPct < 80 ? 'warning' : 'ok', go: 'trucks' });
      t.push({ l: 'Camions disponibles', v: f.trucks ? `${fmt(f.trucks.available)} / ${fmt(f.trucks.total)}` : '—', go: 'trucks' });
      t.push({ l: 'Véhicules immobilisés', v: profN((f.trucks ? f.trucks.immobilized : 0) + (f.serviceVehicles ? f.serviceVehicles.immobilized : 0)), s: 'warning', go: 'maintenance' });
      t.push({ l: 'Missions en cours', v: profN(d.missions && d.missions.inProgress), go: 'driver-missions' });
      t.push({ l: 'Dépenses de la période', v: profN(d.expenses && d.expenses.total, 'GNF'), go: 'compta' });
      t.push({ l: 'Carburant consommé', v: profN(d.fuel && d.fuel.liters, 'L'), go: 'fuel' });
      t.push({ l: 'Rapports reçus', v: profN(d.reports && d.reports.newInPeriod), go: 'daily' });
    }
    profKpisFrom(st, ['out_of_stock', 'below_minimum', 'stock_value']).forEach((k) => t.push({ ...k, go: 'dash-stock' }));
    const alerts = ((d && d.alerts && d.alerts.items) || []).slice(0, 6).map((a) => ({ t: a.title, s: a.message, sev: a.severity }));
    profWorklist(fl, alerts);
    return { tiles: t, alerts, reports: ((d && d.reports && d.reports.recent) || []).slice(0, 6) };
  }
  if (key === 'LOGI') {
    const fl = await profTry('/dashboards/fleet' + q); const alerts = [];
    profWorklist(fl, alerts);
    const byS = (fl && fl.kpis && (fl.kpis.find((k) => k.key === 'availability') || {}).byStatus) || null;
    const t = [];
    if (byS) { t.push({ l: 'Véhicules disponibles', v: profN(byS.AVAILABLE || 0), go: 'trucks' }, { l: 'En mission', v: profN(byS.ON_MISSION || 0), go: 'driver-board' }, { l: 'Immobilisés / en maintenance', v: profN((byS.IMMOBILIZED || 0) + (byS.MAINTENANCE || 0)), s: (byS.IMMOBILIZED || byS.MAINTENANCE) ? 'warning' : 'ok', go: 'maintenance' }); }
    profKpisFrom(fl, ['availability', 'trips', 'fuel_cost', 'consumption', 'maintenance_overdue', 'documents']).forEach((k) => t.push(k));
    return { tiles: t, alerts };
  }
  if (key === 'STOCK') {
    const st = await profTry('/dashboards/stock' + q), ws = await profTry('/dashboards/workspace' + q);
    const t = profKpisFrom(st, ['out_of_stock', 'below_minimum', 'expiring', 'inventory_gap', 'dormant', 'coverage']);
    if (ws && ws.kpis) t.unshift({ l: 'Articles', v: profN(ws.kpis.items) }, { l: 'Entrées du jour', v: profN(ws.kpis.entriesToday) }, { l: 'Sorties du jour', v: profN(ws.kpis.exitsToday) });
    const alerts = ((ws && ws.alerts) || []).map((a) => ({ t: a.name, s: `${fmt(a.quantity)} ${a.unit || ''} — minimum ${fmt(a.minimum)}`, sev: a.quantity <= 0 ? 'CRITICAL' : 'WARNING' }));
    return { tiles: t, alerts };
  }
  const ws = await profTry('/dashboards/workspace' + q); const k = (ws && ws.kpis) || {};
  if (key === 'MECA') {
    return { tiles: [{ l: 'Interventions à faire', v: profN(k.todo), s: k.todo ? 'warning' : 'ok', go: 'atelier' }, { l: 'Interventions en cours', v: profN(k.inProgress), go: 'atelier' }, { l: 'Véhicules immobilisés', v: profN(k.down), s: k.down ? 'warning' : 'ok', go: 'atelier' }, { l: 'Terminées ce mois', v: profN(k.doneMonth), go: 'espace' }],
      alerts: ((ws && ws.stopped) || []).map((v) => ({ t: v.vehicle + ' · ' + (v.plate || ''), s: v.status === 'IMMOBILIZED' ? 'Immobilisé' : 'En maintenance', sev: 'WARNING' })) };
  }
  const hs = await profTry('/dashboards/hse' + q);
  const t = [{ l: 'Inspections du mois', v: profN(k.inspections), go: 'dash-hse' }, { l: 'Incidents ouverts', v: profN(k.openIncidents), s: k.openIncidents ? 'warning' : 'ok', go: 'dash-hse' }, { l: 'Accidents du mois', v: profN(k.accidents), s: k.accidents ? 'critical' : 'ok', go: 'dash-hse' }, { l: 'Conformité', v: profN(k.compliance, '%'), go: 'dash-hse' }];
  profKpisFrom(hs, ['open_actions', 'ppe']).forEach((x) => t.push(x));
  return { tiles: t, alerts: ((ws && ws.incidents) || []).map((i) => ({ t: i.type + ' — ' + (i.severity || ''), s: i.description || '', sev: 'WARNING' })) };
}
function profWorklist(fl, out) { // alertes concrètes du tableau de bord flotte
  const w = fl && fl.worklists; if (!w) return;
  (w.openDowntimes || []).slice(0, 3).forEach((d) => out.push({ t: d.vehicle + ' immobilisé depuis ' + d.days + ' j', s: d.reason || '', sev: 'WARNING' }));
  (w.maintenanceDue || []).slice(0, 3).forEach((m) => out.push({ t: 'Entretien à faire : ' + (m.vehicle || ''), s: m.label || m.type || '', sev: 'WARNING' }));
  (w.consumptionAnomalies || []).slice(0, 3).forEach((a) => out.push({ t: 'Consommation anormale : ' + a.vehicle, s: a.actual + ' L/100 km (référence ' + a.reference + ')', sev: 'WARNING' }));
  (w.documentsToRenew || []).filter((d) => d.daysLeft <= 15).slice(0, 3).forEach((d) => out.push({ t: d.label + ' — ' + d.subject, s: d.daysLeft < 0 ? 'Expiré' : 'Expire dans ' + d.daysLeft + ' j', sev: d.daysLeft < 0 ? 'CRITICAL' : 'WARNING' }));
}

/* ---------- Écrans de l'espace : accueil et dossier ---------- */
function profAssist(where, todo, next) {
  return `<div class="pf-assist"><div><span>Vous êtes ici</span><b>${where}</b></div><div><span>À faire</span><b>${todo}</b></div>${next ? `<div><span>Prochaine étape</span><b>${next}</b></div>` : ''}</div>`;
}
async function renderProfHome() {
  const P = profCur(), u = state.user; if (!P) return renderHome();
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  root().innerHTML = `<div class="pf-hero"><div class="pf-id">${avatarHtml(56)}<div><h2>Bonjour ${esc(u.firstName)}</h2><div>${esc(roleLabel(u.role))} · ${esc(P.space)}</div></div></div><div class="pf-date">${esc(today.charAt(0).toUpperCase() + today.slice(1))}</div></div>
    ${profAssist('Accueil — ' + esc(P.title), esc(P.todo), 'Ouvrez un dossier ci-dessous.')}
    <div class="pf-tiles" id="pf-tiles"><div class="empty">Chargement des indicateurs…</div></div>
    <div class="pf-cols"><div class="panel"><h3>${PROF_IC('briefcase')} Mes dossiers</h3><div class="pf-folders">${P.folders.map((f, i) => !profSubs(f).length ? '' : `<button class="pf-folder" onclick="go('prof-f-${i}')"><span class="pf-num">${i + 1}</span><span class="pf-fi">${PROF_IC(f.ic)}</span><b>${esc(f.t)}</b><small>${profSubs(f).length} rubrique(s)</small></button>`).join('')}</div></div>
    <div class="panel"><h3>${PROF_IC('bell')} Alertes importantes</h3><div id="pf-alerts"><div class="empty">Chargement…</div></div></div></div>`;
  const view = state.view, d = await profData(PROF.key);
  if (state.view !== view) return;
  const tb = document.getElementById('pf-tiles'), ab = document.getElementById('pf-alerts');
  if (tb) tb.innerHTML = d.tiles.length ? d.tiles.map((x) => `<${x.go ? `button onclick="go('${x.go}')"` : 'div'} class="pf-tile ${x.s === 'critical' ? 'bad' : x.s === 'warning' ? 'warn' : ''}"><small>${esc(x.l)}</small><b>${x.v}</b></${x.go ? 'button' : 'div'}>`).join('') : '<div class="empty">Indicateurs indisponibles (connexion ou droits). Les dossiers restent accessibles.</div>';
  if (ab) ab.innerHTML = (d.alerts.length ? d.alerts.map((a) => `<div class="pf-alert ${/CRIT|HIGH/.test(a.sev || '') ? 'bad' : 'warn'}"><b>${esc(a.t)}</b>${a.s ? `<small>${esc(a.s)}</small>` : ''}</div>`).join('') : '<div class="pf-ok">' + PROF_IC('check-circle') + ' Aucune alerte en cours.</div>')
    + (d.reports && d.reports.length ? `<h4 style="margin:14px 0 6px">Rapports récents</h4>` + d.reports.map((r) => `<div class="pf-alert info"><b>${esc(r.title)}</b><small>${esc(r.author)} · ${esc(String(r.date || '').slice(0, 10))}</small></div>`).join('') : '');
}
function renderProfFolder(i) {
  const P = profCur(), f = P && P.folders[i]; if (!f) return renderProfHome();
  const subs = profSubs(f);
  root().innerHTML = profAssist(esc(P.title) + ' › ' + (i + 1) + '. ' + esc(f.t), 'Choisissez la rubrique à ouvrir.', subs[0] ? esc(subs[0][0]) : '')
    + `<div class="panel"><h3>${PROF_IC(f.ic)} ${i + 1}. ${esc(f.t)}</h3><div class="pf-subs">${subs.map((s, j) => s[1]
      ? `<button class="pf-sub" onclick="profOpen(${i},${j})"><b>${esc(s[0])}</b><small>${esc(s[2] || '')}</small><span>${PROF_IC('chevron-right')}</span></button>`
      : `<div class="pf-sub off"><b>${esc(s[0])}</b><small>${esc(s[2] || '')} — rubrique prévue, bientôt disponible.</small></div>`).join('')}</div></div>`;
}
function profOpen(i, j) {
  const f = profCur().folders[i], s = profSubs(f)[j]; if (!s || !s[1]) return;
  PROF.crumb = { i, label: s[0], view: s[1], hint: s[2] };
  if (s[1] === '#stock-in') return stockMove('in');
  if (s[1] === '#stock-out') return stockMove('out');
  if (s[1] === '#history') return typeof openHistory === 'function' && openHistory();
  if (s[1] === '#alerts') return typeof dgAlertsGo === 'function' && dgAlertsGo();
  go(s[1]);
}
function profFind(view) { // retrouve le dossier d'un écran ouvert autrement (lien interne, recherche)
  const P = profCur(); if (!P) return null;
  for (let i = 0; i < P.folders.length; i++) { const s = profSubs(P.folders[i]).find((x) => x[1] === view); if (s) return { i, label: s[0], view, hint: s[2] }; }
  return null;
}
function profCrumbHtml(view) {
  const P = profCur(); if (!P || view === 'prof-home') return '';
  let parts = [`<a onclick="go('prof-home')">Accueil</a>`], hint = '';
  if (/^prof-f-\d+$/.test(view)) parts.push(`<b>${+view.slice(7) + 1}. ${esc(P.folders[+view.slice(7)].t)}</b>`);
  else {
    const c = PROF.crumb && PROF.crumb.view === view ? PROF.crumb : profFind(view);
    if (c) { parts.push(`<a onclick="go('prof-f-${c.i}')">${c.i + 1}. ${esc(P.folders[c.i].t)}</a>`, `<b>${esc(c.label)}</b>`); hint = c.hint || ''; }
    else parts.push(`<b>${esc(titles[view] || view)}</b>`);
  }
  return `<div class="pf-crumb" id="pf-crumb"><button class="pf-back" onclick="profBack()">${PROF_IC('chevron-left')} Retour</button><nav>${parts.join('<span>›</span>')}</nav>${hint ? `<div class="pf-hint">${PROF_IC('info')} ${esc(hint)}</div>` : ''}</div>`;
}
function profBack() { if (state.hist && state.hist.length && typeof goBack === 'function') return goBack(); go('prof-home'); }

/* ---------- Menu latéral : dossiers numérotés générés pour le profil ---------- */
function profNavBuild() {
  const side = document.getElementById('sidebar'); if (!side) return;
  let nav = document.getElementById('prof-nav');
  const P = profCur();
  document.body.classList.toggle('pf-on', !!P);
  if (!P) { if (nav) nav.remove(); return; }
  if (!nav) { nav = document.createElement('div'); nav.id = 'prof-nav'; const first = side.querySelector('.nav-item'); side.insertBefore(nav, first); }
  let open = {}; try { open = JSON.parse(localStorage.getItem('syl_pf_open') || '{}'); } catch (e) {}
  nav.innerHTML = `<div class="pf-nav-item" data-pv="prof-home" onclick="go('prof-home')">${PROF_IC('home')}<span>Accueil — ${esc(P.title)}</span></div>`
    + P.folders.map((f, i) => !profSubs(f).length ? '' : `<div class="pf-nav-f${open[i] ? ' open' : ''}" data-f="${i}"><div class="pf-nav-h" onclick="profNavToggle(${i})"><span class="pf-num">${i + 1}</span><span>${esc(f.t)}</span>${PROF_IC('chevron-down')}</div>
      <div class="pf-nav-s">${profSubs(f).map((s, j) => s[1] ? `<div class="pf-nav-item sub" data-pv="${esc(s[1])}" data-i="${i}" data-j="${j}" onclick="profOpen(${i},${j})"><span>${esc(s[0])}</span></div>` : `<div class="pf-nav-item sub off"><span>${esc(s[0])}</span><em>bientôt</em></div>`).join('')}</div></div>`).join('');
}
function profNavToggle(i) {
  const el = document.querySelector(`#prof-nav .pf-nav-f[data-f="${i}"]`); if (!el) return;
  el.classList.toggle('open');
  try { const m = JSON.parse(localStorage.getItem('syl_pf_open') || '{}'); m[i] = el.classList.contains('open') ? 1 : 0; localStorage.setItem('syl_pf_open', JSON.stringify(m)); } catch (e) {}
}
function profNavActive(view) {
  const c = PROF.crumb && PROF.crumb.view === view ? PROF.crumb : null;
  document.querySelectorAll('#prof-nav .pf-nav-item').forEach((el) => {
    const on = c ? (+el.dataset.i === c.i && el.dataset.pv === view && profSubs(profCur().folders[c.i])[+el.dataset.j][0] === c.label) : el.dataset.pv === view;
    el.classList.toggle('active', !!on);
    if (on && el.closest('.pf-nav-f')) el.closest('.pf-nav-f').classList.add('open');
  });
  const m = /^prof-f-(\d+)$/.exec(view);
  document.querySelectorAll('#prof-nav .pf-nav-f').forEach((f) => f.classList.toggle('cur', !!m && f.dataset.f === m[1]));
}
function profApply() { PROF.key = state.user ? profKey(state.user.role) : null; profNavBuild(); }

/* ---------- Branchement sur l'application existante (sans rien retirer) ---------- */
titles['prof-home'] = 'Accueil';
{ const _rvP = renderView; renderView = async function (view) {
  if (view === 'prof-home' || /^prof-f-\d+$/.test(view)) {
    if (!window._silent) root().innerHTML = '<div class="empty">Chargement…</div>';
    try { if (view === 'prof-home') await renderProfHome(); else renderProfFolder(+view.slice(7)); } catch (e) { root().innerHTML = `<div class="panel"><div class="msg err">${esc(e.message)}</div></div>`; }
  } else await _rvP(view);
  try { if (PROF.key && state.view === view) { const old = document.getElementById('pf-crumb'); if (old) old.remove(); const h = profCrumbHtml(view); if (h) root().insertAdjacentHTML('afterbegin', h); } } catch (e) {}
}; }
{ const _goP = go; go = function (view) {
  if (PROF.key && /^prof-f-\d+$/.test(view)) titles[view] = (+view.slice(7) + 1) + '. ' + profCur().folders[+view.slice(7)].t;
  if (PROF.key && window._profEntering && ['home', 'dashboard', 'espace', 'espace-logi'].includes(view)) view = 'prof-home';
  if (PROF.crumb && PROF.crumb.view !== view) PROF.crumb = null;
  const r = _goP.apply(this, [view].concat([].slice.call(arguments, 1)));
  try { profNavActive(view); if (PROF.key && typeof dgMenuClose === 'function') dgMenuClose(); } catch (e) {}
  return r;
}; }
{ const _eaP = enterApp; enterApp = function () {
  profApply(); window._profEntering = true;
  try { return _eaP.apply(this, arguments); } finally { window._profEntering = false; }
}; }
{ const _arP = applyRoleNav; applyRoleNav = function () { const r = _arP.apply(this, arguments); profApply(); return r; }; }
{ const _beP = bottomEntries; bottomEntries = function (role) {
  if (!profKey(role)) return _beP(role);
  const rep = { DG: 'daily', LOGI: 'reports-truck', STOCK: 'reports-stock', MECA: 'my-report', HSE: 'my-report' }[profKey(role)];
  return [[PROF_IC('home'), 'Accueil', 'prof-home'], [PROF_IC('archive'), 'Dossiers', '#dossiers'], [PROF_IC('file'), profKey(role) === 'MECA' || profKey(role) === 'HSE' ? 'Mon rapport' : 'Rapports', rep], [PROF_IC('user'), 'Profil', '#profil']];
}; }
{ const _bgP = bottomGo; bottomGo = function (v) {
  if (v === '#dossiers') { setTimeout(() => { const s = document.getElementById('sidebar'); if (s) s.classList.add('open'); const sc = document.getElementById('side-scrim'); if (sc) sc.classList.add('on'); }, 0); return; } // après le clic (sinon le menu se referme aussitôt)
  return _bgP(v);
}; }

/* ---------- Application chauffeur : « Mes rubriques » et prochaine action ---------- */
function drvNextAction(me) {
  const v = me && me.vehicle, act = me && me.activeTrip;
  if (!v) return 'Aucun véhicule ne vous est affecté : contactez votre responsable logistique.';
  if (v.immobilized) return 'Véhicule immobilisé : attendez la remise en service par l\'atelier.';
  if (act) return 'Mission en cours : à l\'arrivée, appuyez sur « ' + (v.type === 'TRUCK' ? 'Arrêt de la journée' : 'Arrivée') + ' ».';
  return 'Démarrez votre mission, puis enregistrez vos pleins et dépenses avec la photo du reçu.';
}
function drvRubriquesHtml(me) {
  const tid = me && me.activeTrip ? esc(me.activeTrip.id) : '', v = me && me.vehicle;
  const R = [['map-pin', 'Ma mission', "drvOpenMissions()"], ['truck', 'Mon véhicule', "drvTab('maint')"], ['clipboard', 'Mon rapport journalier', "drvTab('sheet')"], ['fuel', 'Carburant', "drvTab('fuel')"],
    ['alert', 'Signaler une panne', v ? `drvFaultForm('${tid}')` : ''], ['shield', 'Signaler un incident', v ? `drvIncidentForm('${tid}')` : ''], ['file', 'Mes documents', "drvTab('profile')"],
    ['clock', 'Mon historique', 'drvMissionHistory()'], ['user', 'Mon profil', "drvTab('profile')"], ['message', 'Aide et assistance', 'openReportProblem()']];
  return `<div class="drv-card pf-drv"><h4>${PROF_IC('archive')} Mes rubriques</h4><div class="pf-drv-grid">${R.map((r, i) => `<button ${r[2] ? `onclick="${r[2]}"` : 'disabled'}><span class="pf-num">${i + 1}</span>${PROF_IC(r[0])}<b>${r[1]}</b></button>`).join('')}</div></div>`;
}
function drvOpenMissions() { const d = document.querySelector('#drv-root details'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
{ const _dhP = drvHomeHtml; drvHomeHtml = function (me) {
  const h = _dhP(me);
  const i = h.indexOf('<div class="drv-card" id="drv-fiche">');
  return i > 0 ? h.slice(0, i) + drvRubriquesHtml(me) + h.slice(i) : h + drvRubriquesHtml(me);
}; }
{ const _dpP = drvHomeHtml; drvHomeHtml = function (me) { // prochaine action juste sous la salutation
  const h = _dpP(me), k = h.indexOf('</div></div>');
  const next = `<div class="pf-next">${PROF_IC('target')}<div><span>Prochaine action</span><b>${esc(drvNextAction(me))}</b></div></div>`;
  return k > 0 ? h.slice(0, k + 12) + next + h.slice(k + 12) : next + h;
}; }
