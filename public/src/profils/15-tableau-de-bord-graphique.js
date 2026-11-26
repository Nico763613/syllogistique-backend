/* =====================================================================
   TABLEAU DE BORD GRAPHIQUE — modèle unique pour tous les responsables
   Bandeau (photo camion) · 4 cartes résumé · Actions rapides ·
   Ma performance (anneau + courbe) · Carte métier · Graphique barres ·
   Notifications · bandeau de valeurs.
   Toutes les valeurs viennent du serveur ; sans donnée : « — » ou
   « Pas encore de données » (aucun chiffre inventé).
   ===================================================================== */

/* ---------- Profils supplémentaires : Opérations, Comptabilité, Commercial ---------- */
PROFILES.OPS = {
  roles: ['RESPONSABLE_OPERATIONS'], title: 'Tableau de bord des opérations', space: 'Responsable des opérations',
  todo: 'Validez les fiches vérifiées par la Logistique, contrôlez les reçus papier, puis transmettez à la Comptabilité.',
  folders: [
    { t: 'Validation', ic: 'check-circle', subs: [['Fiches à valider', 'ops-validation', 'Fiches de bord vérifiées par la Logistique.'], ['Dépenses et reçus', 'driver-expenses', 'Contrôle des reçus papier.']] },
    { t: 'Suivi', ic: 'chart', subs: [['Historique des missions', 'driver-missions', 'Toutes les missions.'], ['Fiches de bord', 'driver-sheets', 'Fiches du jour.']] },
  ],
};
PROFILES.COMPTA = {
  roles: ['COMPTABLE'], title: 'Tableau de bord comptable', space: 'Comptabilité',
  todo: 'Traitez les dépenses validées, marquez les paiements, puis facturez les transports validés.',
  folders: [
    { t: 'Dépenses', ic: 'receipt', subs: [['Dépenses à traiter', 'compta', 'Dépenses validées par les Opérations.']] },
    { t: 'Facturation', ic: 'file', subs: [['Ventes et factures', 'ventes', 'Factures, reçus, encaissements.']] },
  ],
};
PROFILES.COMMERCIAL = {
  roles: ['RESPONSABLE_COMMERCIAL'], title: 'Tableau de bord commercial', space: 'Service commercial',
  todo: 'Suivez les devis et commandes, relancez les factures impayées.',
  folders: [
    { t: 'Ventes', ic: 'cart', subs: [['Clients, devis, commandes, factures', 'ventes', 'Tout le circuit commercial.'], ['Indicateurs détaillés', 'dash-commercial', 'Chiffre d\'affaires, encaissements, créances.']] },
  ],
};

/* ---------- Petits graphiques SVG (sans bibliothèque, légers pour téléphone) ---------- */
const DB_DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
function dbLbl(k) {
  k = String(k || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return DB_DAYS[new Date(k + 'T12:00:00Z').getUTCDay()] + ' ' + k.slice(8);
  if (/^\d{4}-\d{2}$/.test(k)) return ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'][+k.slice(5) - 1] || k;
  return k.slice(0, 10);
}
function dbShort(n) { n = +n || 0; const a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(1).replace('.0', '') + ' Md' : a >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' M' : a >= 1e4 ? Math.round(n / 1e3) + ' k' : fmt(Math.round(n)); }
function dbDonut(pct, label) {
  if (pct === null || pct === undefined || isNaN(pct)) return `<div class="db-donut empty"><b>—</b><small>${esc(label)}</small></div>`;
  const p = Math.max(0, Math.min(100, +pct)), r = 52, c = 2 * Math.PI * r, col = p >= 80 ? 'var(--sage)' : p >= 50 ? 'var(--gold)' : 'var(--terra)';
  return `<div class="db-donut"><svg viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--grey-light)" stroke-width="14"/><circle cx="64" cy="64" r="${r}" fill="none" stroke="${col}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 64 64)"/></svg><div><b>${Math.round(p)} %</b><small>${esc(label)}</small></div></div>`;
}
function dbLine(vals) { // barres pâles + courbe, comme le modèle
  const v = (vals || []).map((x) => +x || 0); if (v.length < 2 || !v.some((x) => x)) return '<div class="db-nodata">Pas encore de données sur la période.</div>';
  const W = 320, H = 110, mx = Math.max(...v) || 1, st = W / (v.length - 1), y = (x) => H - 8 - (x / mx) * (H - 22);
  const pts = v.map((x, i) => `${(i * st).toFixed(1)},${y(x).toFixed(1)}`).join(' ');
  const bw = Math.max(4, st * 0.55);
  return `<svg class="db-line" viewBox="-6 0 ${W + 12} ${H}" preserveAspectRatio="none" aria-hidden="true">${v.map((x, i) => `<rect x="${(i * st - bw / 2).toFixed(1)}" y="${y(x).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - y(x)).toFixed(1)}" fill="var(--navy-soft)" opacity=".18"/>`).join('')}<polyline points="${pts}" fill="none" stroke="var(--navy-soft)" stroke-width="2.5" stroke-linejoin="round"/>${v.map((x, i) => `<circle cx="${(i * st).toFixed(1)}" cy="${y(x).toFixed(1)}" r="${i === v.length - 1 ? 4.5 : 3}" fill="var(--navy-soft)"/>`).join('')}</svg>`;
}
function dbBars(items, unit) { // [{l, v}]
  const it = (items || []).filter((x) => x && x.l !== undefined); const vals = it.map((x) => +x.v || 0);
  if (!it.length || !vals.some((x) => x)) return '<div class="db-nodata">Pas encore de données sur la période.</div>';
  const mx = Math.max(...vals) || 1, top = vals.indexOf(mx);
  return `<div class="db-bars">${it.map((x, i) => `<div class="db-bar${i === top ? ' top' : ''}"><em>${i === top ? esc(dbShort(x.v)) + (unit ? ' ' + esc(unit) : '') : ''}</em><span style="height:${Math.max(3, Math.round(vals[i] / mx * 100))}%"></span><small>${esc(x.l)}</small></div>`).join('')}</div>`;
}
const dbLast = (arr, n) => (arr || []).slice(-(n || 7));

/* ---------- Données de chaque profil ---------- */
async function profDash(key) {
  const q = profQ(), qa = q ? q + '&' : '?', T = profTry;
  const card = (ic, l, v, sub, go, btn) => ({ ic, l, v, sub, go, btn });
  const kv = (d, k) => { const x = d && Array.isArray(d.kpis) && d.kpis.find((y) => y.key === k); return x ? x.value : null; };
  if (key === 'DG') {
    const [d, fl, st] = await Promise.all([T('/dashboards/direction' + q), T('/dashboards/fleet' + q), T('/dashboards/stock' + q)]);
    const f = (d && d.fleet) || {}, ft = f.trucks || {}, fAv = f.available != null ? f.available : ft.available, fTot = f.total != null ? f.total : ft.total, m = (d && d.missions) || {}, alerts = ((d && d.alerts && d.alerts.items) || []).map((a) => ({ t: a.title, s: a.message, sev: a.severity, at: a.at }));
    profWorklist(fl, alerts);
    return {
      cards: [card('truck', 'Flotte disponible', fTot != null ? `${fmt(fAv || 0)} / ${fmt(fTot)}` : '—', f.availabilityPct != null ? f.availabilityPct + ' % du parc' : '', 'trucks', 'Voir la flotte'),
        card('map-pin', 'Missions en cours', profN(m.inProgress), m.total != null ? fmt(m.completed || 0) + ' terminée(s) sur la période' : '', 'driver-missions', 'Voir les missions'),
        card('banknote', 'Dépenses de la période', d && d.expenses ? dbShort(d.expenses.total) + ' GNF' : '—', d && d.expenses && d.expenses.variation != null ? (d.expenses.variation > 0 ? '+' : '') + d.expenses.variation + ' % vs période précédente' : '', 'compta', 'Détail des dépenses'),
        card('file', 'Rapports reçus', profN(d && d.reports && d.reports.newInPeriod), 'à consulter', 'daily', 'Ouvrir les rapports')],
      quick: [['target', 'Tableau détaillé', 'dashboard'], ['truck', 'Flotte', 'trucks'], ['fuel', 'Carburant', 'fuel'], ['package', 'Stocks', 'dash-stock'], ['users', 'Personnel', state.user.role === 'SUPER_ADMIN' ? 'staff-managers' : 'personnel'], ['chart', 'Rapports', 'reports-dg']],
      perf: { pct: f.availabilityPct, label: 'Disponibilité de la flotte', checks: [['Missions terminées', m.total != null ? `${fmt(m.completed || 0)}/${fmt(m.total || 0)}` : '—', true], ['Véhicules en maintenance', profN(f.maintenance), !f.maintenance], ['Alertes en attente', profN(d && d.alerts && d.alerts.unread), !(d && d.alerts && d.alerts.unread)]], line: dbLast(m.series).map((x) => x.total), lineT: 'Missions par période' },
      mid: { ic: 'package', t: 'Situation des stocks', rows: [['Valeur du stock', kv(st, 'stock_value') != null ? dbShort(kv(st, 'stock_value')) + ' GNF' : '—'], ['Articles en rupture', profN(kv(st, 'out_of_stock'))], ['Sous le seuil', profN(kv(st, 'below_minimum'))]], go: 'dash-stock' },
      bars: { t: 'Carburant consommé (L)', items: dbLast(d && d.fuel && d.fuel.series).map((x) => ({ l: dbLbl(x.key), v: x.value })), unit: 'L' },
      alerts,
    };
  }
  if (key === 'LOGI') {
    const fl = await T('/dashboards/fleet' + q), alerts = []; profWorklist(fl, alerts);
    const av = fl && fl.kpis && fl.kpis.find((k) => k.key === 'availability'), bs = (av && av.byStatus) || {}, avTot = av && av.total != null ? av.total : Object.values(bs).reduce((a, b) => a + (+b || 0), 0), w = (fl && fl.worklists) || {}, ch = (fl && fl.charts) || {};
    return {
      cards: [card('truck', 'Véhicules disponibles', av ? fmt(bs.AVAILABLE || 0) + ' / ' + fmt(avTot) : '—', av ? fmt(bs.ON_MISSION || 0) + ' en mission' : '', 'trucks', 'Voir la flotte'),
        card('map-pin', 'Missions en cours', profN((w.tripsInProgress || []).length), (w.tripsInProgress || []).filter((t) => t.late).length + ' en retard', 'driver-board', 'Suivi du jour'),
        card('fuel', 'Coût carburant', kv(fl, 'fuel_cost') != null ? dbShort(kv(fl, 'fuel_cost')) + ' GNF' : '—', kv(fl, 'consumption') != null ? kv(fl, 'consumption') + ' L/100 km en moyenne' : '', 'fuel', 'Voir le carburant'),
        card('clipboard', 'Fiches de bord', 'À vérifier', 'Fiches du jour envoyées par les chauffeurs', 'driver-sheets', 'Vérifier les fiches')],
      quick: [['clipboard', 'Fiches de bord', 'driver-sheets'], ['fuel', 'Carburant', 'fuel'], ['wrench', 'Pannes & maintenance', 'maintenance'], ['users', 'Chauffeurs', 'drivers'], ['banknote', 'Dépenses', 'driver-expenses'], ['chart', 'Rapports', 'reports-truck']],
      perf: { pct: av ? av.value : null, label: 'Disponibilité du parc', checks: [['Missions de la période', profN(kv(fl, 'trips')), true], ['Entretiens en retard', profN(kv(fl, 'maintenance_overdue')), !kv(fl, 'maintenance_overdue')], ['Documents à renouveler', profN(kv(fl, 'documents')), !kv(fl, 'documents')]], line: dbLast(ch.distanceTrend).map((x) => x.km), lineT: 'Kilomètres parcourus' },
      mid: { ic: 'wrench', t: 'Véhicules immobilisés', rows: (w.openDowntimes || []).slice(0, 3).map((x) => [x.vehicle, x.days + ' j — ' + (x.reason || '')]), empty: 'Aucun véhicule immobilisé.', go: 'maintenance' },
      bars: { t: 'Consommation carburant (L)', items: dbLast(ch.fuelTrend).map((x) => ({ l: dbLbl(x.period), v: x.liters })), unit: 'L' },
      alerts,
    };
  }
  if (key === 'STOCK') {
    const [st, ws] = await Promise.all([T('/dashboards/stock' + q), T('/dashboards/workspace' + q)]); const k = (ws && ws.kpis) || {}, ch = (st && st.charts) || {};
    const okPct = k.items ? Math.round((k.items - (k.belowMinimum || 0)) / k.items * 100) : null;
    return {
      cards: [card('package', 'Articles', profN(k.items), 'au catalogue', 'stock', 'Voir le stock'),
        card('download', 'Entrées du jour', profN(k.entriesToday), 'réceptions enregistrées', '#stock-in', 'Nouvelle entrée'),
        card('upload', 'Sorties du jour', profN(k.exitsToday), 'sorties enregistrées', '#stock-out', 'Nouvelle sortie'),
        card('alert', 'Sous le minimum', profN(k.belowMinimum), profN(kv(st, 'out_of_stock')) + ' en rupture', 'dash-stock', 'Voir les alertes')],
      quick: [['download', 'Nouvelle entrée', '#stock-in'], ['upload', 'Nouvelle sortie', '#stock-out'], ['clipboard', 'Inventaire', 'stock'], ['file', 'États des besoins', 'needs'], ['scale', 'Analyses', 'dash-stock'], ['file', 'Mon rapport', 'my-report']],
      perf: { pct: okPct, label: 'Articles au-dessus du minimum', checks: [['Lots bientôt périmés', profN(kv(st, 'expiring')), !kv(st, 'expiring')], ['Stock dormant', profN(kv(st, 'dormant')), !kv(st, 'dormant')], ['Couverture', kv(st, 'coverage') != null ? kv(st, 'coverage') + ' j' : '—', true]], line: dbLast(ch.movementsTrend).map((x) => x.inCount), lineT: 'Entrées par période' },
      mid: { ic: 'clock', t: 'Derniers mouvements', rows: ((ws && ws.recent) || []).slice(0, 3).map((m) => [m.item, (m.type === 'OUT' ? '− ' : '+ ') + fmt(m.quantity)]), empty: 'Aucun mouvement récent.', go: 'stock' },
      bars: { t: 'Sorties par période', items: dbLast(ch.movementsTrend).map((x) => ({ l: dbLbl(x.period), v: x.outCount })) },
      alerts: ((ws && ws.alerts) || []).map((a) => ({ t: a.name, s: `${fmt(a.quantity)} ${a.unit || ''} — minimum ${fmt(a.minimum)}`, sev: a.quantity <= 0 ? 'CRITICAL' : 'WARNING' })),
    };
  }
  if (key === 'MECA') {
    const ws = await T('/dashboards/workspace' + q), k = (ws && ws.kpis) || {}, tot = (k.todo || 0) + (k.inProgress || 0) + (k.doneMonth || 0);
    return {
      cards: [card('wrench', 'À effectuer', profN(k.todo), 'interventions planifiées ou en retard', 'atelier', 'Ouvrir l\'atelier'), card('clock', 'En cours', profN(k.inProgress), 'interventions', 'atelier', 'Continuer'),
        card('ban', 'Véhicules immobilisés', profN(k.down), 'en attente de réparation', 'atelier', 'Voir'), card('check-circle', 'Terminées ce mois', profN(k.doneMonth), 'interventions clôturées', 'espace', 'Historique')],
      quick: [['wrench', 'Atelier', 'atelier'], ['truck', 'Camions', 'trucks'], ['car', 'Véhicules', 'service-vehicles'], ['package', 'Stock pièces', 'stock'], ['file', 'Demander des pièces', 'needs'], ['clipboard', 'Mon rapport', 'my-report']],
      perf: { pct: tot ? Math.round((k.doneMonth || 0) / tot * 100) : null, label: 'Interventions terminées', checks: [['Terminées ce mois', profN(k.doneMonth), true], ['En cours', profN(k.inProgress), true], ['Immobilisés', profN(k.down), !k.down]], line: null },
      mid: { ic: 'truck', t: 'Véhicules à l\'arrêt', rows: ((ws && ws.stopped) || []).slice(0, 3).map((v) => [v.vehicle, v.status === 'IMMOBILIZED' ? 'Immobilisé' : 'En maintenance']), empty: 'Aucun véhicule à l\'arrêt.', go: 'atelier' },
      bars: { t: 'Charge de l\'atelier', items: [{ l: 'À faire', v: k.todo }, { l: 'En cours', v: k.inProgress }, { l: 'Immobilisés', v: k.down }, { l: 'Terminées', v: k.doneMonth }] },
      alerts: ((ws && ws.stopped) || []).map((v) => ({ t: v.vehicle + ' · ' + (v.plate || ''), s: v.status === 'IMMOBILIZED' ? 'Immobilisé' : 'En maintenance', sev: 'WARNING' })),
    };
  }
  if (key === 'HSE') {
    const [ws, hs] = await Promise.all([T('/dashboards/workspace' + q), T('/dashboards/hse' + q)]); const k = (ws && ws.kpis) || {}, ch = (hs && hs.charts) || {};
    return {
      cards: [card('eye', 'Inspections du mois', profN(k.inspections), k.compliance != null ? k.compliance + ' % conformes' : '', 'dash-hse', 'Inspections'), card('alert', 'Incidents ouverts', profN(k.openIncidents), 'à traiter', 'dash-hse', 'Suivre'),
        card('hard-hat', 'Accidents du mois', profN(k.accidents), kv(hs, 'days_without_lti') != null ? kv(hs, 'days_without_lti') + ' j sans accident avec arrêt' : '', 'dash-hse', 'Détail'), card('check-circle', 'Actions correctives', profN(kv(hs, 'open_actions')), 'ouvertes', 'dash-hse', 'Voir')],
      quick: [['eye', 'Inspection', 'dash-hse'], ['alert', 'Incident', 'dash-hse'], ['hard-hat', 'EPI', 'dash-hse'], ['file', 'Mon rapport', 'my-report'], ['chart', 'Rapports', state.user.role === 'GESTIONNAIRE_HSE' ? 'reports-hse' : 'espace'], ['user', 'Mon espace', 'espace']],
      perf: { pct: k.compliance, label: 'Conformité des inspections', checks: [['Conformité EPI', kv(hs, 'ppe') != null ? kv(hs, 'ppe') + ' %' : '—', true], ['Causeries tenues', kv(hs, 'talks') != null ? kv(hs, 'talks') + ' %' : '—', true], ['Accidents', profN(k.accidents), !k.accidents]], line: dbLast(ch.incidentsTrend).map((x) => x.incidents), lineT: 'Incidents par période' },
      mid: { ic: 'eye', t: 'Dernières inspections', rows: ((ws && ws.inspections) || []).slice(0, 3).map((i) => [i.type, i.compliant ? 'Conforme' : 'Non conforme']), empty: 'Aucune inspection récente.', go: 'dash-hse' },
      bars: { t: 'Incidents par type', items: (ch.incidentsByType || []).slice(0, 6).map((x) => ({ l: x.key, v: x.count })) },
      alerts: ((ws && ws.incidents) || []).map((i) => ({ t: i.type + (i.severity ? ' — ' + i.severity : ''), s: i.description || '', sev: 'WARNING' })),
    };
  }
  if (key === 'OPS' || key === 'COMPTA') {
    const ops = key === 'OPS';
    const [ex, sh, rp, ub] = await Promise.all([T('/driver-admin/expenses' + q), ops ? T('/driver-admin/sheets/pending' + q) : null, ops ? T('/staff/reports/pending' + q) : null, ops ? null : T('/sales/transport/unbilled' + q)]);
    const E = Array.isArray(ex) ? ex : [], pend = E.filter((e) => e.status === 'PENDING'), appr = E.filter((e) => e.status === 'APPROVED'), paid = appr.filter((e) => e.paidAt);
    const sum = (a) => a.reduce((s, e) => s + (+e.amount || 0), 0), cat = {}; E.forEach((e) => { cat[e.category || 'AUTRE'] = (cat[e.category || 'AUTRE'] || 0) + (+e.amount || 0); });
    const days = []; for (let i = 6; i >= 0; i--) days.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
    const perDay = days.map((d) => E.filter((e) => String(e.date || '').slice(0, 10) === d).length);
    const U = Array.isArray(ub) ? ub : (ub && Array.isArray(ub.items) ? ub.items : []);
    return {
      cards: ops ? [card('clipboard', 'Fiches à valider', profN(Array.isArray(sh) ? sh.length : null), 'vérifiées par la Logistique', 'ops-validation', 'Valider'), card('file', 'Rapports à valider', profN(Array.isArray(rp) ? rp.length : null), 'rapports du personnel', 'ops-validation', 'Ouvrir'),
        card('banknote', 'Dépenses en attente', profN(pend.length), dbShort(sum(pend)) + ' GNF', 'driver-expenses', 'Contrôler'), card('check-circle', 'Dépenses validées', profN(appr.length), dbShort(sum(appr)) + ' GNF', 'driver-expenses', 'Voir')]
        : [card('banknote', 'Dépenses à payer', profN(appr.length - paid.length), dbShort(sum(appr) - sum(paid)) + ' GNF', 'compta', 'Traiter'), card('check-circle', 'Dépenses payées', profN(paid.length), dbShort(sum(paid)) + ' GNF', 'compta', 'Voir'),
          card('truck', 'Transports à facturer', profN(U.length), 'trajets validés non facturés', 'compta', 'Facturer'), card('file', 'Factures', 'Ventes', 'factures et reçus', 'ventes', 'Ouvrir')],
      quick: ops ? [['check-circle', 'Fiches à valider', 'ops-validation'], ['banknote', 'Dépenses & reçus', 'driver-expenses'], ['clipboard', 'Fiches de bord', 'driver-sheets'], ['map-pin', 'Missions', 'driver-missions']]
        : [['banknote', 'Dépenses', 'compta'], ['file', 'Ventes & factures', 'ventes'], ['receipt', 'Reçus', 'compta'], ['chart', 'Paiements', 'compta']],
      perf: ops ? { pct: E.length ? Math.round((E.length - pend.length) / E.length * 100) : null, label: 'Dépenses contrôlées', checks: [['Validées', profN(appr.length), true], ['En attente', profN(pend.length), !pend.length], ['Rejetées', profN(E.filter((e) => e.status === 'REJECTED').length), true]], line: perDay, lineT: 'Dépenses saisies (7 jours)' }
        : { pct: appr.length ? Math.round(paid.length / appr.length * 100) : null, label: 'Dépenses validées payées', checks: [['Payées', profN(paid.length), true], ['À payer', profN(appr.length - paid.length), appr.length === paid.length], ['Transports à facturer', profN(U.length), !U.length]], line: perDay, lineT: 'Dépenses saisies (7 jours)' },
      mid: { ic: 'receipt', t: 'Dernières dépenses', rows: E.slice(0, 3).map((e) => [(e.driver || '—') + ' · ' + (e.category || ''), dbShort(e.amount) + ' GNF']), empty: 'Aucune dépense.', go: ops ? 'driver-expenses' : 'compta' },
      bars: { t: 'Dépenses par catégorie (GNF)', items: Object.entries(cat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, v]) => ({ l: l.charAt(0) + l.slice(1).toLowerCase().replace(/_/g, ' '), v })) },
      alerts: pend.slice(0, 5).map((e) => ({ t: 'Dépense à contrôler : ' + (e.driver || ''), s: dbShort(e.amount) + ' GNF · ' + (e.category || ''), sev: e.receiptUrl ? 'WARNING' : 'CRITICAL' })),
    };
  }
  if (key === 'COMMERCIAL') {
    const c = await T('/dashboards/commercial' + q), K = (c && c.kpis) || [], ch = (c && c.charts) || {}, tr = dbLast(ch.revenueTrend);
    const ttc = tr.reduce((s, x) => s + (+x.ttc || 0), 0), col = tr.reduce((s, x) => s + (+x.collected || 0), 0);
    const ic = ['chart', 'banknote', 'file', 'wallet'];
    return {
      cards: K.slice(0, 4).map((x, i) => card(ic[i], x.label, x.value == null ? '—' : (x.unit === 'GNF' ? dbShort(x.value) + ' GNF' : fmt(x.value) + (x.unit === '%' ? ' %' : '')), x.variationPercent != null ? (x.variationPercent > 0 ? '+' : '') + x.variationPercent + ' % vs période précédente' : '', 'ventes', 'Voir')),
      quick: [['cart', 'Ventes', 'ventes'], ['users', 'Clients', 'ventes'], ['file', 'Devis', 'ventes'], ['receipt', 'Factures', 'ventes'], ['chart', 'Indicateurs', 'dash-commercial']],
      perf: { pct: ttc ? Math.round(col / ttc * 100) : null, label: 'Taux d\'encaissement', checks: K.slice(4, 7).map((x) => [x.label, x.value == null ? '—' : (x.unit === 'GNF' ? dbShort(x.value) : fmt(x.value)), x.status !== 'critical']), line: tr.map((x) => x.sales), lineT: 'Nombre de ventes' },
      mid: { ic: 'wallet', t: 'Créances clients', rows: (ch.receivablesAging || []).slice(0, 4).map((x) => [x.label, dbShort(x.amount) + ' GNF']), empty: 'Aucune créance.', go: 'ventes' },
      bars: { t: 'Chiffre d\'affaires TTC (GNF)', items: tr.map((x) => ({ l: dbLbl(x.period), v: x.ttc })) },
      alerts: [],
    };
  }
  return { cards: [], quick: [], perf: { pct: null, label: '', checks: [] }, mid: null, bars: { t: '', items: [] }, alerts: [] };
}

/* ---------- Rendu : modèle unique ---------- */
function dbAct(go) { return go.charAt(0) === '#' ? (go === '#stock-in' ? "stockMove('in')" : go === '#stock-out' ? "stockMove('out')" : '') : `go('${go}')`; }
renderProfHome = async function () {
  const P = profCur(), u = state.user; if (!P) return renderHome();
  const now = new Date(), day = now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  root().innerHTML = `<div class="db-hero"><div class="db-hero-txt"><h2>${esc(u.firstName)} ${esc(u.lastName)}</h2><p>${esc(P.title)} — ${esc(P.space)}</p><p class="db-todo">${esc(P.todo)}</p></div>
      <div class="db-hero-date">${PROF_IC('clipboard')} <b>${esc(day.charAt(0).toUpperCase() + day.slice(1))}</b><span class="db-on">${PROF_IC('check-circle')} En service</span></div></div>
    <div id="db-body"><div class="db-cards">${[0, 1, 2, 3].map(() => '<div class="db-card sk"></div>').join('')}</div><div class="empty">Chargement du tableau de bord…</div></div>`;
  const view = state.view, d = await profDash(PROF.key); if (state.view !== view) return;
  const b = document.getElementById('db-body'); if (!b) return;
  const alerts = d.alerts || [];
  b.innerHTML = `<div class="db-cards">${d.cards.map((c) => `<div class="db-card"><span class="db-ci">${PROF_IC(c.ic)}</span><div><small>${esc(c.l)}</small><b>${c.v}</b>${c.sub ? `<em>${esc(c.sub)}</em>` : ''}${c.go ? `<button class="db-btn" onclick="${dbAct(c.go)}">${esc(c.btn || 'Ouvrir')} ${PROF_IC('chevron-right')}</button>` : ''}</div></div>`).join('')}</div>
    <div class="db-row2"><div class="db-panel"><div class="db-h"><h3>${PROF_IC('zap')} Mes actions rapides</h3><a onclick="go('prof-f-0')">Mes dossiers ${PROF_IC('chevron-right')}</a></div>
        <div class="db-quick">${d.quick.map((x) => `<button onclick="${dbAct(x[2])}">${PROF_IC(x[0])}<span>${esc(x[1])}</span></button>`).join('')}</div></div>
      <div class="db-panel"><div class="db-h"><h3>${PROF_IC('chart')} Ma performance</h3><span class="db-chip">Période en cours</span></div>
        <div class="db-perf">${dbDonut(d.perf.pct, d.perf.label)}<div class="db-perf-r"><ul>${(d.perf.checks || []).map((c) => `<li class="${c[1] === '—' ? 'na' : c[2] ? 'ok' : 'ko'}">${PROF_IC(c[1] === '—' ? 'dot' : c[2] ? 'check-circle' : 'alert')}<span>${esc(c[0])}</span><b>${c[1]}</b></li>`).join('')}</ul>
        ${d.perf.line ? `<div class="db-mini"><small>${esc(d.perf.lineT || '')}</small>${dbLine(d.perf.line)}</div>` : ''}</div></div></div></div>
    <div class="db-row3">${d.mid ? `<div class="db-panel"><div class="db-h"><h3>${PROF_IC(d.mid.ic)} ${esc(d.mid.t)}</h3></div>${d.mid.rows.length ? d.mid.rows.map((r) => `<div class="db-kv"><span>${esc(r[0])}</span><b>${esc(String(r[1]))}</b></div>`).join('') : `<div class="db-nodata">${esc(d.mid.empty || 'Aucune donnée.')}</div>`}<button class="db-btn ghost" onclick="go('${d.mid.go}')">Voir les détails ${PROF_IC('chevron-right')}</button></div>` : ''}
      <div class="db-panel"><div class="db-h"><h3>${PROF_IC('chart')} ${esc(d.bars.t)}</h3></div>${dbBars(d.bars.items, d.bars.unit)}</div>
      <div class="db-panel"><div class="db-h"><h3>${PROF_IC('bell')} Notifications</h3>${typeof dgAlertsGo === 'function' && ['DG'].includes(PROF.key) ? `<a onclick="dgAlertsGo()">Voir tout ${PROF_IC('chevron-right')}</a>` : ''}</div>
        ${alerts.length ? alerts.slice(0, 5).map((a) => `<div class="db-note ${/CRIT|HIGH/.test(a.sev || '') ? 'bad' : 'warn'}">${PROF_IC(/CRIT|HIGH/.test(a.sev || '') ? 'alert' : 'info')}<div><b>${esc(a.t)}</b>${a.s ? `<small>${esc(a.s)}</small>` : ''}</div></div>`).join('') : `<div class="db-note ok">${PROF_IC('check-circle')}<div><b>Aucune alerte en cours</b><small>Tout est à jour.</small></div></div>`}</div></div>
    <div class="db-values"><span>${PROF_IC('shield')} Sécurité avant tout</span><span>${PROF_IC('users')} Ensemble plus loin</span><span>${PROF_IC('truck')} Transport responsable</span></div>`;
};
