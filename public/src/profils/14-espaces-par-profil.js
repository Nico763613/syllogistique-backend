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
    // Règle : chaque écran n'apparaît qu'une seule fois dans le menu (pas de doublon)
    folders: [
      { t: 'Direction et administration', ic: 'building', subs: [
        ['Départements', 'home', 'Les départements actifs et leur accès direct.'],
        ['Historique des décisions', '#history', 'Journal des validations, décisions et activités.', ['SUPER_ADMIN']],
        ['Historique des décisions', null, 'Journal des validations, décisions et activités.', ['DIRECTEUR_GENERAL']],
      ] },
      { t: 'Gestion logistique', ic: 'truck', subs: [
        ['Flotte de camions', 'trucks', 'Camions, fiches et documents.'],
        ['Véhicules de service', 'service-vehicles', 'Véhicules de service et IT.'],
        ['Missions et déplacements', 'driver-missions', 'Historique des missions.'],
        ['Carburant', 'fuel', 'Consommation par camion, par véhicule, totale.'],
        ['Maintenance', 'maintenance', 'Pannes, entretiens, réparations.'],
        ['Validation des fiches', 'ops-validation', 'Fiches vérifiées à valider.', ['SUPER_ADMIN']],
      ] },
      { t: 'Gestion des stocks', ic: 'package', subs: [
        ['Stock global', 'dash-stock', 'Indicateurs, alertes et valeur du stock.'],
        ['Articles', 'stock:articles', 'Catalogue des articles.'],
        ['Entrées', 'stock:entrees', 'Réceptions et entrées.'],
        ['Sorties', 'stock:sorties', 'Sorties vers les véhicules et départements.'],
        ['Inventaires', 'stock:inventaire', 'Comptages et écarts.'],
        ['Réapprovisionnement', 'needs', 'États des besoins.'],
      ] },
      { t: 'Ressources humaines', ic: 'users', subs: [
        ['Personnel et responsables', 'personnel', 'Comptes actifs, invitations en attente, suspendus.', ['DIRECTEUR_GENERAL']],
        ['Responsables', 'staff-managers', 'Comptes DG et Responsable logistique.', ['SUPER_ADMIN']],
        ['Chauffeurs camion', 'drivers:TRUCK', 'Liste, camion attribué, permis, rapports.'],
        ['Chauffeurs véhicule de service', 'drivers:SERVICE_VEHICLE', 'Liste, véhicule attribué, permis, rapports.'],
        ['Archives chauffeurs', 'drivers:ARCH', 'Historique à télécharger, imprimer ou envoyer.'],
        ['Mécaniciens', 'staff-mech', 'Équipe et rapports.'],
        ['Agents HSE', 'staff-hse', 'Équipe et rapports.'],
        ['Gestionnaires de stock', 'staff-store', 'Équipe et rapports.'],
        ['Pointeurs', 'staff-pointer', 'Équipe et rapports.'],
      ] },
      { t: 'Comptabilité et dépenses', ic: 'receipt', subs: [
        ['Dépenses par département', 'compta', 'Dépenses validées et à valider.'],
        ['Dépenses des chauffeurs', 'driver-expenses', 'Dépenses et reçus photographiés.'],
        ['Dépenses par véhicule', 'reports-truck', 'Coûts par camion et véhicule.'],
      ] },
      { t: 'Rapports et statistiques', ic: 'chart', subs: [
        ['Tableau de bord détaillé', 'dashboard', 'Graphiques, filtres jour, semaine, mois, année.'],
        ['Rapports journaliers', 'daily', 'Tous les rapports du jour, classés par dossier.'],
        ['Synthèses et archives', 'reports-dg', 'Semaine, mois, vue consolidée ; télécharger, imprimer, envoyer.'],
      ] },
      { t: 'Paramètres et sécurité', ic: 'shield', subs: [
        ['Entreprise et logo', 'settings', 'Identité de l\'entreprise, logo, sites.'],
        ['Appareils autorisés', 'driver-devices', 'Téléphones des chauffeurs.'],
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
        ['Liste des camions', 'trucks', 'Fiche de chaque camion, documents administratifs.'],
        ['Missions et trajets', 'driver-missions', 'Historique des missions camions et véhicules.'],
        ['Rapports journaliers', 'driver-sheets', 'Fiches de bord du jour.'],
        ['Historique et coûts par camion', 'reports-truck', 'Rapports camions.'],
      ] },
      { t: 'Véhicules de service', ic: 'car', subs: [
        ['Liste des véhicules', 'service-vehicles', 'Fiche de chaque véhicule, documents.'],
        ['Historique et coûts par véhicule', 'reports-service', 'Rapports véhicules de service.'],
      ] },
      { t: 'Chauffeurs', ic: 'users', subs: [
        ['Chauffeurs camion', 'drivers:TRUCK', 'Liste, camion attribué, permis, rapports.'],
        ['Chauffeurs véhicule de service', 'drivers:SERVICE_VEHICLE', 'Liste, véhicule attribué, permis, rapports.'],
        ['Archives chauffeurs', 'drivers:ARCH', 'Historique à télécharger, imprimer ou envoyer.'],
        ['Suivi du jour', 'driver-board', 'Missions en cours.'],
        ['Rapports et présence', 'reports-drivers', 'Présence, fiches de bord, consommation par chauffeur.'],
        ['Pointage', 'pointage', 'Présence du jour.'],
        ['Enrôlement WhatsApp', 'enrol', 'Envoyer le lien d\'installation.', ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE']],
        ['Appareils', 'driver-devices', 'Téléphone autorisé de chaque chauffeur.'],
      ] },
      { t: 'Carburant', ic: 'fuel', subs: [
        ['Camions', 'fuel:trucks', 'Consommation par camion.'],
        ['Véhicules de service', 'fuel:service', 'Consommation par véhicule.'],
        ['Consommation totale', 'fuel:total', 'Camions et véhicules réunis.'],
        ['Nouveau ravitaillement', 'fuel:new', 'Enregistrer un plein et le kilométrage.'],
        ['Historique et tarif', 'fuel:history', 'Tous les pleins.'],
      ] },
      { t: 'Maintenance', ic: 'wrench', subs: [
        ['Pannes et entretiens', 'maintenance', 'Pannes, interventions, camions et véhicules.'],
        ['Statistiques de la flotte', 'dash-fleet', 'Coûts, préventif, correctif, écarts carburant.'],
        ['Pièces utilisées', 'stock:sorties', 'Sorties de stock imputées aux véhicules.'],
        ['Mécaniciens', 'staff-mech', 'Équipe et rapports.'],
      ] },
      { t: 'HSE', ic: 'hard-hat', subs: [
        ['Tableau HSE', 'dash-hse', 'Incidents, accidents, mesures correctives.'],
        ['Agents HSE et rapports', 'reports-hse', 'Rapports journaliers, hebdomadaires, mensuels.'],
      ] },
      { t: 'Dépenses et achats', ic: 'chart', subs: [
        ['Dépenses des chauffeurs', 'driver-expenses', 'Dépenses et reçus.'],
        ['Achats et besoins', 'purchases', 'Achats et réapprovisionnement.'],
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
        ['Catalogue des articles', 'stock:articles', 'Tous les articles, leur fiche et leurs mouvements.'],
      ] },
      { t: 'Entrées de stock', ic: 'download', subs: [
        ['Nouvelle entrée', '#stock-in', 'Réception fournisseur ou de pièces.'],
        ['Historique des entrées', 'stock:entrees', 'Entrées enregistrées.'],
      ] },
      { t: 'Sorties de stock', ic: 'upload', subs: [
        ['Nouvelle sortie', '#stock-out', 'Affectation à un véhicule ou un département.'],
        ['Historique des sorties', 'stock:sorties', 'Sorties enregistrées.'],
      ] },
      { t: 'Inventaires', ic: 'clipboard', subs: [
        ['Inventaires', 'stock:inventaire', 'Quantité théorique, physique et écarts.'],
      ] },
      { t: 'Analyse et calculs', ic: 'scale', subs: [
        ['Indicateurs du stock', 'dash-stock', 'Rotation, couverture, stock dormant.'],
      ] },
      { t: 'Alertes', ic: 'alert', subs: [
        ['Stock faible et ruptures', 'stock:alertes', 'Articles sous le seuil ou en rupture.'],
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
      { t: 'Terrain HSE', ic: 'hard-hat', subs: [
        ['Inspections, incidents et EPI', 'dash-hse', 'Contrôles, déclarations avec photos, équipements de protection.'],
      ] },
      { t: 'Rapports HSE', ic: 'file', subs: [
        ['Mon rapport du jour', 'my-report', 'Rapport journalier.'],
        ['Rapports et historique', 'reports-hse', 'Rapports hebdomadaires et mensuels.', ['GESTIONNAIRE_HSE']],
        ['Mon historique', 'espace', 'Mes inspections et incidents récents.'],
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
  root().innerHTML = `<div class="pf-hero"><div class="pf-id">${avatarHtml(56)}<div><h2>${esc(u.firstName)} ${esc(u.lastName)}</h2><div>${esc(roleLabel(u.role))} · ${esc(P.space)}</div></div></div><div class="pf-date">${esc(today.charAt(0).toUpperCase() + today.slice(1))}</div></div>
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
  PROF.crumb = { i, label: s[0], view: String(s[1]).split(':')[0], hint: s[2] };
  if (s[1] === '#stock-in') return stockMove('in');
  if (s[1] === '#stock-out') return stockMove('out');
  if (s[1] === '#history') return typeof openHistory === 'function' && openHistory();
  if (s[1] === '#alerts') return typeof dgAlertsGo === 'function' && dgAlertsGo();
  profGoTab(s[1]);
}
// « écran:onglet » ouvre directement le bon onglet (stock, carburant, chauffeurs)
// Ouvert depuis le menu avec un onglet précis : l'écran n'affiche que ce contenu (pas de barre d'onglets en doublon du menu)
const MENU_LOCK_FN = { stock: 'setStockTab', fuel: 'setFuelTab', drivers: 'setDrvFilter' };
function profGoTab(v) {
  const [view, tab] = String(v).split(':');
  window._menuLock = tab && MENU_LOCK_FN[view] ? { view, fn: MENU_LOCK_FN[view] } : null;
  if (tab) {
    if (view === 'stock') stockTab = tab;
    else if (view === 'fuel') fuelTab = tab;
    else if (view === 'drivers') { window.DRVF = tab; window._drvOpen = null; window.DRVSUB = 'list'; }
  }
  if (tab) { try { const P = profCur(); if (P) P.folders.forEach((f, i) => { const s = profSubs(f).find((x) => x[1] === v); if (s) PROF.crumb = { i, label: s[0], view, hint: s[2] }; }); } catch (e) {} }
  go(view);
  if (tab) { try { const P = profCur(); const s = P && P.folders.flatMap((f) => profSubs(f)).find((x) => x[1] === v); const t = document.getElementById('view-title'); if (s && t) t.textContent = s[0]; } catch (e) {} }
  if (tab && view === 'stock' && typeof applyStockTab === 'function') setTimeout(() => { try { stockTab = tab; applyStockTab(); } catch (e) {} }, 0);
}
function profFind(view) { // retrouve le dossier d'un écran ouvert autrement (lien interne, recherche)
  const P = profCur(); if (!P) return null;
  for (let i = 0; i < P.folders.length; i++) { const s = profSubs(P.folders[i]).find((x) => x[1] && String(x[1]).split(':')[0] === view); if (s) return { i, label: s[0], view, hint: s[2] }; }
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
      <div class="pf-nav-s">${profSubs(f).map((s, j) => s[1] ? `<div class="pf-nav-item sub" data-pv="${esc(String(s[1]).split(':')[0])}" data-i="${i}" data-j="${j}" onclick="profOpen(${i},${j})"><span>${esc(s[0])}</span></div>` : `<div class="pf-nav-item sub off"><span>${esc(s[0])}</span><em>bientôt</em></div>`).join('')}</div></div>`).join('');
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
  if (PROF.key && window._profEntering && ['home', 'dashboard', 'espace', 'espace-logi', 'dash-commercial', 'caisse', 'pointage'].includes(view)) view = 'prof-home';
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
  const rep = { DG: 'daily', LOGI: 'reports-truck', STOCK: 'reports-stock', MECA: 'my-report', HSE: 'my-report', OPS: 'ops-validation', COMPTA: 'compta', COMMERCIAL: 'dash-commercial', CAISSE: 'my-report', POINTAGE: 'my-report' }[profKey(role)];
  return [[PROF_IC('home'), 'Accueil', 'prof-home'], [PROF_IC('archive'), 'Dossiers', '#dossiers'], [PROF_IC('file'), ['MECA', 'HSE', 'CAISSE', 'POINTAGE'].includes(profKey(role)) ? 'Mon rapport' : 'Rapports', rep], [PROF_IC('user'), 'Profil', '#profil']];
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
function drvRubriquesHtml(me) { // seulement ce qui n'est pas déjà à l'écran (boutons, fiche, missions, barre du bas)
  const tid = me && me.activeTrip ? esc(me.activeTrip.id) : '', v = me && me.vehicle;
  const R = [['truck', 'Mon véhicule', 'Entretiens et état du véhicule', "drvTab('maint')"], ['shield', 'Signaler un incident', 'Accident, vol, conflit, danger', v ? `drvIncidentForm('${tid}')` : ''],
    ['file', 'Mes documents', 'Permis et pièces du véhicule', "drvTab('profile')"], ['message', 'Aide et assistance', 'Écrire à la hiérarchie', 'openReportProblem()']];
  return `<div class="drv-card pf-drv"><h4>${PROF_IC('archive')} Autres rubriques</h4>${R.map((r) => `<button class="pf-drv-row" ${r[3] ? `onclick="${r[3]}"` : 'disabled'}>${PROF_IC(r[0])}<span><b>${r[1]}</b><small>${r[2]}</small></span>${PROF_IC('chevron-right')}</button>`).join('')}</div>`;
}
function drvOpenMissions() { const d = document.querySelector('#drv-root details'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
{ const _dhP = drvHomeHtml; drvHomeHtml = function (me) {
  const h = _dhP(me);
  const i = h.indexOf('<div class="drv-sync">');
  return i > 0 ? h.slice(0, i) + drvRubriquesHtml(me) + h.slice(i) : h + drvRubriquesHtml(me);
}; }
{ const _dpP = drvHomeHtml; drvHomeHtml = function (me) { // prochaine action juste sous la salutation
  const h = _dpP(me), k = h.indexOf('</div></div>');
  const next = `<div class="pf-next">${PROF_IC('target')}<div><span>Prochaine action</span><b>${esc(drvNextAction(me))}</b></div></div>`;
  return k > 0 ? h.slice(0, k + 12) + next + h.slice(k + 12) : next + h;
}; }
