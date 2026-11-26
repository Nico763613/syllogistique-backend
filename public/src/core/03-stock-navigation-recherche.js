async function stockMove(dir) {
  const items = await api('/inventory/items?siteId=' + state.siteId);
  const fleet = dir === 'out' ? await api('/vehicles?siteId=' + state.siteId).catch(() => []) : [];
  const fields = [
    { key: 'itemId', label: 'Article', options: needOpt(optList(items, (x) => x.id, (x) => `${x.name} (${x.currentQuantity} ${x.unit || ''})`), 'article') },
    { key: 'quantity', label: 'Quantité', type: 'number' },
    { key: 'reason', label: 'Motif' },
  ];
  if (dir === 'in') fields.push({ key: 'unitPrice', label: 'Prix unitaire (GNF)', type: 'number' }, { key: 'lotNumber', label: 'N° de lot (obligatoire si périssable)' }, { key: 'expiryDate', label: 'Date de péremption', type: 'date' });
  else fields.push({ key: 'reasonCode', label: 'Nature de la sortie', options: [['CONSUMPTION', 'Consommation'], ['SALE', 'Vente'], ['LOSS', 'Perte / vol'], ['BREAKAGE', 'Casse'], ['SCRAP', 'Rebut'], ['DONATION', 'Don']] },
    { key: 'vehicleId', label: 'Imputer à (camion / véhicule, facultatif)', options: [['', '— Aucun —'], ...(Array.isArray(fleet) ? fleet : []).slice().sort((a, b) => (a.vehicleType === 'TRUCK' ? 0 : 1) - (b.vehicleType === 'TRUCK' ? 0 : 1)).map(v => [String(v.id), `${v.internalNumber || ''} — ${v.registrationNumber || ''}`])] });
  openEditor(dir === 'in' ? 'Entrée de stock' : 'Sortie de stock', fields, async (d) => {
    const body = { ...d, siteId: state.siteId };
    if (body.expiryDate) body.expiryDate = new Date(body.expiryDate).toISOString();
    await api('/inventory/movements/' + dir, { method: 'POST', body });
    refreshDept();
  });
}

const ACTION_FALLBACK = {
  issue_invoice: 'L\'écran de facturation arrive dans une prochaine version.',
  new_quote: 'L\'écran de devis arrive dans une prochaine version.',
  sales_return: 'L\'écran de retour client arrive dans une prochaine version.',
  maintenance: 'Utilisez le menu Maintenance.',
  documents: 'Utilisez l\'onglet « Documents » de la fiche du véhicule (Camions, Véhicules de service).',
  inventory: 'Utilisez le menu Stocks.',
  locations: 'L\'écran des emplacements arrive dans une prochaine version.',
  reorder: 'Utilisez le menu Achats (réapprovisionnement).',
  supplier_invoice: 'Utilisez le menu Achats.',
};
function refreshDept() { if (state.view && state.view.startsWith('dash-')) renderView(state.view); }
async function runAction(key) {
  try {
    if (ACTION_FORMS[key]) return await ACTION_FORMS[key]();
    alert(ACTION_FALLBACK[key] || 'Cette action arrive dans une prochaine version.');
  } catch (e) { alert(e.message); }
}

// Module activé par la licence (null = tout activé)
function moduleOn(m) {
  let L = window.LIC_MODULES;
  if (L === undefined) { try { L = JSON.parse(localStorage.getItem('syllo_modules') || 'null'); } catch (e) { L = null; } }
  return !Array.isArray(L) || L.includes(m);
}
/* ---------------- Menu en dossiers dépliables (étape 1) ---------------- */
function navFolderItems(lbl) { const out = []; let n = lbl.nextElementSibling; while (n && !n.classList.contains('nav-section-label') && !n.classList.contains('sidebar-footer')) { if (n.classList.contains('nav-item') || n.classList.contains('nav-sub-label')) out.push(n); n = n.nextElementSibling; } return out; }
function navFoldKey(lbl) { return (lbl.textContent || '').replace(/[▾▸]/g, '').trim(); }
function navFoldSet(lbl, closed, save) {
  lbl.classList.toggle('closed', closed);
  navFolderItems(lbl).forEach((el) => el.classList.toggle('nav-folded', closed));
  if (save) { try { const m = JSON.parse(localStorage.getItem('syl_folds') || '{}'); m[navFoldKey(lbl)] = closed ? 1 : 0; localStorage.setItem('syl_folds', JSON.stringify(m)); } catch (e) {} }
}
function navFoldersInit() {
  let m = {}; try { m = JSON.parse(localStorage.getItem('syl_folds') || '{}'); } catch (e) {}
  document.querySelectorAll('#sidebar .nav-section-label').forEach((lbl) => {
    if (!lbl.classList.contains('fold')) {
      lbl.classList.add('fold'); lbl.setAttribute('role', 'button'); lbl.tabIndex = 0;
      lbl.innerHTML = '<span>' + lbl.innerHTML + '</span><span class="arr">▾</span>';
      const t = () => navFoldSet(lbl, !lbl.classList.contains('closed'), true);
      lbl.addEventListener('click', t);
      lbl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } });
    }
    if (m[navFoldKey(lbl)]) navFoldSet(lbl, true, false);
  });
  navFoldersRefresh();
}
function navFoldersRefresh() {
  document.querySelectorAll('#sidebar .nav-section-label.fold').forEach((lbl) => {
    const items = navFolderItems(lbl).filter((el) => el.classList.contains('nav-item'));
    const any = items.some((el) => el.style.display !== 'none');
    lbl.classList.toggle('nav-empty', !any);
  });
}
function navOpenActive() {
  const a = document.querySelector('#sidebar .nav-item.active'); if (!a) return;
  let n = a.previousElementSibling; while (n && !n.classList.contains('nav-section-label')) n = n.previousElementSibling;
  if (n && n.classList.contains('closed')) navFoldSet(n, false, false);
}
document.addEventListener('DOMContentLoaded', navFoldersInit);

/* ---------------- SOCLE v2 : menu réductible + recherche globale ---------------- */
function sideToggle() { const on = document.body.classList.toggle('side-min'); try { localStorage.setItem('syl_side_min', on ? '1' : '0'); } catch (e) {} }
try { if (localStorage.getItem('syl_side_min') === '1') document.body.classList.add('side-min'); } catch (e) {}
const GS_ROLES = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'LECTEUR', 'DIRECTEUR_GENERAL', 'RESPONSABLE_OPERATIONS'];
let GS_T = null;
function gsShow() { const w = document.getElementById('gs-wrap'); if (w) w.style.display = state.user && GS_ROLES.includes(state.user.role) ? '' : 'none'; }
function gsInput() {
  const q = (document.getElementById('gs-input').value || '').trim(), p = document.getElementById('gs-panel');
  clearTimeout(GS_T);
  if (q.length < 2) { p.style.display = 'none'; return; }
  GS_T = setTimeout(async () => {
    p.style.display = 'block'; p.innerHTML = '<div class="gs-none">Recherche…</div>';
    try {
      const r = await api('/search?q=' + encodeURIComponent(q));
      const row = (view, t, sub) => '<button type="button" class="gs-r" onclick="gsGo(\'' + view + '\')">' + esc(t) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</button>';
      const can = (v) => !!document.querySelector('#sidebar .nav-item[data-view="' + v + '"]');
      const vTrucks = can('trucks') ? 'trucks' : (can('home') ? 'home' : 'trucks');
      const sc = typeof gsScope === 'function' ? gsScope() : null, ok = (k) => !sc || sc.includes(k);
      let h = '';
      if (ok('vehicles') && (r.vehicles || []).length) h += '<h5>Camions & véhicules</h5>' + r.vehicles.map((v) => row('trucks', (v.internalNumber || '') + ' · ' + (v.registrationNumber || ''), [v.brand, v.model, v.status].filter(Boolean).join(' · '))).join('');
      if (ok('drivers') && (r.drivers || []).length) h += '<h5>Chauffeurs</h5>' + r.drivers.map((d) => row('drivers', d.firstName + ' ' + d.lastName, [d.phone, d.status].filter(Boolean).join(' · '))).join('');
      if (ok('trips') && (r.trips || []).length) h += '<h5>Missions</h5>' + r.trips.map((t) => row(vTrucks, (t.destination || 'Mission') + (t.purpose ? ' — ' + t.purpose : ''), String(t.tripDate || '').slice(0, 10))).join('');
      if (ok('items') && (r.items || []).length && can('stock')) h += '<h5>Stock</h5>' + r.items.map((i) => row('stock', i.name, (i.sku || '') + ' · ' + i.currentQuantity + ' ' + (i.unit || ''))).join('');
      if (ok('suppliers') && (r.suppliers || []).length && can('purchases')) h += '<h5>Fournisseurs</h5>' + r.suppliers.map((s) => row('purchases', s.name, s.phone || '')).join('');
      p.innerHTML = h || '<div class="gs-none">Aucun résultat pour « ' + esc(q) + ' ».</div>';
    } catch (e) { p.innerHTML = '<div class="gs-none">' + esc(e.message || 'Recherche indisponible.') + '</div>'; }
  }, 300);
}
function gsGo(view) { const p = document.getElementById('gs-panel'); if (p) p.style.display = 'none'; const i = document.getElementById('gs-input'); if (i) i.value = ''; go(view); }
document.addEventListener('click', (e) => { const w = document.getElementById('gs-wrap'), p = document.getElementById('gs-panel'); if (w && p && !w.contains(e.target)) p.style.display = 'none'; });

function applyRoleNav() {
  const role = state.user && state.user.role;
  gsShow();
  let any = false;
  document.querySelectorAll('.nav-item[data-roles]').forEach((el) => {
    let ok = el.dataset.roles.split(',').includes(role);
    if (ok && el.dataset.view === 'simulation' && !SIM.on) ok = false;
    if (ok && ['caisse', 'ventes', 'dash-commercial'].includes(el.dataset.view) && !moduleOn('COMMERCIAL')) ok = false;
    el.style.display = ok ? '' : 'none';
    if (ok) any = true;
  });
  // Les rôles départementaux (commercial, caisse, HSE) ne voient que leur espace
  if (['RESPONSABLE_COMMERCIAL', 'CAISSIER', 'GESTIONNAIRE_HSE', 'AGENT_HSE', 'MECANICIEN', 'POINTEUR', 'DIRECTEUR_GENERAL', 'COMPTABLE', 'RESPONSABLE_OPERATIONS'].includes(role)) {
    document.querySelectorAll('#sidebar .nav-item:not([data-roles])').forEach((el) => { if (el.dataset.view !== 'settings' || role === 'DIRECTEUR_GENERAL') el.style.display = 'none'; });
    document.querySelectorAll('#sidebar .nav-section-label, #sidebar .nav-sub-label').forEach((el) => { el.style.display = 'none'; });
    any = false;
  }
  if (role === 'MAGASINIER') { const el = document.querySelector('#sidebar .nav-item[data-view="purchases"]'); if (el) el.style.display = 'none'; } // les achats restent au Responsable logistique
  const extra = [];
  extra.forEach((v) => { const el = document.querySelector('#sidebar .nav-item[data-view="' + v + '"]'); if (el) el.style.display = ''; });
  const lbl = document.getElementById('nav-dept-label');
  if (lbl) lbl.style.display = any ? '' : 'none';
  if (typeof navFoldersRefresh === 'function') navFoldersRefresh();
}

/* ---------------- DASHBOARD ---------------- */
async function renderView(view) {
  if (!window._silent) root().innerHTML = '<div class="empty">Chargement…</div>';
  try {
    if (view === 'home') return await (renderHome());
    if (view === 'espace') return await (renderWorkspace());
    if (view === 'pointage') return await (renderPointage());
    if (view === 'pilotage') return await (renderExecutive('dg'));
    if (view === 'espace-logi') return await (renderExecutive('logi'));
    if (view === 'dashboard') return await (DG_ROLES.includes(state.user.role) ? renderDirection() : renderDashboard());
    if (view.startsWith('dash-')) return await (renderDeptDashboard(view.slice(5)));
    if (view === 'vehicles') return await (renderVehicles());
    if (view === 'fleet-trucks') return await (renderFleet('TRUCK'));
    if (view === 'fleet-service') return await (renderFleet('SERVICE_VEHICLE'));
    if (view === 'trucks') return await (renderVehicles('TRUCK'));
    if (view === 'service-vehicles') return await (renderVehicles('SERVICE_VEHICLE'));
    if (view === 'driver-devices') return await (renderDriverDevices());
    if (view === 'driver-missions') return await (renderMissionHistory());
    if (view === 'driver-board') return await (renderDriverBoard());
    if (view === 'caisse') return await (renderCaisse());
    if (view === 'ventes') return await (renderVentes());
    if (view === 'compta') return await (renderCompta());
    if (view === 'driver-expenses') return await (state.user.role === 'COMPTABLE' ? renderCompta() : renderDriverExpenses());
    if (view === 'driver-sheets') return await (renderDriverSheets());
    if (view === 'ops-validation') return await (renderOpsValidation());
    if (view === 'drivers') return await (renderDrivers());
    if (view === 'fuel') return await (renderFuel());
    if (view === 'atelier') return await (renderAtelier());
    if (view === 'maintenance') return await (renderMaintenance());
    if (view === 'stock') return await (renderStock());
    if (view === 'purchases') return await (renderPurchases());
    if (view === 'needs') return await (renderNeeds());
    if (view === 'daily') return await (renderDaily());
    if (STAFF_CFG[view]) return await (renderStaff(view));
    if (view === 'signalements') return await (renderProblemReports());
    if (view === 'staff-managers') return await (renderManagers());
    if (view === 'simulation') return await (renderSimulation());
    if (view === 'personnel') return await (renderPersonnel());
    if (view === 'my-report') return await (renderMyReport());
    if (view === 'enrol') return await (renderEnrol());
    if (view === 'reports-drivers') return await (renderReportDrivers());
    if (view === 'reports-stock') return await (state.user.role === 'MAGASINIER' ? renderDeptDashboard('stock') : renderStaff('staff-store', true));
    if (view === 'reports-hse') return await (renderStaff('staff-hse', true));
    if (view === 'reports-dg') return await (renderExecutive('dg'));
    if (view === 'reports-truck') return await (renderKindReports('TRUCK'));
    if (view === 'reports-service') return await (renderKindReports('SERVICE_VEHICLE'));
    if (view === 'sync') return await (renderSync());
    if (view === 'settings') return await (renderSettings());
  } catch (e) {
    root().innerHTML = `<div class="panel"><div class="msg err">${esc(e.message)}</div><button class="btn" style="margin-top:10px" onclick="renderView('${esc(view)}')">Réessayer</button></div>`;
  }
}

async function renderDashboard() {
  const d = await api('/reports/dashboard?siteId=' + state.siteId);
  root().innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Camions</div><div class="kpi-value mono">${d.fleet.trucks.available}/${d.fleet.trucks.total}</div><div class="kpi-sub">disponibles / total</div></div>
      <div class="kpi-card"><div class="kpi-label">Véhicules de service</div><div class="kpi-value mono">${d.fleet.serviceVehicles.available}/${d.fleet.serviceVehicles.total}</div><div class="kpi-sub">disponibles / total</div></div>
      <div class="kpi-card"><div class="kpi-label">En maintenance</div><div class="kpi-value mono">${d.fleet.inMaintenance}</div><div class="kpi-sub">véhicules immobilisés</div></div>
      <div class="kpi-card"><div class="kpi-label">Missions aujourd'hui</div><div class="kpi-value mono">${d.today.trips}</div><div class="kpi-sub">${fmt(d.today.kilometers)} km parcourus</div></div>
      <div class="kpi-card"><div class="kpi-label">Carburant aujourd'hui</div><div class="kpi-value mono">${fmt(d.today.fuelLiters)} L</div><div class="kpi-sub">${fmt(d.today.fuelCost)} GNF</div></div>
      <div class="kpi-card"><div class="kpi-label">Valeur du stock</div><div class="kpi-value mono">${fmt(d.stock.stockValue)}</div><div class="kpi-sub">GNF — ${d.stock.itemsCount} articles</div></div>
    </div>
    <div class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> Alertes</h3>
      <div class="desc">Articles sous le seuil minimum : <b>${d.stock.belowMinimum}</b></div>
      <div id="alert-list" style="margin-top:10px;"></div>
      <button class="btn small" onclick="go('stock')">Voir le stock</button>
      <button class="btn small gold" style="margin-left:8px;" onclick="go('maintenance')">Voir la maintenance</button>
    </div>`;
  loadAlerts();
}
// Centre d'alertes : ruptures, seuils minimum/maximum, permis, entretiens… (non lues)
async function loadAlerts() {
  const box = document.getElementById('alert-list');
  if (!box) return;
  try {
    const list = await api('/notifications?unreadOnly=true');
    box.innerHTML = list.slice(0, 15).map(n => `
      <div class="msg ${n.severity === 'INFO' ? 'ok' : 'err'}" style="margin-bottom:6px; display:flex; justify-content:space-between; gap:10px;">
        <span>${n.severity === 'CRITICAL' ? '<svg class="ic ic-bad" aria-hidden="true"><use href="#i-dot"/></svg>' : n.severity === 'WARNING' ? '<svg class="ic ic-warn" aria-hidden="true"><use href="#i-dot"/></svg>' : '<svg class="ic ic-info" aria-hidden="true"><use href="#i-dot"/></svg>'} <b>${esc(n.title)}</b> — ${esc(n.message)}</span>
        <button class="btn small" onclick="markAlertRead('${esc(n.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Lu</button>
      </div>`).join('') || '<div class="desc">Aucune alerte non lue.</div>';
  } catch (e) { box.innerHTML = ''; }
}
async function markAlertRead(id) {
  try { await api('/notifications/' + id + '/read', { method: 'PATCH' }); } catch (e) {}
  loadAlerts();
}

/* ---------------- VEHICLES ---------------- */
async function renderVehicles(kind) {
  const all = await api('/vehicles?siteId=' + state.siteId);
  const list = kind ? all.filter(v => v.vehicleType === kind) : all;
  const kindLabel = kind === 'TRUCK' ? 'camion' : kind === 'SERVICE_VEHICLE' ? 'véhicule de service' : 'véhicule';
  let fleetTarget = 10;
  try {
    const st = await api('/settings');
    const f = st.find(x => x.key === 'FLEET_TARGET');
    if (f && Number(f.value) > 0) fleetTarget = Number(f.value);
  } catch (e) {}
  window._vehicles = list;
  const canTarget = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role);
  let drvList = []; if (kind === 'TRUCK') { try { drvList = await api('/drivers?siteId=' + state.siteId); } catch (e) {} }
  const insBadge = (i) => !i || i.status === 'NONE' ? '<span class="badge bad">Aucune assurance</span>'
    : i.status === 'EXPIRED' ? `<span class="badge bad">Non valide — expirée le ${new Date(i.expiryDate).toLocaleDateString('fr-FR')}</span>`
    : i.status === 'EXPIRING' ? `<span class="badge warn"><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> Expire dans ${i.daysLeft} j (${new Date(i.expiryDate).toLocaleDateString('fr-FR')})</span>`
    : `<span class="badge ok">Valide${i.expiryDate ? ' → ' + new Date(i.expiryDate).toLocaleDateString('fr-FR') : ''}</span>`;
  const insAlerts = kind === 'TRUCK' ? list.filter(v => v.insurance && (v.insurance.status === 'EXPIRING' || v.insurance.status === 'EXPIRED')) : [];
  const truckRows = list.map(v => `
    <tr>
      <td><b>${esc(v.internalNumber)}</b></td>
      <td>${esc(v.registrationNumber)}${v.registrationType === 'IT' ? ' <span class="badge warn">IT</span>' : ''}</td>
      <td>${esc([v.brand, v.model].filter(Boolean).join(' ') || '—')}</td>
      <td>${esc(v.truckType ? ttLabel(v.truckType) : '—')}</td>
      <td>${v.wheels != null ? esc(v.wheels) : '—'}</td>
      <td>${esc(v.capacity || '—')}</td>
      <td>${v.assignedDriver ? `<b>${esc(v.assignedDriver.lastName)}</b> ${esc(v.assignedDriver.firstName)}<br><small>${esc(v.assignedDriver.phone || '—')} · permis ${esc(v.assignedDriver.licenseNumber || '—')}</small>` : '—'}</td>
      <td>${insBadge(v.insurance)}</td>
      <td class="mono">${fmt(v.currentMileage)} km</td>
      <td>${statusBadge(v.status)}</td>
      <td style="white-space:nowrap"><button class="btn small" onclick="editVehicle('${esc(v.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg></button> <button class="btn small gold" onclick="vehDriverPanel('${esc(v.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-user"/></svg> Chauffeur</button></td>
    </tr>`).join('') || `<tr><td colspan="11" class="empty">Aucun camion enregistré.</td></tr>`;
  const rows = list.map(v => `
    <tr>
      <td><b>${esc(v.internalNumber)}</b></td>
      <td>${v.vehicleType === 'TRUCK' ? 'Camion' : 'Véhicule de service'}</td>
      <td>${esc(v.registrationNumber)}${v.registrationType === 'IT' ? ' <span class="badge warn">IT' + (v.itExpiryDate ? ' → ' + new Date(v.itExpiryDate).toLocaleDateString('fr-FR') : '') + '</span>' : ''}</td>
      <td>${esc(v.assignedDriver ? v.assignedDriver.firstName + ' ' + v.assignedDriver.lastName : '—')}</td>
      <td class="mono">${fmt(v.currentMileage)} km</td>
      <td>${statusBadge(v.status)}</td>
      <td style="white-space:nowrap"><button class="btn small" onclick="editVehicle('${esc(v.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg></button> <button class="btn small gold" onclick="vehDriverPanel('${esc(v.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-user"/></svg> Chauffeur</button></td>
    </tr>`).join('') || `<tr><td colspan="7" class="empty">Aucun ${kindLabel} enregistré.</td></tr>`;

  root().innerHTML = `
    <div class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Ajouter un ${kindLabel}</h3>
      <div class="grid-2">
        ${kind ? `<div><label>Type</label><select id="v-type" disabled><option value="${kind}">${kind === 'TRUCK' ? 'Camion' : 'Véhicule de service'}</option></select></div>` : `<div><label>Type</label><select id="v-type"><option value="TRUCK">Camion</option><option value="SERVICE_VEHICLE">Véhicule de service</option></select></div>`}
        <div><label>N° interne</label><input id="v-internal" placeholder="TRUCK-001" /></div>
        <div><label>Plaque</label><input id="v-plate" placeholder="RC 1234 A" /></div>
        <div><label>Marque / Modèle</label><input id="v-brand" placeholder="Toyota Hilux" /></div>
        <div><label>Immatriculation</label><select id="v-regtype"><option value="NORMALE">Normale</option><option value="IT">IT (Immatriculation Temporaire)</option></select></div>
        <div><label>Fin de validité plaque IT</label><input id="v-itexp" type="date" /></div>
        ${kind === 'TRUCK' ? `
        <div><label>Type de camion</label><select id="v-ttype"><option value="">— Choisir —</option>${TRUCK_TYPES.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select></div>
        <div><label>Nombre de roues</label>${otherSel('v-wheels', TRUCK_WHEELS, n => n + ' roues', 'Nombre de roues')}</div>
        <div><label>Capacité</label>${otherSel('v-cap', TRUCK_CAPS, n => n + ' tonnes', 'Ex. 80 t')}</div>
        <div><label>Chauffeur affecté</label><select id="v-driver"><option value="">— Aucun —</option>${drvList.filter(d => d.activity !== 'SERVICE_VEHICLE').map(d => `<option value="${esc(d.id)}">${esc(d.lastName + ' ' + d.firstName)}${d.activity === 'SERVICE_VEHICLE' ? ' (véhicule de service)' : ''}</option>`).join('')}</select></div>
        <div><label>Assurance — N° de police</label><input id="v-insref" /></div>
        <div><label>Assurance — date d'expiration</label><input id="v-insexp" type="date" /></div>` : ''}
      </div>
      <button class="btn gold" onclick="createVehicle()">Enregistrer</button>
      <div id="v-msg"></div>
    </div>
    <div class="panel">
      <h3>${kind === 'TRUCK' ? 'Camions' : kind === 'SERVICE_VEHICLE' ? 'Véhicules de service' : 'Parc'} (${list.length}${kind ? '' : ' / ' + fleetTarget + ' prévus'})
        ${canTarget ? `<button class="btn small" style="margin-left:8px;" onclick="editFleetTarget(${fleetTarget})"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg> Objectif</button>` : ''}</h3>
      ${!kind && list.length < fleetTarget ? `<div class="desc">Il reste ${fleetTarget - list.length} véhicule(s) à enregistrer pour atteindre l'objectif.</div>` : ''}
      ${insAlerts.length ? `<div class="msg err" style="margin-bottom:10px"><svg class="ic" aria-hidden="true"><use href="#i-shield"/></svg> Assurance à renouveler : ${insAlerts.map(v => esc(v.internalNumber) + (v.insurance.status === 'EXPIRED' ? ' (expirée)' : ' (dans ' + v.insurance.daysLeft + ' j)')).join(', ')}</div>` : ''}
      ${kind === 'TRUCK' ? `<table><thead><tr><th>N° interne</th><th>Plaque</th><th>Marque / modèle</th><th>Type</th><th>Roues</th><th>Capacité</th><th>Chauffeur</th><th>Assurance</th><th>Kilométrage</th><th>Statut</th><th></th></tr></thead><tbody>${truckRows}</tbody></table>`
      : `<table><thead><tr><th>N° interne</th><th>Type</th><th>Plaque</th><th>Chauffeur</th><th>Kilométrage</th><th>Statut</th><th></th></tr></thead><tbody>${rows}</tbody></table>`}
    </div>
    <div class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-compass"/></svg> Missions et fiches de bord</h3>
      <div class="grid-2">
        <div><label>Véhicule</label><select id="tr-vehicle">${list.filter(v => v.status !== 'IMMOBILIZED').map(v => `<option value="${esc(v.id)}" data-km="${v.currentMileage}">${esc(v.internalNumber)} — ${esc(v.registrationNumber)}</option>`).join('')}</select></div>
        <div><label>Chauffeur</label><select id="tr-driver"></select></div>
        <div><label>Destination</label><input id="tr-dest" /></div>
        <div><label>Objet / passager</label><input id="tr-purpose" /></div>
        <div><label>Km au départ</label><input id="tr-km" type="number" min="0" /></div>
      </div>
      <button class="btn gold" onclick="startTrip()">Démarrer la mission</button>
      <div id="tr-msg"></div>
      <div id="tr-list" style="margin-top:12px;"></div>
    </div>
    <div class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Documents des véhicules (assurance, visite technique, carte grise…)</h3>
      <div class="grid-2">
        <div><label>Véhicule</label><select id="dc-vehicle">${list.map(v => `<option value="${esc(v.id)}">${esc(v.internalNumber)} — ${esc(v.registrationNumber)}</option>`).join('')}</select></div>
        <div><label>Type</label><select id="dc-type"><option value="ASSURANCE">Assurance</option><option value="VISITE_TECHNIQUE">Visite technique</option><option value="CARTE_GRISE">Carte grise</option><option value="CONTRAT">Contrat</option><option value="AUTRE">Autre</option></select></div>
        <div><label>N° / référence</label><input id="dc-ref" placeholder="N° de police, de certificat…" /></div>
        <div><label>Date d'expiration</label><input id="dc-exp" type="date" /></div>
      </div>
      <button class="btn gold" onclick="addVehicleDoc()">Enregistrer le document</button>
      <div id="dc-msg"></div>
      <div id="dc-list" style="margin-top:12px;"></div>
    </div>
    <div class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> Pannes et immobilisations</h3>
      <div class="grid-2">
        <div><label>Véhicule</label><select id="dt-vehicle">${list.filter(v => v.status !== 'IMMOBILIZED').map(v => `<option value="${esc(v.id)}">${esc(v.internalNumber)} — ${esc(v.registrationNumber)}</option>`).join('')}</select></div>
        <div><label>Catégorie</label><select id="dt-cat"><option value="PANNE">Panne</option><option value="ACCIDENT">Accident</option><option value="ENTRETIEN">Entretien</option><option value="ADMINISTRATIF">Administratif (papiers, assurance)</option><option value="AUTRE">Autre</option></select></div>
        <div><label>Motif (obligatoire)</label><input id="dt-reason" placeholder="Ex. : boîte de vitesses HS" /></div>
        <div><label>Coût estimé (GNF)</label><input id="dt-cost" type="number" min="0" /></div>
      </div>
      <button class="btn gold" onclick="reportDowntime()">Immobiliser le véhicule</button>
      <div id="dt-msg"></div>
      <div id="dt-list" style="margin-top:12px;"></div>
    </div>`;
  loadDowntimes();
  loadVehicleDocs();
  loadTrips();
}
async function loadTrips() {
  const box = document.getElementById('tr-list');
  if (!box) return;
  try {
    const [drivers, trips, custs] = await Promise.all([api('/drivers?siteId=' + state.siteId), api('/trips?siteId=' + state.siteId), api('/customers').catch(() => [])]);
    window._trCust = custs;
    document.getElementById('tr-driver').innerHTML = drivers.map(d => `<option value="${esc(d.id)}">${esc(d.firstName)} ${esc(d.lastName)}</option>`).join('');
    const vs = document.getElementById('tr-vehicle');
    const fillKm = () => { const o = vs.options[vs.selectedIndex]; if (o) document.getElementById('tr-km').value = o.dataset.km || 0; };
    vs.onchange = fillKm; fillKm();
    box.innerHTML = trips.length ? `<table><thead><tr><th>Date</th><th>Véhicule</th><th>Chauffeur</th><th>Destination</th><th>Client</th><th>Km</th><th></th></tr></thead><tbody>${trips.slice(0, 30).map(t => `
      <tr><td>${new Date(t.tripDate).toLocaleDateString('fr-FR')}</td><td>${esc(t.vehicle?.internalNumber)}</td><td>${esc(t.driver?.firstName)} ${esc(t.driver?.lastName)}</td><td>${esc(t.destination || '—')}</td>
      <td>${t.customerId ? esc((custs.find((c) => c.id === t.customerId) || {}).name || '—') : '<span class="badge warn">à préciser</span>'} ${t.billedInvoiceId ? '' : `<button class="btn small" onclick="tripClient('${esc(t.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg></button>`}</td>
      <td class="mono">${t.distance ?? '…'}</td>
      <td>${t.endMileage === null ? `<button class="btn small gold" onclick="closeTrip('${esc(t.id)}')">Clôturer</button>` : ''} <button class="btn small" onclick="tripPdf('${esc(t.id)}')">Fiche de bord</button></td></tr>`).join('')}</tbody></table>` : '<div class="desc">Aucune mission enregistrée.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function tripClient(id) {
  const cs = window._trCust || [];
  openEditor('Client de la mission', [{ key: 'customerId', label: 'Client à facturer', options: cs.map((c) => [c.id, c.name]) }], async (d) => {
    if (!d.customerId) throw new Error('Choisissez un client.');
    await api('/trips/' + id + '/customer', { method: 'PATCH', body: { customerId: d.customerId } }); renderView(state.view);
  });
}
async function startTrip() {
  const msg = document.getElementById('tr-msg');
  try {
    const now = new Date().toISOString();
    await api('/trips', { method: 'POST', body: {
      siteId: state.siteId, vehicleId: document.getElementById('tr-vehicle').value, driverId: document.getElementById('tr-driver').value,
      tripDate: now.slice(0, 10), startTime: now, startMileage: Number(document.getElementById('tr-km').value || 0),
      destination: document.getElementById('tr-dest').value.trim() || undefined, purpose: document.getElementById('tr-purpose').value.trim() || undefined,
    } });
    renderView(state.view);
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function closeTrip(id) {
  const km = prompt('Kilométrage au retour :');
  if (km === null || km === '') return;
  try { await api('/trips/' + id + '/close', { method: 'PATCH', body: { endTime: new Date().toISOString(), endMileage: Number(km) } }); renderView(state.view); } catch (e) { alert(e.message); }
}
async function tripPdf(id) {
  try {
    const blob = await api('/trips/' + id + '/pdf');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fiche_de_bord.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) { alert(e.message); }
}
async function loadVehicleDocs() {
  const box = document.getElementById('dc-list');
  if (!box) return;
  try {
    const docs = await api('/documents');
    const names = { ASSURANCE: 'Assurance', VISITE_TECHNIQUE: 'Visite technique', CARTE_GRISE: 'Carte grise', CONTRAT: 'Contrat', AUTRE: 'Autre' };
    const stat = (d) => {
      if (!d.expiryDate) return '<span class="badge info">Sans échéance</span>';
      const days = Math.ceil((new Date(d.expiryDate) - Date.now()) / 86400000);
      return days < 0 ? `<span class="badge bad">Expiré (${-days} j)</span>` : days <= 7 ? `<span class="badge bad">Urgent : ${days} j</span>` : days <= 30 ? `<span class="badge warn">Expire dans ${days} j</span>` : '<span class="badge ok">Valide</span>';
    };
    docs.sort((a, b) => (a.expiryDate ? new Date(a.expiryDate) : 8.64e15) - (b.expiryDate ? new Date(b.expiryDate) : 8.64e15));
    box.innerHTML = docs.length ? `<table><thead><tr><th>Véhicule</th><th>Document</th><th>Référence</th><th>Échéance</th><th>État</th><th></th></tr></thead><tbody>${docs.map(d => `
      <tr><td>${esc(d.vehicle?.internalNumber)} — ${esc(d.vehicle?.registrationNumber)}</td><td>${esc(names[d.type] || d.type)}</td><td>${esc(d.fileUrl)}</td>
      <td>${d.expiryDate ? new Date(d.expiryDate).toLocaleDateString('fr-FR') : '—'}</td><td>${stat(d)}</td><td>${d.expiryDate && MP_FLEET.includes((state.user && state.user.role) || '') ? `<button class="btn small" onclick="renewVehicleDoc('${d.id}')">Renouveler</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="desc">Aucun document enregistré. Les échéances déclenchent une alerte 30 jours puis 7 jours avant.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function renewVehicleDoc(id) {
  const exp = prompt('Nouvelle date d\'échéance (AAAA-MM-JJ) :');
  if (!exp) return;
  const ref = prompt('Nouvelle référence du document (laisser vide pour garder l\'ancienne) :') || '';
  try {
    await api('/documents/' + id + '/renew', { method: 'POST', body: { expiryDate: exp, ...(ref.trim() ? { fileUrl: ref.trim() } : {}) } });
    renderView(state.view);
  } catch (e) { alert(e.message); }
}
async function addVehicleDoc() {
  const msg = document.getElementById('dc-msg');
  try {
    const exp = document.getElementById('dc-exp').value;
    await api('/documents', { method: 'POST', body: { vehicleId: document.getElementById('dc-vehicle').value, type: document.getElementById('dc-type').value, fileUrl: document.getElementById('dc-ref').value.trim() || '—', ...(exp ? { expiryDate: exp } : {}) } });
    renderView(state.view);
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function editFleetTarget(current) {
  const v = prompt('Nombre de véhicules prévus dans le parc :', current);
  if (v === null || !(Number(v) > 0)) return;
  try { await api('/settings/FLEET_TARGET', { method: 'PUT', body: { value: String(Math.round(Number(v))) } }); renderView(state.view); } catch (e) { alert(e.message); }
}
/* ---------- Entretien préventif : plans par véhicule → alerte → planification → entretien effectué ---------- */
const MP_LEVEL = { OVERDUE: ['bad', 'En retard'], SOON: ['warn', 'Bientôt dû'], OK: ['ok', 'À jour'] };
const MP_FLEET = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE'];
async function mpLoad() {
  const box = document.getElementById('mp-body'); if (!box) return;
  try {
    const r = await api('/maintenance-plans?siteId=' + encodeURIComponent(state.siteId || ''));
    const role = (state.user && state.user.role) || '', fleet = MP_FLEET.includes(role);
    const dd = (x) => new Date(x).toLocaleDateString('fr-FR');
    const tile = (n, l, c) => `<div style="flex:1;min-width:100px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px;text-align:center"><div style="font-size:18px;font-weight:700;color:${c}">${n}</div><div style="font-size:12px;color:var(--muted)">${l}</div></div>`;
    const seuil = (i) => [i.intervalKm ? 'tous les ' + fmt(i.intervalKm) + ' km' : '', i.intervalDays ? 'tous les ' + i.intervalDays + ' j' : ''].filter(Boolean).join(' · ');
    const reste = (i) => [i.kmLeft != null ? (i.kmLeft <= 0 ? 'dépassé de ' + fmt(-i.kmLeft) + ' km' : fmt(i.kmLeft) + ' km') : '', i.daysLeft != null ? (i.daysLeft < 0 ? 'dépassé de ' + (-i.daysLeft) + ' j' : i.daysLeft + ' j') : ''].filter(Boolean).join(' · ') || '—';
    const btns = (i) => {
      const out = [];
      if (fleet && i.active && i.level !== 'OK' && !i.planned) out.push(`<button class="btn small gold" onclick="mpSchedule('${esc(i.id)}')">Planifier</button>`);
      if (i.planned && (fleet || role === 'MECANICIEN')) out.push(`<button class="btn small gold" onclick="mpComplete('${esc(i.planned.id)}')">Entretien effectué</button>`);
      if (fleet) out.push(`<button class="btn small" onclick="mpEdit('${esc(i.id)}')">Modifier</button>`);
      return out.join(' ');
    };
    const head = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">${tile(r.summary.overdue, 'En retard', r.summary.overdue ? 'var(--bad,#b3261e)' : 'var(--navy)')}${tile(r.summary.soon, 'Bientôt dus', 'var(--navy)')}${tile(r.summary.toPlan, 'À planifier', 'var(--navy)')}${tile(r.summary.planned, 'Planifiés', 'var(--navy)')}</div>${fleet ? '<button class="btn small gold" style="margin:0 0 8px" onclick="mpNew()"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Nouveau plan d\'entretien</button>' : ''}`;
    box.innerHTML = head + (r.items.length ? `<div style="overflow:auto"><table><tr><th>Véhicule</th><th>Entretien</th><th>Seuil</th><th>Dernier</th><th>Reste</th><th>État</th><th></th></tr>${r.items.map((i) => {
      const [c, l] = MP_LEVEL[i.level] || ['info', i.level];
      return `<tr style="${i.active ? '' : 'opacity:.5'}"><td><b>${esc(i.vehicle)}</b><br><small>${fmt(i.currentMileage)} km</small></td><td>${esc(i.type)}</td><td>${seuil(i)}</td><td>${i.lastDoneAt ? dd(i.lastDoneAt) : '—'}${i.lastDoneKm != null ? '<br><small>' + fmt(i.lastDoneKm) + ' km</small>' : ''}</td><td>${reste(i)}</td><td><span class="badge ${c}">${i.active ? l : 'Désactivé'}</span>${i.planned ? '<br><small>Planifié le ' + dd(i.planned.maintenanceDate) + '</small>' : ''}${i.next ? `<div style="font-size:12px;margin-top:3px"><b>${esc(i.next.who)} :</b> ${esc(i.next.text)}</div>` : ''}</td><td style="white-space:nowrap">${btns(i)}</td></tr>`;
    }).join('')}</table></div>` : '<div class="empty">Aucun plan d\'entretien. Créez-en un pour être prévenu avant chaque échéance.</div>');
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
