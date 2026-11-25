// Convertit un pictogramme hérité (données) en icône SVG ; les icônes SVG passent telles quelles
const EMO_ICON = {"🚑":"alert","📅":"clock","🔍":"search","🖼":"image","🚛": "truck", "🚚": "truck", "🚙": "car", "🚗": "car", "✅": "check-circle", "✔": "check", "✓": "check", "📋": "clipboard", "➕": "plus", "➖": "minus", "💬": "message", "🕒": "clock", "💵": "banknote", "💰": "banknote", "🧾": "receipt", "👤": "user", "👥": "users", "🔧": "wrench", "🛠": "wrench", "📦": "package", "📷": "camera", "⛽": "fuel", "📝": "pencil", "✏": "pencil", "⬇": "download", "📥": "download", "⬆": "upload", "📤": "upload", "⚠": "alert", "🚨": "alert", "🚧": "alert", "📊": "chart", "📈": "chart", "✉": "mail", "📬": "mail", "📄": "file", "📜": "file", "🦺": "hard-hat", "🔒": "lock", "💾": "save", "🔄": "refresh", "🗄": "archive", "🗂": "archive", "🔔": "bell", "🔑": "key", "📲": "phone", "🏠": "home", "🧭": "compass", "❌": "x", "✖": "x", "🚫": "ban", "🏁": "flag", "⚖": "scale", "🎯": "target", "📍": "map-pin", "🛡": "shield", "👁": "eye", "🏭": "factory", "↩": "chevron-left", "✎": "pencil", "👷": "hard-hat", "🧑": "user", "⏳": "clock", "👀": "eye", "⏰": "clock", "🏢": "building", "🔁": "refresh", "⛔": "ban", "📂": "archive", "🖨": "printer", "▶": "chevron-right", "🛒": "cart", "⚡": "zap"};
function emoIc(e) {
  if (!e) return '';
  if (String(e).charAt(0) === '<') return e;
  const k = String(e).replace(/[\uFE0F\u200D]/g, '');
  return EMO_ICON[k] ? '<svg class="ic" aria-hidden="true"><use href="#i-' + EMO_ICON[k] + '"/></svg>' : '';
}
function exKpi(ico, bg, val, label, sub) {
  return `<div class="ex-kpi"><div class="ex-ico" style="background:#E8EFFD">${emoIc(ico)}</div><div><b>${val}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
}
function exBars(rows) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return `<div class="ex-bars">${rows.map((r) => `<div class="ex-bar"><div class="pair"><i title="Missions : ${r.total}" style="height:${(r.total / max) * 100}%;background:#2F6FB5"></i><i title="Terminées : ${r.completed}" style="height:${(r.completed / max) * 100}%;background:#3F8F6B"></i></div><em>${esc(r.label)}</em></div>`).join('')}</div>
    <div class="desc" style="margin-top:6px"><span style="color:#2F6FB5">■</span> Missions &nbsp; <span style="color:#3F8F6B">■</span> Terminées</div>`;
}
function exAlerts(list) {
  const col = { CRITICAL: '#C0504D', WARNING: '#C9A24D', INFO: '#2F6FB5' };
  return list.length ? list.map((a) => `<div class="ex-al"><div class="ex-dot" style="background:${col[a.severity] || col.INFO}"></div><div><b>${esc(a.title)}</b><div style="color:var(--muted)">${esc(a.message)}</div><div style="color:var(--muted);font-size:12px">${drvDt(a.at)}</div></div></div>`).join('') : '<div class="empty" style="padding:10px">Aucune alerte non lue.</div>';
}
async function renderExecutive(mode) {
  execStyle();
  const d = await api('/dashboards/executive' + (state.siteId ? '?siteId=' + state.siteId : ''));
  const u = state.user, f = d.fleet, m = d.missions, pe = d.people, ex = d.expenses, hs = d.hse, st = d.stock;
  const heroTxt = mode === 'dg' ? 'Voici la situation globale de votre entreprise.' : 'Voici l’activité de votre logistique : missions, véhicules et chauffeurs.';
  const hero = `<div class="ex-hero"><div><h2>Bonjour ${esc(u.firstName)} ${esc(u.lastName)}</h2><p>${heroTxt}</p></div><div class="ex-date">Mis à jour : ${drvDt(d.asOf)}<br><button class="btn small" style="margin-top:6px" onclick="renderView(state.view)"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg> Actualiser</button></div></div>`;
  const rate = m.completionRate;
  const ring = (v, col) => `<div class="ex-ring" style="background:conic-gradient(${col} ${(v || 0) * 3.6}deg,#E6ECF2 0)"><div>${v == null ? '—' : v + '%'}</div></div>`;
  const act = (ico, label, view) => `<button onclick="go('${view}')"><span>${emoIc(ico)}</span>${label}</button>`;
  const alertsCard = `<div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-bell"/></svg> Alertes importantes</h3>${exAlerts(d.alerts)}</div>`;
  const moveCard = `<div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-package"/></svg> Mouvements récents <a style="font-size:12px;cursor:pointer;color:var(--navy-soft)" onclick="go('stock')">Voir tout →</a></h3>${st.recent.length ? st.recent.map((r) => `<div class="ex-row"><span>${esc(r.item)}</span><span style="color:${r.type === 'IN' || r.type === 'RETURN' ? '#3F8F6B' : '#C0504D'}">${r.type === 'IN' || r.type === 'RETURN' ? '+' : '−'}${fmt(r.quantity)}</span><span style="color:var(--muted)">${drvDt(r.at)}</span></div>`).join('') : '<div class="empty" style="padding:10px">Aucun mouvement.</div>'}${st.belowMinimum ? `<div class="msg err" style="margin-top:8px">Stock faible : ${st.belowMinimum} article(s) sous le seuil minimum.</div>` : ''}</div>`;
  const chartCard = `<div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-chart"/></svg> Performance des missions (6 mois) <span class="badge ${m.monthTotal >= m.previousMonthTotal ? 'ok' : 'warn'}">${m.monthTotal} ce mois</span></h3>${exBars(m.byMonth)}</div>`;
  let body;
  if (mode === 'dg') {
    // Directeur Général : lecture seule absolue — aucun bouton d'action, aucun formulaire
    const sy = d.synthesis, ev = sy.expensesPreviousMonth ? Math.round((sy.expensesValidated / sy.expensesPreviousMonth - 1) * 100) : null;
    const kpis = `<div class="ex-kpis">
      ${exKpi('🚚', '', f.active, 'Véhicules actifs', `sur ${f.total} · ${f.maintenance} en maintenance`)}
      ${exKpi('▶️', '', m.inProgress, 'Missions en cours', `${m.today} aujourd’hui`)}
      ${exKpi('👥', '', pe.present + ' / ' + pe.drivers, 'Chauffeurs présents', 'aujourd’hui')}
      ${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg>', '', fmt(ex.today), 'Dépenses du jour (GNF)', `Mois : ${fmt(ex.month)}`)}</div>`;
    const safety = `<div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-hard-hat"/></svg> Alertes sécurité</h3>${exAlerts(d.safetyAlerts)}</div>`;
    const budget = `<div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg> Alertes budget</h3>${exAlerts(d.budgetAlerts.map((a) => ({ ...a, at: d.asOf })))}</div>`;
    const synth = `<div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg> Synthèse du mois <span class="badge info">données validées</span></h3>
      <div class="ex-row"><span>Missions terminées</span><b>${sy.missionsCompleted} / ${sy.missionsTotal}</b></div>
      <div class="ex-row"><span>Kilomètres parcourus</span><b>${fmt(sy.km)} km</b></div>
      <div class="ex-row"><span>Dépenses validées</span><b>${fmt(sy.expensesValidated)} GNF</b></div>
      <div class="ex-row"><span>Évolution des dépenses vs mois dernier</span><b>${ev == null ? '—' : (ev > 0 ? '+' : '') + ev + ' %'}</b></div>
      <div class="ex-row"><span>Incidents ouverts</span><b>${sy.incidents}</b></div>
      <div class="ex-row"><span>Conformité HSE</span><b>${sy.compliance == null ? '—' : sy.compliance + ' %'}</b></div></div>`;
    body = hero + kpis + `<div class="ex-grid" id="ex-alertes">${safety}${budget}</div><div class="ex-grid">${synth}${chartCard}</div>`;
  } else {
    const kpis = `<div class="ex-kpis">
      ${exKpi('🚚', '#E8F0F8', f.active, 'Véhicules actifs', `${f.onMission} en mission · ${f.available} disponibles`)}
      ${exKpi('▶️', '#E1F4E8', m.inProgress, 'Missions en cours', `${m.today} aujourd’hui`)}
      ${exKpi('⏳', '#FDF1D6', m.planned, 'Missions en attente', 'planifiées, non démarrées')}
      ${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg>', '#FDE8E4', fmt(ex.today), 'Dépenses du jour (GNF)', `${ex.pendingApproval} frais à valider`)}</div>`;
    const track = `<div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-compass"/></svg> Suivi des missions en cours <a style="font-size:12px;cursor:pointer;color:var(--navy-soft)" onclick="go('driver-board')">Voir tout →</a></h3>${m.running.length ? m.running.map((t) => `<div class="ex-row"><span><b>${esc(t.vehicle)}</b> · ${esc(t.driver)}<br><span style="color:var(--muted)">${esc(t.destination || 'Destination non renseignée')}</span></span><span style="text-align:right"><span class="badge ok">En cours</span><br><span style="color:var(--muted);font-size:12px">départ ${drvDt(t.startTime)}</span></span></div>`).join('') : '<div class="empty" style="padding:10px">Aucune mission en cours.</div>'}</div>`;
    const crew = `<div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-users"/></svg> Chauffeurs & équipe</h3>
      <div class="ex-row"><span>Chauffeurs actifs</span><b>${pe.drivers}</b></div><div class="ex-row"><span>Présents aujourd’hui</span><b>${pe.present}</b></div><div class="ex-row"><span>Absents / non présents</span><b>${pe.absent}</b></div><div class="ex-row"><span>Rapports du personnel reçus</span><b>${pe.staffReportsToday}/${pe.staff}</b></div>
      <div class="ex-row"><span>Véhicules en maintenance</span><b>${f.maintenance}</b></div><div class="ex-row"><span>Véhicules immobilisés</span><b>${f.immobilized}</b></div></div>`;
    const actions = `<div class="ex-card" style="margin-bottom:14px"><h3><svg class="ic" aria-hidden="true"><use href="#i-zap"/></svg> Actions rapides</h3><div class="ex-act">${act('<svg class="ic" aria-hidden="true"><use href="#i-message"/></svg>', 'Enrôler par WhatsApp', 'enrol')}${act('<svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg>', 'Pointage du jour', 'pointage')}${act('<svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg>', 'Fiches de bord', 'driver-sheets')}${act('<svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg>', 'Dépenses', 'driver-expenses')}${act('<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg>', 'Flotte', 'trucks')}${act('<svg class="ic" aria-hidden="true"><use href="#i-fuel"/></svg>', 'Carburant & maintenance', 'fuel')}${act('<svg class="ic" aria-hidden="true"><use href="#i-chart"/></svg>', 'Rapports', 'reports-truck')}</div></div>`;
    const todo = `<div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg> À traiter</h3>
      <div class="ex-row"><span>Dépenses en circuit de validation</span><b>${ex.pendingApproval}</b></div>
      <div class="ex-row"><span>Missions en attente</span><b>${m.planned}</b></div>
      <div class="ex-row"><span>Rapports du personnel non reçus</span><b>${Math.max(0, pe.staff - pe.staffReportsToday)}</b></div>
      <div class="ex-row"><span>Articles sous le seuil de stock</span><b>${st.belowMinimum}</b></div></div>`;
    body = hero + kpis + actions + `<div class="ex-grid">${track}${alertsCard}${crew}</div><div class="ex-grid">${chartCard}${todo}</div>`;
  }
  root().innerHTML = body;
}


/* ---------------- DIRECTION GÉNÉRALE : tableau de bord et menu modernisés (Phase 1) ----------------
   Lecture seule. Données réelles (/dashboards/direction). Les anciens écrans restent accessibles. */
const DG_ROLES = ['SUPER_ADMIN', 'DIRECTEUR_GENERAL'];
const DG_PER = { key: 'month' };
const DG_MENU = [
  { t: 'Tableau de bord', s: 'Vue générale', ic: 'home', sa: { v: 'dashboard', vs: ['dashboard'] }, dg: { v: 'dashboard', vs: ['dashboard'] } },
  { t: 'Flotte automobile', s: 'Camions & Véhicules', ic: 'truck', sa: { v: 'fleet-trucks', vs: ['fleet-trucks', 'fleet-service', 'trucks', 'service-vehicles', 'vehicles'] }, dg: { v: 'fleet-trucks', vs: ['fleet-trucks', 'fleet-service', 'reports-truck', 'reports-service'] } },
  { t: 'Carburant', s: 'Suivi & Statistiques', ic: 'fuel', sa: { v: 'fuel', vs: ['fuel'] } },
  { t: 'Maintenance', s: 'Entretien & Réparations', ic: 'wrench', sa: { v: 'maintenance', vs: ['maintenance'] } },
  { t: 'Dépenses opérationnelles', s: 'Tous les coûts', ic: 'banknote', sa: { v: 'driver-expenses', vs: ['driver-expenses'] }, dg: { v: 'compta', vs: ['compta'] } },
  { t: 'Rapports des départements', s: 'Réception & Validation', ic: 'clipboard', sa: { v: 'reports-truck', vs: ['reports-hse', 'reports-stock', 'reports-drivers', 'reports-dg', 'ops-validation', 'driver-sheets', 'driver-missions'] } },
  { t: 'Personnel', s: 'Gestion des accès', ic: 'users', sa: { v: 'staff-managers', vs: ['staff-managers', 'staff-store', 'staff-mech', 'staff-hse', 'drivers', 'enrol', 'pointage', 'driver-devices', 'driver-board'] } },
  { t: 'Analyses & Statistiques', s: 'Bilans et graphiques', ic: 'chart', sa: { v: 'pilotage', vs: ['pilotage', 'dash-fleet', 'dash-stock', 'dash-logistics', 'dash-hse'] }, dg: { v: 'pilotage', vs: ['pilotage'] } },
  { t: 'Gestion du personnel', s: 'Comptes & accès', ic: 'users', dg: { v: 'personnel', vs: ['personnel'] } },
  { t: 'Alertes & Notifications', s: 'Incidents & rappels', ic: 'bell', badge: true, sa: { act: 'dgAlertsGo()', vs: [] }, dg: { act: 'dgAlertsGo()', vs: [] } },
  { t: 'Journal d’activité', s: 'Historique', ic: 'clock', sa: { act: 'openHistory()', vs: [] } },
];
function dgMenuBuild() {
  const box = document.getElementById('dg-menu'); if (!box) return;
  const role = state.user && state.user.role, on = DG_ROLES.includes(role);
  const first = document.querySelector('#sidebar > .nav-item[data-view="dashboard"]');
  if (first) first.style.display = on ? 'none' : '';
  if (!on) { box.innerHTML = ''; return; }
  const k = role === 'SUPER_ADMIN' ? 'sa' : 'dg';
  box.innerHTML = DG_MENU.filter((m) => m[k]).map((m) => {
    const x = m[k];
    return `<div class="nav-item dg-nav" data-roles="SUPER_ADMIN,DIRECTEUR_GENERAL" data-view="${x.v || ''}" data-views="${x.vs.join(',')}" onclick="dgMenuClose();${x.act || `go('${x.v}')`}"><span class="nav-icon"><svg class="ic" aria-hidden="true"><use href="#i-${m.ic}"/></svg></span><span class="dg-nt"><b>${m.t}</b><small>${m.s}</small></span>${m.badge ? '<i class="dg-nb" id="dg-nb"></i>' : ''}</div>`;
  }).join('');
  // Le Super Admin garde tous ses modules : les anciens groupes sont repliés (un clic les rouvre)
  if (role === 'SUPER_ADMIN' && typeof navFoldSet === 'function') {
    let m = {}; try { m = JSON.parse(localStorage.getItem('syl_folds') || '{}'); } catch (e) {}
    document.querySelectorAll('#sidebar .nav-section-label.fold').forEach((l) => { try { if (!(navFoldKey(l) in m)) navFoldSet(l, true, false); } catch (e) {} });
  }
  dgMenuActive(state.view);
}
function dgMenuActive(view) {
  document.querySelectorAll('#sidebar .dg-nav').forEach((el) => { const vs = (el.dataset.views || '').split(',').filter(Boolean); if (vs.length) el.classList.toggle('active', vs.includes(view)); });
}
{ const _a = applyRoleNav; applyRoleNav = function () { const r = _a.apply(this, arguments); try { dgMenuBuild(); } catch (e) {} return r; }; }
{ const _g2 = go; go = function (v) { const r = _g2.apply(this, arguments); try { dgMenuActive(v); } catch (e) {} return r; }; }
function dgMenuClose() { try { document.getElementById('sidebar').classList.remove('open'); const sc = document.getElementById('side-scrim'); if (sc) sc.classList.remove('on'); } catch (e) {} }
function dgAlertsGo() { dgMenuClose(); alertsCenterOpen(); }

/* ---------- Centre d'alertes : une seule fenêtre, rapide, qui ne bloque jamais le menu ---------- */
const AL = { list: [], filter: 'ALL', q: '', period: 'ALL', from: '', to: '', open: {}, det: {}, gmap: {}, smap: {}, busy: false, err: '' };
const AL_VIEW = { Vehicle: 'fleet-trucks', VehicleDowntime: 'maintenance', Trip: 'driver-missions', TripNotStarted: 'driver-missions', TripDelay: 'driver-missions', NeedRequest: 'needs', PurchaseOrder: 'purchases', FuelTransaction: 'fuel', InventoryCount: 'stock', StockMovement: 'stock', InventoryItem: 'stock', Driver: 'drivers', DriverDailyReport: 'driver-sheets', DriverExpense: 'driver-expenses', DriverDevice: 'driver-devices', Document: 'fleet-trucks', MaintenancePlan: 'maintenance', Maintenance: 'maintenance', HseIncident: 'dash-hse' };
const AL_SEV = { CRITICAL: ['Critique', '#D64545', 0], WARNING: ['À surveiller', '#D08A1E', 1], INFO: ['Information', '#2F6FB5', 2] };
function alAgo(d) { const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000)); if (m < 1) return "à l'instant"; if (m < 60) return 'il y a ' + m + ' min'; const h = Math.round(m / 60); if (h < 24) return 'il y a ' + h + ' h'; const j = Math.round(h / 24); return j === 1 ? 'hier' : 'il y a ' + j + ' j'; }
function alertsCenterClose() { const o = document.getElementById('al-overlay'); if (o) o.remove(); document.removeEventListener('keydown', alEsc); }
function alEsc(e) { if (e.key === 'Escape') alertsCenterClose(); }
function alertsCenterOpen() {
  alertsCenterClose();
  const ov = document.createElement('div'); ov.id = 'al-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,39,71,.55);z-index:1000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:12px;-webkit-overflow-scrolling:touch';
  ov.addEventListener('click', (e) => { if (e.target === ov) alertsCenterClose(); });
  ov.innerHTML = '<div class="panel" style="max-width:760px;width:100%;margin:10px auto"><div id="al-body"><div class="empty">Chargement des alertes…</div></div></div>';
  document.body.appendChild(ov);
  document.addEventListener('keydown', alEsc);
  alertsCenterLoad();
}
async function alertsCenterLoad() {
  if (AL.busy) return; AL.busy = true; AL.err = '';
  try { AL.list = await api('/notifications?all=true&limit=300'); } catch (e) { AL.err = (e && e.message) || 'Connexion impossible'; }
  AL.busy = false; alertsCenterRender();
  if (!AL.err) alSyncBell();
}
// La cloche et le badge du menu ne comptent que les alertes non lues et non traitées
function alSyncBell() { BELL.list = AL.list.filter((n) => !n.isRead && !n.handled); try { bellRender(); } catch (e) {} }
const AL_FOLDERS = [['HSE', 'Sécurité et HSE', '🦺'], ['CHAUFFEURS', 'Chauffeurs et documents administratifs', '🪪'], ['VEHICULES', 'Véhicules et maintenance', '🔧'], ['MISSIONS', 'Missions et déplacements', '🚚'], ['FICHES', 'Fiches journalières', '📋'], ['FINANCES', 'Finances et dépenses', '💰'], ['GENERAL', 'Informations générales', 'ℹ️']];
function alFr(d) { return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function alInPeriod(n) {
  if (AL.period === 'ALL') return true;
  const t = new Date(n.createdAt).getTime(), now = new Date(), sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (AL.period === 'TODAY') return t >= sod;
  if (AL.period === 'WEEK') { const d = (now.getDay() + 6) % 7; return t >= sod - d * 86400000; }
  if (AL.period === 'MONTH') return t >= new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const f = AL.from ? new Date(AL.from + 'T00:00:00').getTime() : -Infinity, u = AL.to ? new Date(AL.to + 'T23:59:59').getTime() : Infinity;
  return t >= f && t <= u;
}
function alMatch(n) {
  const q = (AL.q || '').trim().toLowerCase(); if (!q) return true;
  const hay = [n.title, n.message, n.entity, n.sub, n.folder, alFr(n.createdAt), String(n.createdAt).slice(0, 10)].join(' ').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
function alFilterOk(n) {
  const f = AL.filter;
  if (f === 'HANDLED') return n.handled;
  if (n.handled) return false;
  if (f === 'UNREAD') return !n.isRead;
  if (f === 'CRITICAL' || f === 'WARNING' || f === 'INFO') return n.severity === f;
  return true;
}
// Regroupe les vrais doublons (même événement copié pour plusieurs rôles) ; deux événements distincts ne sont jamais fusionnés.
function alGroups(items) {
  const m = new Map();
  items.forEach((n) => { const k = n.groupKey || n.id; if (!m.has(k)) m.set(k, { key: k, items: [] }); m.get(k).items.push(n); });
  return [...m.values()].map((g) => {
    g.items.sort((a, c) => new Date(c.createdAt) - new Date(a.createdAt));
    const f = g.items[0];
    g.title = f.title; g.message = f.message; g.entity = f.entity; g.folder = f.folder || 'GENERAL'; g.sub = f.sub || 'Autres notifications'; g.createdAt = f.createdAt;
    g.sevRank = Math.min(...g.items.map((n) => (AL_SEV[n.severity] || AL_SEV.INFO)[2]));
    g.severity = ['CRITICAL', 'WARNING', 'INFO'][g.sevRank];
    g.unread = g.items.some((n) => !n.isRead); g.handled = g.items.every((n) => n.handled);
    return g;
  }).sort((a, c) => a.sevRank - c.sevRank || new Date(c.createdAt) - new Date(a.createdAt));
}
function alertsCenterRender() {
  const b = document.getElementById('al-body'); if (!b) return;
  const act = AL.list.filter((n) => !n.handled);
  const head = () => { const gs = alGroups(act), nu = gs.filter((g) => g.unread).length, nc = gs.filter((g) => g.severity === 'CRITICAL').length;
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><h3 style="margin:0"><svg class="ic" aria-hidden="true"><use href="#i-bell"/></svg> Alertes & Notifications</h3><button class="btn" onclick="alertsCenterClose()">Fermer</button></div>`
      + `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><span style="display:inline-block;border-radius:12px;padding:2px 10px;font-size:12px;background:#e8edf5;color:var(--navy)">${gs.length} événement${gs.length > 1 ? 's' : ''}</span><span style="display:inline-block;border-radius:12px;padding:2px 10px;font-size:12px;background:#e8edf5;color:var(--navy);background:#2F6FB5;color:#fff">${nu} non lu${nu > 1 ? 's' : ''}</span><span style="display:inline-block;border-radius:12px;padding:2px 10px;font-size:12px;background:#e8edf5;color:var(--navy);background:#D64545;color:#fff">${nc} critique${nc > 1 ? 's' : ''}</span></div>`; };
  if (AL.err) { b.innerHTML = head() + `<div class="msg err">Impossible de charger les alertes (${esc(AL.err)}). Le service se réveille peut-être : patientez quelques secondes.</div><button class="btn primary" onclick="alertsCenterLoad()">Réessayer</button>`; return; }
  const cnt = (f) => alGroups(AL.list.filter((n) => (f === 'HANDLED' ? n.handled : !n.handled && (f === 'ALL' || (f === 'UNREAD' ? !n.isRead : n.severity === f))))).length;
  const chips = [['ALL', 'Toutes'], ['UNREAD', 'Non lues'], ['CRITICAL', 'Critiques'], ['WARNING', 'À surveiller'], ['INFO', 'Informations'], ['HANDLED', 'Traitées']]
    .map((c) => `<button class="btn small${AL.filter === c[0] ? ' primary' : ''}" onclick="AL.filter='${c[0]}';alertsCenterRender()">${c[1]} (${cnt(c[0])})</button>`).join(' ');
  const per = [['ALL', 'Toutes dates'], ['TODAY', "Aujourd'hui"], ['WEEK', 'Cette semaine'], ['MONTH', 'Ce mois'], ['CUSTOM', 'Période…']].map((p) => `<option value="${p[0]}"${AL.period === p[0] ? ' selected' : ''}>${p[1]}</option>`).join('');
  const tools = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0"><input id="al-q" type="search" placeholder="Chauffeur, plaque, n° de mission, type, date…" value="${esc(AL.q)}" oninput="alSearch(this.value)" style="flex:1 1 220px;min-width:0"><select onchange="AL.period=this.value;alertsCenterRender()">${per}</select></div>`
    + (AL.period === 'CUSTOM' ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><input type="date" value="${esc(AL.from)}" onchange="AL.from=this.value;alertsCenterRender()"><input type="date" value="${esc(AL.to)}" onchange="AL.to=this.value;alertsCenterRender()"></div>` : '');
  const shown = AL.list.filter((n) => alFilterOk(n) && alInPeriod(n) && alMatch(n));
  const groups = alGroups(shown); AL.gmap = {}; AL.smap = {}; let gi = 0, si = 0;
  const gcard = (g) => {
    const id = 'g' + (gi++); AL.gmap[id] = g; const sv = AL_SEV[g.severity] || AL_SEV.INFO, go_ = AL_VIEW[g.entity], n = g.items.length, det = AL.det[g.key];
    const unr = g.items.filter((x) => !x.isRead).length;
    return `<div style="display:flex;gap:10px;padding:10px 0 10px 8px;border-bottom:1px solid var(--line);${g.severity === 'CRITICAL' && !g.handled ? 'border-left:4px solid #D64545;' : ''}${g.unread ? 'background:rgba(47,111,181,.06);' : ''}"><div style="width:10px;height:10px;border-radius:50%;background:${sv[1]};margin-top:5px;flex:none"></div><div style="flex:1;min-width:0">`
      + `<b style="color:var(--navy)">${esc(g.title)}</b>${g.unread ? ' <span style="font-size:11px;background:#2F6FB5;color:#fff;border-radius:8px;padding:0 6px">Non lue</span>' : ''}${g.handled ? ' <span style="font-size:11px;background:#2E8B57;color:#fff;border-radius:8px;padding:0 6px">Traitée</span>' : ''}`
      + `<div style="font-size:13px">${esc(g.message)}</div><div style="font-size:12px;color:var(--muted);margin-top:2px">${sv[0]} · ${alAgo(g.createdAt)}${n > 1 ? ` · 1 événement – ${n} notifications` : ''}</div>`
      + `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${go_ ? `<button class="btn small primary" onclick="alAct('go','${id}')">Voir / traiter →</button>` : ''}`
      + (unr ? `<button class="btn small" onclick="alAct('read','${id}')">Marquer comme lu</button>` : `<button class="btn small" onclick="alAct('unread','${id}')">Marquer comme non lu</button>`)
      + (g.handled ? `<button class="btn small" onclick="alAct('reopen','${id}')">Rouvrir</button>` : `<button class="btn small" onclick="alAct('handle','${id}')">Marquer comme traité</button>`)
      + `<button class="btn small" onclick="alAct('det','${id}')">${det ? 'Masquer' : 'Détails'}</button></div>`
      + (det ? `<div style="font-size:12px;margin-top:6px;padding:6px 8px;background:var(--bg,#f4f6fa);border-radius:6px"><div><b>Source :</b> ${esc(g.entity || '—')} · <b>Dossier :</b> ${esc(g.sub)}</div>${g.items.map((x) => `<div>• ${alFr(x.createdAt)} — ${x.handled ? 'traitée' : x.isRead ? 'lue' : 'non lue'}${x.roleName ? ' · ' + esc(x.roleName) : ''}</div>`).join('')}</div>` : '')
      + `</div></div>`;
  };
  const html = AL_FOLDERS.map(([fk, label, ico]) => {
    const fg = groups.filter((g) => g.folder === fk); if (!fg.length) return '';
    const crit = fg.filter((g) => g.severity === 'CRITICAL' && !g.handled).length, nu = fg.filter((g) => g.unread).length, rank = Math.min(...fg.map((g) => g.sevRank)), col = (['#D64545', '#D08A1E', '#2F6FB5'])[rank];
    const open = AL.open[fk] === undefined ? alDefaultOpen(fg) : AL.open[fk];
    const subs = [...new Set(fg.map((g) => g.sub))];
    const body = open ? subs.map((s) => { const sg = fg.filter((g) => g.sub === s), sid = 's' + (si++); AL.smap[sid] = fk + ':' + s; const so = AL.open[fk + ':' + s] === undefined ? (!!AL.q || AL.filter === 'HANDLED' || sg.some((g) => g.severity === 'CRITICAL' && !g.handled)) : AL.open[fk + ':' + s];
      return `<div style="margin:4px 0 0 8px"><div onclick="alToggle('${sid}')" style="cursor:pointer;display:flex;justify-content:space-between;gap:8px;padding:6px 4px;font-weight:600;color:var(--navy)"><span>${so ? '▾' : '▸'} ${esc(s)}</span><span style="font-weight:400;font-size:12px;color:var(--muted)">${sg.length}${sg.some((g) => g.unread) ? ' · ' + sg.filter((g) => g.unread).length + ' non lue(s)' : ''}</span></div>${so ? sg.map(gcard).join('') : ''}</div>`; }).join('') : '';
    return `<div style="border:1px solid var(--line);border-radius:10px;margin-bottom:8px;overflow:hidden"><div onclick="alToggle('${fk}')" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:10px;background:#f4f6fa"><span style="width:12px;height:12px;border-radius:50%;background:${col};flex:none"></span><b style="flex:1;color:var(--navy)">${open ? '▾' : '▸'} ${ico} ${label}</b><span style="font-size:12px">${fg.length}</span>${nu ? `<span style="font-size:11px;background:#2F6FB5;color:#fff;border-radius:8px;padding:0 6px">${nu} non lu${nu > 1 ? 's' : ''}</span>` : ''}${crit ? `<span style="font-size:11px;background:#D64545;color:#fff;border-radius:8px;padding:0 6px">${crit} critique${crit > 1 ? 's' : ''}</span>` : ''}</div><div style="padding:0 8px 6px">${body}</div></div>`;
  }).join('');
  const hasUnread = shown.some((n) => !n.isRead);
  b.innerHTML = head() + `<div style="display:flex;gap:6px;flex-wrap:wrap">${chips}</div>` + tools
    + (hasUnread ? '<div style="text-align:right;margin-bottom:6px"><button class="btn small" onclick="alertsReadAll()">Tout marquer comme lu</button></div>' : '')
    + (html || '<div class="empty" style="padding:24px 0">Aucune alerte dans cette sélection. Tout est sous contrôle.</div>')
    + '<div style="font-size:11px;color:var(--muted);margin-top:8px">« Lu » n\'est pas « traité » : une alerte critique reste visible tant qu\'elle n\'est pas traitée. Rien n\'est supprimé.</div>';
  if (AL.q && AL.refocus) { const i = document.getElementById('al-q'); if (i) { i.focus(); const l = i.value.length; try { i.setSelectionRange(l, l); } catch (e) {} } AL.refocus = false; }
}
// Tous les dossiers sont fermés, sauf ceux qui contiennent un critique non traité, une recherche ou l'historique des traitées
function alDefaultOpen(fg) { return !!AL.q || AL.filter === 'HANDLED' || fg.some((g) => g.severity === 'CRITICAL' && !g.handled); }
function alSearch(v) { AL.q = v; AL.refocus = true; clearTimeout(AL.tm); AL.tm = setTimeout(alertsCenterRender, 250); }
function alToggle(id) {
  const k = AL.smap[id] || id; const isSub = k.indexOf(':') > 0;
  const cur = AL.open[k];
  if (isSub) { const [fk2, sb] = [k.split(':')[0], k.slice(k.indexOf(':') + 1)]; const sg = alGroups(AL.list.filter((n) => alFilterOk(n) && alInPeriod(n) && alMatch(n))).filter((x) => x.folder === fk2 && x.sub === sb); const def = !!AL.q || AL.filter === 'HANDLED' || sg.some((x) => x.severity === 'CRITICAL' && !x.handled); AL.open[k] = !(cur === undefined ? def : cur); } else if (cur === undefined) { AL.open[k] = !alDefaultOpen(alGroups(AL.list.filter((n) => alFilterOk(n) && alInPeriod(n) && alMatch(n))).filter((x) => x.folder === k)); } else AL.open[k] = !cur;
  alertsCenterRender();
}
async function alApply(ids, fn, url) {
  const set = new Set(ids); AL.list.forEach((n) => { if (set.has(n.id)) fn(n); }); alertsCenterRender(); alSyncBell();
  const res = await Promise.all(ids.map((id) => api('/notifications/' + id + url, { method: 'PATCH' }).then(() => true).catch(() => false)));
  if (res.some((r) => !r)) alertsCenterLoad();
  try { bellTick(); } catch (e) {}
}
function alAct(a, gid) {
  const g = AL.gmap[gid]; if (!g) return; const ids = g.items.map((n) => n.id);
  if (a === 'go') { const v = AL_VIEW[g.entity]; if (g.unread) alApply(ids, (n) => { n.isRead = true; if (n.status === 'NEW') n.status = 'SEEN'; }, '/read'); alertsOpenView(v); return; }
  if (a === 'det') { AL.det[g.key] = !AL.det[g.key]; alertsCenterRender(); return; }
  if (a === 'read') return alApply(ids, (n) => { n.isRead = true; if (n.status === 'NEW') n.status = 'SEEN'; }, '/read');
  if (a === 'unread') return alApply(ids, (n) => { n.isRead = false; if (n.status === 'SEEN') n.status = 'NEW'; }, '/unread');
  if (a === 'handle') return alApply(ids, (n) => { n.isRead = true; n.status = 'HANDLED'; n.handled = true; }, '/handle');
  if (a === 'reopen') return alApply(ids, (n) => { n.status = 'SEEN'; n.handled = false; }, '/handle?undo=true');
}
function alertsOpenView(v) { alertsCenterClose(); try { go(v); } catch (e) {} }
async function alertsRead(id) { return alApply([id], (n) => { n.isRead = true; if (n.status === 'NEW') n.status = 'SEEN'; }, '/read'); }
// Tout marquer comme lu : s'applique à la sélection affichée ; ne traite pas et ne masque pas les alertes critiques
async function alertsReadAll() {
  const ids = AL.list.filter((n) => !n.isRead && alFilterOk(n) && alInPeriod(n) && alMatch(n)).map((n) => n.id);
  if (ids.length) await alApply(ids, (n) => { n.isRead = true; if (n.status === 'NEW') n.status = 'SEEN'; }, '/read');
}
// Le badge du menu suit la cloche en continu (plus seulement à l'ouverture du tableau de bord)
{ const _br = bellRender; bellRender = function () { const r = _br.apply(this, arguments); try { const nb = document.getElementById('dg-nb'), n = BELL.list.length; if (nb) { nb.textContent = n > 99 ? '99+' : n; nb.style.display = n ? 'inline-block' : 'none'; } } catch (e) {} return r; }; }
// Menu mobile : un appui sur n'importe quel élément le referme ; un appui à côté aussi ; touche Échap
document.addEventListener('click', (e) => {
  const sb = document.getElementById('sidebar'); if (!sb || !sb.classList.contains('open')) return;
  if (e.target.closest && e.target.closest('#sidebar .nav-item:not(.fold)') ) { setTimeout(dgMenuClose, 0); return; }
  if (!sb.contains(e.target) && !(e.target.closest && e.target.closest('.menu-toggle'))) dgMenuClose();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dgMenuClose(); });

function dgStyle() {
  if (document.getElementById('dg-style')) return;
  const st = document.createElement('style'); st.id = 'dg-style';
  st.textContent = `
  .dg-nav{align-items:center;padding:9px 16px 9px 17px}.dg-nt{display:block;line-height:1.2;min-width:0}.dg-nt b{display:block;font-size:13.5px;font-weight:600}.dg-nt small{display:block;font-size:11px;opacity:.72;font-weight:400;margin-top:1px}
  .dg-nav.active .dg-nt small{opacity:.85}.dg-nb{margin-left:auto;background:#D64545;color:#fff;font-style:normal;font-size:11px;font-weight:700;border-radius:10px;min-width:20px;height:20px;line-height:20px;text-align:center;padding:0 6px;display:none}
  body.side-min .dg-nt,body.side-min .dg-nb{display:none}
  .dg-hero{position:relative;overflow:hidden;border-radius:12px;background:linear-gradient(100deg,#0F2747 0%,#1F3A5F 55%,#27528A 100%);color:#fff;padding:22px 26px;margin-bottom:14px;min-height:150px;display:flex;align-items:center;box-shadow:0 6px 18px rgba(15,39,71,.18)}
  .dg-hero:before{content:"";position:absolute;left:0;top:18px;bottom:18px;width:4px;background:var(--gold,#C9A24D);border-radius:0 3px 3px 0}
  .dg-hero-img{position:absolute;right:0;top:0;bottom:0;width:52%;background:url(dg-camion.jpg) center 50%/cover no-repeat;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 55%);mask-image:linear-gradient(90deg,transparent 0,#000 55%)}
  .dg-hero-txt{position:relative;z-index:1;max-width:60%}.dg-hero h2{margin:0 0 4px;font-size:28px;letter-spacing:.2px}.dg-hero .sub{font-size:16px;opacity:.95}.dg-hero .slogan{margin-top:10px;font-size:14px;font-style:italic;opacity:.85}
  .dg-hero .upd{position:absolute;z-index:2;left:26px;bottom:8px;font-size:11px;opacity:.7}
  .dg-bar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}.dg-chips{display:flex;gap:6px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:4px}
  .dg-chips button{border:0;background:transparent;color:var(--navy);font-size:13px;font-weight:600;padding:7px 14px;border-radius:7px;cursor:pointer}.dg-chips button.on{background:var(--navy);color:#fff}
  .dg-range{font-size:12px;color:var(--muted)}
  .dg-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:14px}
  .dg-kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:8px}
  .dg-kpi .top{display:flex;gap:12px;align-items:center}.dg-ico{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;flex:none}.dg-ico .ic{width:22px;height:22px}
  .dg-kpi .lb{font-size:13px;color:#4A5A70;line-height:1.2}.dg-kpi .vl{font-size:28px;font-weight:700;color:var(--navy);line-height:1.1}.dg-kpi .vl small{font-size:12px;font-weight:600;margin-left:6px}
  .dg-prog{height:5px;background:#E6ECF4;border-radius:3px;overflow:hidden}.dg-prog i{display:block;height:100%;border-radius:3px}.dg-kpi .ft{font-size:12px;color:var(--muted);display:flex;justify-content:space-between}
  .dg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}.dg-card{background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;min-width:0}
  .dg-card>h3{margin:0;padding:11px 14px;background:var(--navy);color:#fff;font-size:14px;display:flex;justify-content:space-between;align-items:center;gap:8px}.dg-card>h3 .ic{width:18px;height:18px}.dg-card>h3 span{font-size:12px;font-weight:500;opacity:.85}.dg-card>h3 a{color:#fff;font-size:12px;cursor:pointer;text-decoration:none;opacity:.9}
  .dg-body{padding:14px}.dg-big{font-size:26px;font-weight:700;color:var(--navy);line-height:1.1}.dg-var{display:inline-block;font-size:12px;font-weight:700;border-radius:12px;padding:2px 9px;margin-left:8px;vertical-align:middle}
  .dg-var.up{background:#E3F4EA;color:#1E7A46}.dg-var.dn{background:#FDE9E7;color:#B33A32}.dg-var.nu{background:#EEF2F7;color:#4A5A70}
  .dg-two{display:flex;gap:18px;margin-bottom:8px}.dg-two div{min-width:0}.dg-two b{font-size:24px;color:var(--navy);display:block;line-height:1.1}.dg-two span{font-size:12px;color:var(--muted)}
  .dg-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#4A5A70;margin-top:4px}.dg-leg i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}
  .dg-donut{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.dg-donut svg{width:140px;height:140px;flex:none}.dg-dl{flex:1;min-width:140px}.dg-dl div{display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:5px 0;border-bottom:1px solid var(--line)}.dg-dl div:last-child{border:0}.dg-dl i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px}
  .dg-chart svg{width:100%;height:auto;display:block}.dg-al{display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px}.dg-al:last-child{border:0}.dg-al b{display:block;color:var(--navy)}.dg-al span{color:var(--muted);font-size:12px}.dg-dot{width:10px;height:10px;border-radius:50%;margin-top:4px;flex:none}
  .dg-rep{display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px}.dg-rep:last-child{border:0}.dg-rep .tx{flex:1;min-width:0}.dg-rep b{display:block;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dg-rep span.s{font-size:12px;color:var(--muted)}
  .dg-st{font-size:11px;font-weight:700;border-radius:10px;padding:3px 10px;flex:none}.dg-st.NEW{background:#E4EEFB;color:#1F5FA8}.dg-st.READ{background:#E9EDF3;color:#4A5A70}.dg-st.VALIDATED{background:#E3F4EA;color:#1E7A46}.dg-st.REJECTED{background:#FDE9E7;color:#B33A32}
  .dg-empty{color:var(--muted);font-size:13px;padding:14px 0;text-align:center}.dg-more{display:block;margin-top:8px;font-size:13px;font-weight:600;color:var(--navy-soft,#2F6FB5);cursor:pointer;text-align:right}
  @media(max-width:1180px){.dg-kpis{grid-template-columns:repeat(3,1fr)}.dg-grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:760px){.dg-hero{padding:16px 16px 26px;min-height:120px}.dg-hero h2{font-size:22px}.dg-hero .sub{font-size:14px}.dg-hero-txt{max-width:100%}.dg-hero-img{width:100%;opacity:.28;-webkit-mask-image:none;mask-image:none}.dg-hero .upd{left:16px}
    .dg-kpis{grid-template-columns:repeat(2,1fr);gap:10px}.dg-kpi{padding:12px}.dg-kpi .vl{font-size:24px}.dg-grid{grid-template-columns:1fr}.dg-chips{width:100%}.dg-chips button{flex:1;padding:8px 4px}}`;
  document.head.appendChild(st);
}
const dgM = (n) => { n = Math.round(Number(n) || 0); const a = Math.abs(n); const f = (x, d) => x.toFixed(d).replace('.', ',').replace(/,0+$/, ''); return a >= 1e9 ? f(n / 1e9, 2) + ' Md' : a >= 1e6 ? f(n / 1e6, a >= 1e7 ? 1 : 2) + ' M' : a >= 1e4 ? f(n / 1e3, 0) + ' k' : fmt(n); };
const dgVar = (v) => v == null ? '' : `<span class="dg-var ${v > 0 ? 'up' : v < 0 ? 'dn' : 'nu'}">${v > 0 ? '↑ +' : v < 0 ? '↓ ' : ''}${String(v).replace('.', ',')} %</span>`;
// Pour les dépenses, une hausse est défavorable : on inverse la couleur
const dgVarCost = (v) => v == null ? '' : `<span class="dg-var ${v > 0 ? 'dn' : v < 0 ? 'up' : 'nu'}">${v > 0 ? '↑ +' : v < 0 ? '↓ ' : ''}${String(v).replace('.', ',')} %</span>`;
const DG_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function dgLbl(k, g) {
  if (g === 'hour') return k.slice(11, 13) + 'h';
  if (g === 'day' || g === 'week') return k.slice(8, 10) + '/' + k.slice(5, 7);
  if (g === 'month') return DG_MONTHS[Number(k.slice(5, 7)) - 1];
  return k.slice(0, 4);
}
function dgPick(n, max) { const step = Math.max(1, Math.ceil(n / max)); return (i) => i % step === 0; }
function dgLine(keys, g, series) {
  const W = 360, H = 190, L = 34, R = 10, T = 10, B = 24, n = keys.length;
  const max = Math.max(1, ...series.flatMap((s) => s.v)), top = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / p * 2) / 2 * p || 1; })();
  const x = (i) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1)), y = (v) => T + (H - T - B) * (1 - v / top);
  let o = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution">`;
  for (let i = 0; i <= 4; i++) { const v = (top * i) / 4, yy = y(v); o += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#E6ECF4"/><text x="${L - 5}" y="${yy + 3}" font-size="9" fill="#6B7A90" text-anchor="end">${dgM(v)}</text>`; }
  const pick = dgPick(n, 7); keys.forEach((k, i) => { if (pick(i)) o += `<text x="${x(i)}" y="${H - 7}" font-size="9" fill="#6B7A90" text-anchor="middle">${dgLbl(k, g)}</text>`; });
  series.forEach((s) => {
    const pts = s.v.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    o += `<polyline points="${pts}" fill="none" stroke="${s.c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (n <= 14) s.v.forEach((v, i) => { o += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="${s.c}"><title>${s.n} : ${fmt(v)}</title></circle>`; });
  });
  return o + '</svg>';
}
function dgBars(keys, g, vals, col) {
  const W = 300, H = 150, L = 6, R = 6, T = 18, B = 22, n = keys.length, max = Math.max(1, ...vals), bw = Math.min(34, ((W - L - R) / n) * 0.62), showV = n <= 8, pick = dgPick(n, 8);
  let o = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution"><line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#D5DDE8"/>`;
  vals.forEach((v, i) => {
    const cx = L + ((i + 0.5) * (W - L - R)) / n, h = Math.max(v ? 2 : 0, ((H - T - B) * v) / max);
    o += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${col}"><title>${dgLbl(keys[i], g)} : ${fmt(v)}</title></rect>`;
    if (showV && v) o += `<text x="${cx.toFixed(1)}" y="${(H - B - h - 4).toFixed(1)}" font-size="9.5" fill="#1F3A5F" text-anchor="middle" font-weight="600">${dgM(v)}</text>`;
    if (pick(i)) o += `<text x="${cx.toFixed(1)}" y="${H - 7}" font-size="9.5" fill="#6B7A90" text-anchor="middle">${dgLbl(keys[i], g)}</text>`;
  });
  return o + '</svg>';
}
function dgDonut(parts, total) {
  const R = 52, C = 2 * Math.PI * R; let off = 0, o = `<svg viewBox="0 0 140 140" role="img" aria-label="Répartition des dépenses"><circle cx="70" cy="70" r="${R}" fill="none" stroke="#E6ECF4" stroke-width="22"/>`;
  parts.forEach((p) => { if (!p.v || !total) return; const len = (p.v / total) * C; o += `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${p.c}" stroke-width="22" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 70 70)"><title>${p.n} : ${fmt(p.v)} GNF</title></circle>`; off += len; });
  return o + `<text x="70" y="68" text-anchor="middle" font-size="17" font-weight="700" fill="#1F3A5F">${dgM(total)}</text><text x="70" y="84" text-anchor="middle" font-size="10" fill="#6B7A90">GNF</text></svg>`;
}
function dgSetPeriod(k) { DG_PER.key = k; renderDirection(); }
const DG_ST = { NEW: 'Nouveau', READ: 'Lu', VALIDATED: 'Validé', REJECTED: 'Rejeté' };
const DG_PER_LBL = { day: "Aujourd'hui", week: 'Cette semaine', month: 'Ce mois', year: 'Cette année' };
async function renderDirection() {
  dgStyle();
  const k = DG_PER.key;
  const d = await api('/dashboards/direction?period=' + k + (state.siteId ? '&siteId=' + encodeURIComponent(state.siteId) : ''));
  if (state.view !== 'dashboard') return;
  const g = d.period.granularity, keys = d.missions.series.map((x) => x.key), f = d.fleet, ex = d.expenses, u = state.user;
  const sa = u.role === 'SUPER_ADMIN', pl = DG_PER_LBL[k] || '';
  const range = new Date(d.period.from).toLocaleDateString('fr-FR') + (k === 'day' ? '' : ' – ' + new Date(d.period.to).toLocaleDateString('fr-FR'));
  const kpi = (col, ic, label, val, extra, pct, foot) => `<div class="dg-kpi"><div class="top"><div class="dg-ico" style="background:${col}"><svg class="ic" aria-hidden="true"><use href="#i-${ic}"/></svg></div><div><div class="lb">${label}</div><div class="vl">${val}${extra || ''}</div></div></div>${pct == null ? '' : `<div class="dg-prog"><i style="width:${Math.min(100, pct)}%;background:${col}"></i></div>`}${foot ? `<div class="ft">${foot}</div>` : ''}</div>`;
  const kpis = `<div class="dg-kpis">
    ${kpi('#2F6FB5', 'truck', 'Total camions', fmt(f.trucks.total), '', f.trucks.total ? (f.trucks.onMission / f.trucks.total) * 100 : null, `<span>${f.trucks.onMission} en mission</span>`)}
    ${kpi('#1F8A8A', 'car', 'Véhicules de service', fmt(f.serviceVehicles.total), '', f.serviceVehicles.total ? (f.serviceVehicles.onMission / f.serviceVehicles.total) * 100 : null, `<span>${f.serviceVehicles.onMission} en mission</span>`)}
    ${kpi('#2E8B57', 'check-circle', 'Véhicules disponibles', fmt(f.available), f.availabilityPct == null ? '' : `<small style="color:#1E7A46">${f.availabilityPct} %</small>`, f.availabilityPct, `<span>sur ${fmt(f.total)} véhicules</span>`)}
    ${kpi('#D08A1E', 'wrench', 'En maintenance', fmt(f.maintenance), f.maintenancePct == null ? '' : `<small style="color:#A86A0C">${f.maintenancePct} %</small>`, f.maintenancePct, `<span>${f.trucks.immobilized + f.serviceVehicles.immobilized} immobilisé(s)</span>`)}
    ${kpi('#5B5FC7', 'users', 'Personnel actif', fmt(d.people.activeAccounts), '', null, `<span>dont ${fmt(d.people.drivers)} chauffeur(s)</span>`)}</div>`;
  const noData = '<div class="dg-empty">Aucune donnée sur la période.</div>';
  const m = d.missions, hasM = m.total > 0;
  const cMiss = `<div class="dg-card"><h3><span style="display:flex;gap:8px;align-items:center;font-size:14px;opacity:1;font-weight:600"><svg class="ic" aria-hidden="true"><use href="#i-target"/></svg> Missions</span><span>${pl}</span></h3><div class="dg-body">
    <div class="dg-two"><div><b>${fmt(m.inProgress)}</b><span>Missions en cours</span></div><div><b>${fmt(m.completed)}</b><span>Missions terminées</span>${dgVar(m.variation)}</div></div>
    ${hasM ? `<div class="dg-chart">${dgLine(keys, g, [{ n: 'Missions', c: '#2F6FB5', v: m.series.map((x) => x.total) }, { n: 'Terminées', c: '#2E8B57', v: m.series.map((x) => x.completed) }])}</div><div class="dg-leg"><span><i style="background:#2F6FB5"></i>Missions</span><span><i style="background:#2E8B57"></i>Terminées</span></div>` : noData}</div></div>`;
  const parts = [{ n: 'Carburant', c: '#2F6FB5', v: ex.fuel }, { n: 'Maintenance', c: '#D08A1E', v: ex.maintenance }, { n: 'Autres dépenses', c: '#2E8B57', v: ex.other }];
  const pc = (v) => (ex.total ? String(Math.round((v / ex.total) * 1000) / 10).replace('.', ',') + ' %' : '—');
  const cExp = `<div class="dg-card"><h3><span style="display:flex;gap:8px;align-items:center;font-size:14px;opacity:1;font-weight:600"><svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg> Dépenses globales</span><span>${pl}</span></h3><div class="dg-body">
    <div class="dg-big">${fmt(ex.total)} GNF${dgVarCost(ex.variation)}</div>
    ${ex.total ? `<div class="dg-donut" style="margin-top:10px">${dgDonut(parts, ex.total)}<div class="dg-dl">${parts.map((p) => `<div><span><i style="background:${p.c}"></i>${p.n}</span><b>${pc(p.v)}</b></div>`).join('')}</div></div>` : noData}</div></div>`;
  const sev = { CRITICAL: '#D64545', WARNING: '#D08A1E', INFO: '#2F6FB5' };
  const al = d.alerts;
  const cAl = `<div class="dg-card" id="dg-alertes"><h3><span style="display:flex;gap:8px;align-items:center;font-size:14px;opacity:1;font-weight:600"><svg class="ic" aria-hidden="true"><use href="#i-bell"/></svg> Alertes importantes</span>${al.unread ? `<span style="background:#D64545;border-radius:10px;padding:1px 9px;font-weight:700;opacity:1">${al.unread}</span>` : ''}</h3><div class="dg-body">
    ${al.items.length ? al.items.map((a) => `<div class="dg-al"><div class="dg-dot" style="background:${sev[a.severity] || sev.INFO}"></div><div><b>${esc(a.title)}</b><span>${esc(a.message)}</span></div></div>`).join('') : '<div class="dg-empty">Aucune alerte non lue. Tout est sous contrôle.</div>'}
    <a class="dg-more" onclick="alertsCenterOpen()">Voir toutes les alertes →</a></div></div>`;
  const fu = d.fuel, mt = d.maintenance;
  const cFuel = `<div class="dg-card"><h3><span style="display:flex;gap:8px;align-items:center;font-size:14px;opacity:1;font-weight:600"><svg class="ic" aria-hidden="true"><use href="#i-fuel"/></svg> Consommation de carburant</span><span>${pl}</span></h3><div class="dg-body">
    <div class="dg-big">${fmt(fu.liters)} L${dgVarCost(fu.variation)}</div><div class="dg-range">${fmt(fu.cost)} GNF · camions ${fmt(fu.litersTrucks)} L · véhicules de service ${fmt(fu.litersService)} L</div>
    ${fu.liters ? `<div class="dg-chart" style="margin-top:8px">${dgBars(keys, g, fu.series.map((x) => x.value), '#4F8FD6')}</div>` : noData}</div></div>`;
  const cMaint = `<div class="dg-card"><h3><span style="display:flex;gap:8px;align-items:center;font-size:14px;opacity:1;font-weight:600"><svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg> Maintenance</span><span>${pl}</span></h3><div class="dg-body">
    <div class="dg-big">${fmt(mt.cost)} GNF${dgVarCost(mt.variation)}</div><div class="dg-range">${fmt(mt.interventions)} intervention(s) sur la période</div>
    ${mt.cost ? `<div class="dg-chart" style="margin-top:8px">${dgBars(keys, g, mt.series.map((x) => x.value), '#3FA06B')}</div>` : noData}</div></div>`;
  const rp = d.reports;
  const cRep = `<div class="dg-card"><h3><span style="display:flex;gap:8px;align-items:center;font-size:14px;opacity:1;font-weight:600"><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Rapports récents</span>${sa ? '<a onclick="go(\'ops-validation\')">Voir tout →</a>' : ''}</h3><div class="dg-body">
    ${rp.recent.length ? rp.recent.map((r) => `<div class="dg-rep"><div class="tx"><b>Rapport — ${esc(roleLabel(r.role))}</b><span class="s">Par ${esc(r.author)} · ${esc(String(r.date).split('-').reverse().join('/'))}</span></div><span class="dg-st ${r.status}">${DG_ST[r.status] || r.status}</span></div>`).join('') : '<div class="dg-empty">Aucun rapport reçu pour le moment.</div>'}
    ${rp.newInPeriod ? `<div class="dg-range" style="margin-top:6px">${rp.newInPeriod} rapport(s) non traité(s) sur la période</div>` : ''}</div></div>`;
  const chips = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']].map(([v, l]) => `<button class="${k === v ? 'on' : ''}" onclick="dgSetPeriod('${v}')">${l}</button>`).join('');
  root().innerHTML = `<div class="dg-hero"><div class="dg-hero-img"></div><div class="dg-hero-txt"><h2>Direction Générale</h2><div class="sub">Centre de pilotage de votre entreprise</div><div class="slogan">« Performances, sécurité et efficacité »</div></div><div class="upd">Mis à jour : ${drvDt(d.asOf)}</div></div>
    <div class="dg-bar"><div class="dg-chips">${chips}</div><div class="dg-range">${range}</div></div>
    ${kpis}<div class="dg-grid">${cMiss}${cExp}${cAl}</div><div class="dg-grid">${cFuel}${cMaint}${cRep}</div>`;
  const nb = document.getElementById('dg-nb'); if (nb) { nb.textContent = al.unread > 99 ? '99+' : al.unread; nb.style.display = al.unread ? 'inline-block' : 'none'; }
}
// Données fictives du mode démonstration (aucune donnée réelle)
function demoDirection(path) {
  const k = (/period=(\w+)/.exec(path) || [])[1] || 'month', now = new Date(), pad = (x) => String(x).padStart(2, '0');
  const g = { day: 'hour', week: 'day', month: 'day', year: 'month' }[k], n = { day: 12, week: 7, month: 30, year: 12 }[k];
  const keys = Array.from({ length: n }, (_, i) => { const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); if (g === 'hour') return t.toISOString().slice(0, 10) + 'T' + pad(7 + i) + ':00'; if (g === 'day') { t.setUTCDate(t.getUTCDate() - (n - 1 - i)); return t.toISOString().slice(0, 10); } return now.getUTCFullYear() + '-' + pad(i + 1); });
  const wave = (b, a) => keys.map((_, i) => Math.round(b + a * Math.sin(i / 2.2) + (i % 3) * a * 0.15));
  const tot = wave(14, 6), done = tot.map((v, i) => Math.max(0, v - 2 - (i % 2)));
  const fl = wave(1900, 600), ml = wave(900000, 350000), mc = wave(2400000, 800000);
  const sum = (a) => a.reduce((x, y) => x + y, 0), fuelCost = sum(fl) * 12500, maintCost = sum(ml), other = Math.round(sum(mc) / 2);
  const h = (x) => new Date(Date.now() - x * 3600e3).toISOString();
  return {
    asOf: now.toISOString(), period: { key: k, from: keys[0].slice(0, 10) + 'T00:00:00.000Z', to: now.toISOString(), granularity: g },
    fleet: { trucks: { total: 50, available: 36, onMission: 12, maintenance: 8, immobilized: 1, outOfService: 0 }, serviceVehicles: { total: 12, available: 9, onMission: 2, maintenance: 1, immobilized: 0, outOfService: 0 }, total: 62, available: 45, maintenance: 9, availabilityPct: 73, maintenancePct: 15 },
    people: { activeAccounts: 85, drivers: 38 },
    missions: { completed: sum(done), inProgress: 12, total: sum(tot), previousCompleted: Math.round(sum(done) * 0.92), variation: 8.7, series: keys.map((key, i) => ({ key, total: tot[i], completed: done[i] })) },
    expenses: { total: fuelCost + maintCost + other, previousTotal: 0, variation: 8, fuel: fuelCost, maintenance: maintCost, other, otherByCategory: [] },
    fuel: { liters: sum(fl), litersTrucks: Math.round(sum(fl) * 0.86), litersService: Math.round(sum(fl) * 0.14), cost: fuelCost, previousCost: 0, variation: 6, series: keys.map((key, i) => ({ key, value: fl[i] })) },
    maintenance: { cost: maintCost, interventions: 14, previousCost: 0, variation: 12, series: keys.map((key, i) => ({ key, value: ml[i] })) },
    reports: { newInPeriod: 2, recent: [{ id: '1', role: 'GESTIONNAIRE_HSE', author: 'Agent fictif A', date: now.toISOString().slice(0, 10), status: 'READ' }, { id: '2', role: 'MAGASINIER', author: 'Agent fictif B', date: now.toISOString().slice(0, 10), status: 'NEW' }, { id: '3', role: 'MECANICIEN', author: 'Agent fictif C', date: now.toISOString().slice(0, 10), status: 'VALIDATED' }, { id: '4', role: 'POINTEUR', author: 'Agent fictif D', date: now.toISOString().slice(0, 10), status: 'READ' }] },
    alerts: { unread: 3, items: [{ id: 'a', severity: 'WARNING', title: 'Maintenance à prévoir', message: 'Camion DEMO-003 : prochaine révision dans 500 km', at: h(2) }, { id: 'b', severity: 'WARNING', title: 'Niveau carburant bas', message: 'Véhicule de service DEMO-01 : 12 %', at: h(5) }, { id: 'c', severity: 'INFO', title: 'Rapport en attente', message: 'Rapport maintenance DEMO-002', at: h(26) }] },
    today: now.toISOString().slice(0, 10),
  };
}

/* ---------------- FLOTTE AUTOMOBILE (Phase 2) : espaces Camions et Véhicules de service, dossier véhicule ----------------
   Lecture seule. L'ajout / la modification restent dans le module d'origine (écrans « trucks » et « service-vehicles »). */
const FL_EDIT_ROLES = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE'];
const FL_ST = { AVAILABLE: 'Disponible', ON_MISSION: 'En mission', MAINTENANCE: 'En maintenance', IMMOBILIZED: 'Immobilisé', OUT_OF_SERVICE: 'Hors service' };
const FL_DT = { PANNE: 'Panne', ACCIDENT: 'Accident', ENTRETIEN: 'Entretien', ADMINISTRATIF: 'Administratif', AUTRE: 'Autre' };
const FL_TS = { PLANNED: 'Planifiée', IN_PROGRESS: 'En cours', COMPLETED: 'Terminée', CANCELLED: 'Annulée' };
const FL_SEV = { LOW: 'Faible', MEDIUM: 'Moyen', HIGH: 'Élevé', CRITICAL: 'Critique' };
const FL_HT = { ACCIDENT: 'Accident', NEAR_MISS: 'Presque-accident', DAMAGE: 'Dégât', ENVIRONMENT: 'Environnement', FIRE: 'Incendie', OTHER: 'Autre' };
const flD = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
function flStyle() {
  if (document.getElementById('fl-style')) return;
  const st = document.createElement('style'); st.id = 'fl-style';
  st.textContent = `
  .fl-tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.fl-tabs .tab{border:1px solid var(--line);background:#fff;color:var(--navy);font-weight:600;font-size:14px;padding:9px 16px;border-radius:10px;cursor:pointer}
  .fl-tabs .tab.on{background:var(--navy);color:#fff;border-color:var(--navy)}.fl-tabs .sp{flex:1}
  .fl-filters{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 12px}.fl-filters input,.fl-filters select{max-width:300px;margin:0}
  .fl-watch{background:#FFF8E6;border:1px solid #F0DDA8;border-radius:12px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#7A5A00}.fl-watch b{color:#5E4400}.fl-watch div{padding:2px 0}
  .fl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px}
  .fl-card{background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:14px;cursor:pointer;display:flex;flex-direction:column;gap:8px;border-left:4px solid #9AA9BD}
  .fl-card:hover{box-shadow:0 6px 18px rgba(15,39,71,.14)}.fl-card.AVAILABLE{border-left-color:#2E8B57}.fl-card.ON_MISSION{border-left-color:#2F6FB5}.fl-card.MAINTENANCE{border-left-color:#D08A1E}.fl-card.IMMOBILIZED,.fl-card.OUT_OF_SERVICE{border-left-color:#D64545}
  .fl-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.fl-top b{font-size:17px;color:var(--navy)}.fl-top small{display:block;color:var(--muted);font-size:12px}
  .fl-row{display:flex;justify-content:space-between;gap:10px;font-size:13px;border-top:1px solid #EEF2F7;padding-top:6px}.fl-row span{color:var(--muted)}.fl-row b{color:#1F2D44;text-align:right;font-weight:600}
  .fl-alert{background:#FDECEA;color:#9B2C25;border-radius:8px;padding:6px 10px;font-size:12px}
  .fl-ov{position:fixed;inset:0;background:rgba(10,20,40,.55);z-index:1000;overflow:auto;padding:16px}.fl-dos{max-width:980px;margin:16px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)}
  .fl-dh{background:linear-gradient(100deg,#0F2747,#1F3A5F);color:#fff;padding:16px 20px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.fl-dh h3{margin:0;font-size:20px}.fl-dh small{opacity:.85}
  .fl-dh button{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:8px;padding:7px 14px;cursor:pointer;font-weight:600}
  .fl-db{padding:16px 20px}.fl-id{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 18px;margin-bottom:14px}.fl-id div{font-size:13px}.fl-id span{display:block;color:var(--muted);font-size:11.5px;text-transform:uppercase;letter-spacing:.3px}.fl-id b{color:var(--navy)}
  .fl-tot{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px}.fl-tot div{background:#F4F7FB;border-radius:10px;padding:10px 12px}.fl-tot b{display:block;font-size:18px;color:var(--navy)}.fl-tot span{font-size:12px;color:var(--muted)}
  .fl-sub{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.fl-sub button{border:1px solid var(--line);background:#fff;color:var(--navy);font-weight:600;font-size:13px;padding:7px 13px;border-radius:8px;cursor:pointer}.fl-sub button.on{background:var(--navy);color:#fff;border-color:var(--navy)}
  .fl-tb{overflow:auto}.fl-tb table{width:100%;border-collapse:collapse;font-size:13px}.fl-tb th{background:#F4F7FB;color:var(--navy);text-align:left;padding:8px 10px;white-space:nowrap}.fl-tb td{padding:8px 10px;border-top:1px solid #EEF2F7;vertical-align:top}
  @media(max-width:700px){.fl-ov{padding:0}.fl-dos{margin:0;border-radius:0;min-height:100%}.fl-grid{grid-template-columns:1fr}.fl-filters input,.fl-filters select{max-width:none;flex:1 1 100%}}`;
  document.head.appendChild(st);
}
function flMaint(v) {
  const today = Date.now();
  if (v.nextMaintenanceDate) { const days = Math.floor((new Date(v.nextMaintenanceDate) - today) / 864e5); if (days < 0) return { lvl: 'bad', txt: 'Entretien en retard (' + flD(v.nextMaintenanceDate) + ')' }; if (days <= 30) return { lvl: 'warn', txt: 'Entretien dans ' + days + ' j (' + flD(v.nextMaintenanceDate) + ')' }; }
  if (v.nextMaintenanceMileage && v.currentMileage >= v.nextMaintenanceMileage - 500) return { lvl: v.currentMileage >= v.nextMaintenanceMileage ? 'bad' : 'warn', txt: v.currentMileage >= v.nextMaintenanceMileage ? 'Entretien dépassé (' + fmt(v.nextMaintenanceMileage) + ' km)' : 'Entretien à ' + fmt(v.nextMaintenanceMileage) + ' km' };
  return null;
}
