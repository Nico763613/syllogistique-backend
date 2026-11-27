function otherVal(id) { const e = document.getElementById(id); if (!e) return ''; return e.value === '__o' ? (document.getElementById(id + '-o').value || '').trim() : e.value; }
const capNum = (c) => { const m = /^\s*(\d+(?:[.,]\d+)?)\s*t/i.exec(c || ''); return m ? String(parseFloat(m[1].replace(',', '.'))) : (c || ''); };
const capFmt = (v) => (/^\d+([.,]\d+)?$/.test(v) ? v + ' t' : v);

/* ---------- Historique (journal des modifications de l'écran) et sauvegarde automatique des saisies ---------- */
const HIST_ENT = {
  trucks: ['Vehicle', 'Document', 'VehicleDowntime'], 'service-vehicles': ['Vehicle', 'Document', 'VehicleDowntime'], vehicles: ['Vehicle', 'Document', 'VehicleDowntime'],
  drivers: ['Driver', 'DriverDevice'], 'driver-devices': ['DriverDevice'], fuel: ['FuelTransaction'], maintenance: ['Maintenance', 'DriverMaintenance'],
  'driver-expenses': ['DriverExpense'], compta: ['DriverExpense', 'DriverDailyReport'], 'driver-sheets': ['DriverDailyReport'], 'driver-board': ['DriverDailyReport', 'Trip'], 'driver-missions': ['Trip'], daily: ['DriverDailyReport', 'Trip'], 'reports-truck': ['DriverDailyReport', 'Trip'], 'reports-service': ['DriverDailyReport', 'Trip'],
  stock: ['InventoryItem', 'StockMovement'], purchases: ['PurchaseOrder', 'GoodsReceipt'], needs: ['Need'], 'dash-hse': ['HseIncident', 'HseInspection'],
};
const HIST_LAB = { CREATE: 'Création', UPDATE: 'Modification', DELETE: 'Suppression' };
async function openHistory() {
  const old = document.getElementById('hist-overlay'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = 'hist-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px;';
  ov.innerHTML = `<div class="panel" style="max-width:720px;width:100%;margin:20px auto;"><h3><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> Historique — ${esc(titles[state.view] || '')}</h3><div id="hist-body" class="empty">Chargement…</div><div style="margin-top:12px"><button class="btn" onclick="document.getElementById('hist-overlay').remove()">← Retour</button></div></div>`;
  document.body.appendChild(ov);
  const ents = HIST_ENT[state.view];
  const body = document.getElementById('hist-body');
  try {
    const rows = await api('/audit?limit=60' + (ents ? '&entities=' + encodeURIComponent(ents.join(',')) : ''));
    const keys = (r) => { const n = r.newValue && typeof r.newValue === 'object' ? Object.keys(r.newValue) : []; return n.slice(0, 6).join(', '); };
    body.className = '';
    body.innerHTML = rows.length ? `<table><thead><tr><th>Date</th><th>Par</th><th>Action</th><th>Élément</th><th>Champs</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${new Date(r.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>${esc(r.user ? r.user.firstName + ' ' + r.user.lastName : 'Chauffeur / système')}</td><td>${esc(HIST_LAB[r.action] || r.action)}</td><td>${esc(r.entity)}</td><td style="font-size:12px;color:var(--muted)">${esc(keys(r))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aucune modification enregistrée pour cet écran.</div>';
  } catch (e) { body.className = ''; body.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
// Sauvegarde automatique : les champs saisis sont gardés sur l'appareil (par écran) et restaurés si la page est rechargée ou fermée par erreur.
const DRAFT = { t: null };
const draftKey = () => 'syllo_draft_' + (state.user ? state.user.id : '') + '_' + state.view;
function draftSkip(el) { return !el.id && !el.dataset.k || el.type === 'password' || el.type === 'file' || el.type === 'hidden' || el.type === 'button' || el.disabled || el.closest('#login-screen,#driver-app,#hist-overlay'); }
function draftSave() {
  try {
    const data = {};
    document.querySelectorAll('#view-root input, #view-root select, #view-root textarea, #editor-overlay input, #editor-overlay select').forEach((el) => {
      if (draftSkip(el)) return;
      const k = (el.closest('#editor-overlay') ? 'E:' : '') + (el.id || el.dataset.k);
      if (el.type === 'checkbox' || el.type === 'radio') data[k] = el.checked;
      else if (el.value !== '' && el.value != null) data[k] = el.value;
    });
    const n = Object.keys(data).length;
    if (n) localStorage.setItem(draftKey(), JSON.stringify({ at: Date.now(), data }));
    const note = document.getElementById('draft-note'); if (note) note.textContent = n ? 'Brouillon enregistré' : '';
  } catch (e) {}
}
function draftRestore() {
  try {
    const raw = localStorage.getItem(draftKey()); if (!raw) return;
    const { at, data } = JSON.parse(raw);
    if (Date.now() - at > 7 * 864e5) { localStorage.removeItem(draftKey()); return; }
    let n = 0;
    document.querySelectorAll('#view-root input, #view-root select, #view-root textarea').forEach((el) => {
      if (draftSkip(el) || !(el.id in data) ) return;
      const v = data[el.id];
      if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked !== v) { el.checked = v; n++; } }
      else if (typeof v === 'string' && el.value !== v && (el.tagName === 'SELECT' ? [...el.options].some((o) => o.value === v) : !el.value)) { el.value = v; n++; }
    });
    const note = document.getElementById('draft-note');
    if (note && n) note.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-save"/></svg> Brouillon restauré · <a href="#" onclick="draftClear(true);return false;">effacer</a>';
  } catch (e) {}
}
function draftClear(reload) { try { localStorage.removeItem(draftKey()); } catch (e) {} const note = document.getElementById('draft-note'); if (note) note.textContent = ''; if (reload) renderView(state.view); }
document.addEventListener('input', () => { clearTimeout(DRAFT.t); DRAFT.t = setTimeout(draftSave, 800); }, true);
document.addEventListener('change', () => { clearTimeout(DRAFT.t); DRAFT.t = setTimeout(draftSave, 300); }, true);

state.hist = []; state.ign = 0;
function goBackBtn() { const b = document.getElementById('back-btn'); if (b) b.style.display = (state.hist.length || (state.view && state.view !== 'dashboard')) ? '' : 'none'; }
// Flèche ← (et bouton retour du téléphone) : revient à l'écran précédent sans quitter l'application.
function goBack(fromPop) {
  if (ovTop()) { ovClose(ovTop()); return; }
  if (!state.hist.length) { if (state.view && state.view !== 'dashboard') go('dashboard', true); return; }
  const v = state.hist.pop();
  go(v, true);
  if (!fromPop) { try { state.ign++; history.back(); } catch (e) { state.ign = 0; } }
}

/* ---- Retour sur chaque fenêtre ouverte (fiche véhicule, historique, alertes, formulaires…) : bouton « ← Retour » + bouton retour du téléphone ---- */
const OV_IDS = ['dl-ov', 'fl-ov', 'hist-overlay', 'report-ov', 'dt-ov', 'su-ov', 'ph-ov', 'al-overlay', 'pe-overlay', 'install-help', 'at-ov', 'lic-ov', 'pin-ov', 'pr-ov', 'rc-ov'];
const OV = { ign: 0, tracked: new Map() };
function ovTop() { let top = null; OV.tracked.forEach((n) => { if (n.isConnected) top = n; }); return top; }
function ovClose(n) {
  if (!n) return;
  if (n.id === 'al-overlay' && typeof alertsCenterClose === 'function') alertsCenterClose();
  else if (n.id === 'ph-ov' && typeof closePhotoEditor === 'function') closePhotoEditor();
  else n.remove();
}
(function ovInit() {
  if (!document.getElementById('ov-back-css')) { const st = document.createElement('style'); st.id = 'ov-back-css'; st.textContent = '.ov-back{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:6px;width:100%;background:#1F3A5F;color:#fff;border:0;border-bottom:2px solid #C9A24D;padding:12px 16px;font-size:16px;font-weight:700;cursor:pointer;text-align:left;min-height:48px}.ov-back.in{position:static;border-radius:8px;margin-bottom:10px}.ov-back:active{opacity:.85}'; document.head.appendChild(st); }
  const add = (n) => {
    let host = n;
    try { if (getComputedStyle(n).display.includes('flex') && n.firstElementChild) host = n.firstElementChild; } catch (e) {}
    if (host.querySelector(':scope > .ov-back')) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ov-back' + (host === n ? '' : ' in'); b.setAttribute('aria-label', 'Retour'); b.innerHTML = '← Retour'; b.onclick = (e) => { e.stopPropagation(); ovClose(n); };
    host.insertBefore(b, host.firstChild);
  };
  new MutationObserver((recs) => {
    const added = [], removed = [];
    recs.forEach((r) => { r.addedNodes.forEach((n) => { if (n.nodeType === 1 && OV_IDS.includes(n.id)) added.push(n); }); r.removedNodes.forEach((n) => { if (n.nodeType === 1 && OV.tracked.get(n.id) === n && !n.isConnected) removed.push(n); }); });
    added.forEach((n) => { add(n); });
    const addedIds = added.map((n) => n.id);
    removed.forEach((n) => {
      const replaced = addedIds.includes(n.id);
      OV.tracked.delete(n.id);
      if (!replaced) { try { OV.ign++; history.back(); } catch (e) { OV.ign = 0; } }
    });
    added.forEach((n) => {
      const had = removed.some((r) => r.id === n.id);
      OV.tracked.set(n.id, n);
      if (!had) { try { history.pushState({ ov: 1 }, ''); } catch (e) {} }
    });
  }).observe(document.body, { childList: true });
  window.addEventListener('popstate', (e) => {
    if (OV.ign > 0) { OV.ign--; e.stopImmediatePropagation(); return; }
    const t = ovTop();
    if (t) { e.stopImmediatePropagation(); const id = t.id; OV.tracked.delete(id); ovClose(t); }
  });
})();
window.addEventListener('popstate', () => { if (state.ign > 0) { state.ign--; return; } if (state.hist.length && document.getElementById('back-btn') && !(window.DRV && DRV.hist && DRV.hist.length)) goBack(true); });
function go(view, noPush) {
  if (window._menuLock && window._menuLock.view !== view) window._menuLock = null;
  if (!noPush && state.view && state.view !== view) { state.hist.push(state.view); if (state.hist.length > 30) state.hist.shift(); try { history.pushState({ off: 1 }, ''); } catch (e) {} }
  state.view = view;
  goBackBtn();
  if (typeof spaceApply === 'function') spaceApply();
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === navKey(view)));
  if (typeof navOpenActive === 'function') navOpenActive();
  document.getElementById('view-title').textContent = titles[view];
  document.getElementById('sidebar').classList.remove('open');
  renderView(view);
}

// Après chaque affichage d'écran : restauration du brouillon éventuel
{ const _rv = renderView; renderView = async function (view) { const r = await _rv(view); draftRestore(); return r; }; }

/* ---------- Actualisation automatique du bureau (toutes les 30 s, écran ouvert et visible uniquement) ---------- */
const LIVE_VIEWS = ['compta', 'ops-validation', 'dashboard', 'trucks', 'service-vehicles', 'driver-board', 'driver-sheets', 'driver-expenses', 'driver-missions', 'driver-devices', 'vehicles', 'fuel', 'maintenance', 'reports-truck', 'reports-service'];
const LIVE = { since: null, timer: null, busy: false };
function liveCanRun() {
  return !!state.accessToken && !!state.user && document.visibilityState === 'visible' && navigator.onLine && !document.getElementById('driver-app')?.offsetParent && state.user.role !== 'CHAUFFEUR' && ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'RESPONSABLE_OPERATIONS', 'COMPTABLE'].includes(state.user.role);
}
async function liveTick() {
  if (LIVE.busy || !liveCanRun()) return;
  LIVE.busy = true;
  try {
    const r = await api('/driver-admin/changes?siteId=' + encodeURIComponent(state.siteId || '') + (LIVE.since ? '&since=' + encodeURIComponent(LIVE.since) : ''));
    const first = !LIVE.since; LIVE.since = r.now;
    const lab = document.getElementById('live-label');
    if (lab) lab.textContent = 'Actualisé à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + (r.pendingExpenses ? ' · ' + r.pendingExpenses + ' dépense(s) à valider' : '');
    const a = document.activeElement, typing = a && ['INPUT', 'SELECT', 'TEXTAREA'].includes(a.tagName);
    if (!first && r.changed && LIVE_VIEWS.includes(state.view) && !typing) {
      const sc = document.querySelector('.main'); const top = sc ? sc.scrollTop : 0; const wy = window.scrollY;
      window._silent = true;
      try { await renderView(state.view); } finally { window._silent = false; }
      if (sc) sc.scrollTop = top; window.scrollTo(0, wy);
      if (typeof loadAlerts === 'function') loadAlerts();
    }
  } catch (e) { /* silencieux : on réessaiera au prochain tour */ }
  LIVE.busy = false;
}
function liveStart() {
  if (LIVE.timer) return;
  LIVE.timer = setInterval(liveTick, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') liveTick(); });
  setTimeout(liveTick, 3000);
}
liveStart();

/* ---------- Cloche de notification : alerte immédiate (vérification toutes les 20 s) ---------- */
const BELL = { ids: null, list: [], timer: null, busy: false };
function bellBeep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    BELL.ac = BELL.ac || new AC(); const ac = BELL.ac; if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.25, t + .02); g.gain.linearRampToValueAtTime(0, t + .3);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + .32);
  } catch (e) {}
}
function bellToast(text) {
  let t = document.getElementById('bell-toast');
  if (!t) { t = document.createElement('div'); t.id = 'bell-toast'; t.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);background:var(--navy);color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;z-index:200;box-shadow:var(--shadow);max-width:90vw;cursor:pointer'; t.onclick = () => { t.style.display = 'none'; bellToggle(); }; document.body.appendChild(t); }
  t.textContent = text; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => { t.style.display = 'none'; }, 6000);
}
function bellRender() {
  const c = document.getElementById('bell-count'), p = document.getElementById('bell-panel');
  if (c) { c.textContent = BELL.list.length > 99 ? '99+' : BELL.list.length; c.style.display = BELL.list.length ? 'block' : 'none'; }
  if (p) p.innerHTML = BELL.list.slice(0, 20).map(n => `
    <div class="msg ${n.severity === 'INFO' ? 'ok' : 'err'}" style="display:flex; justify-content:space-between; gap:8px;">
      <span>${n.severity === 'CRITICAL' ? '<svg class="ic ic-bad" aria-hidden="true"><use href="#i-dot"/></svg>' : n.severity === 'WARNING' ? '<svg class="ic ic-warn" aria-hidden="true"><use href="#i-dot"/></svg>' : '<svg class="ic ic-info" aria-hidden="true"><use href="#i-dot"/></svg>'} <b>${esc(n.title)}</b> — ${esc(n.message)}</span>
      <button class="btn small" onclick="bellRead('${esc(n.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg></button>
    </div>`).join('') || '<div class="desc" style="padding:8px">Aucune alerte non lue.</div>';
}
async function bellTick() {
  if (BELL.busy || !state.accessToken || !state.user || state.user.role === 'CHAUFFEUR' || !navigator.onLine) return;
  BELL.busy = true;
  try {
    const list = await api('/notifications?unreadOnly=true');
    const ids = new Set(list.map(n => n.id));
    const fresh = BELL.ids ? list.filter(n => !BELL.ids.has(n.id)) : [];
    BELL.ids = ids; BELL.list = list; bellRender();
    if (fresh.length) {
      bellBeep();
      const f = fresh[0];
      bellToast('' + f.title + (fresh.length > 1 ? ' (+' + (fresh.length - 1) + ')' : ''));
    }
  } catch (e) { /* silencieux */ }
  BELL.busy = false;
}
function bellToggle() {
  const p = document.getElementById('bell-panel'); if (!p) return;
  p.style.display = p.style.display === 'block' ? 'none' : 'block';
  if (p.style.display === 'block') bellTick();
}
async function bellRead(id) {
  try { await api('/notifications/' + id + '/read', { method: 'PATCH' }); } catch (e) {}
  BELL.list = BELL.list.filter(n => n.id !== id); bellRender();
  if (typeof loadAlerts === 'function') loadAlerts();
}
document.addEventListener('click', (e) => {
  const w = document.getElementById('bell-wrap'), p = document.getElementById('bell-panel');
  if (p && w && !w.contains(e.target)) p.style.display = 'none';
});
BELL.timer = setInterval(bellTick, 20000);
setTimeout(bellTick, 4000);
function root() { return document.getElementById('view-root'); }
function fmt(n) { return Number(n || 0).toLocaleString('fr-FR'); }
// Échappe toute donnée texte avant insertion dans le HTML (protection XSS)
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------------- TABLEAUX DE BORD PAR DÉPARTEMENT ---------------- */
const DEPT_PERIOD = { value: 'month' };
const WL_TITLES = {
  expectedDeliveries: 'Livraisons attendues', ordersToApprove: 'Commandes à valider', itemsToReorder: 'Articles à réapprovisionner',
  transfersToReceive: 'Transferts à réceptionner', supplierInvoicesDueSoon: 'Factures fournisseurs à échéance',
  stockouts: 'Ruptures et sous-seuil', expiringLots: 'Lots périmés / bientôt périmés', dormantItems: 'Stock dormant', openInventories: 'Inventaires ouverts',
  overdueReceivables: 'Impayés clients', dueToday: 'Échéances du jour', pendingQuotes: 'Devis en attente', mobileMoneyToReconcile: 'Mobile Money à rapprocher', latestSales: 'Dernières ventes',
  documentsToRenew: 'Documents à renouveler', maintenanceDue: 'Entretiens dus', consumptionAnomalies: 'Surconsommations', tripsInProgress: 'Missions en cours', openDowntimes: 'Immobilisations en cours',
  openIncidents: 'Incidents ouverts', overdueActions: 'Actions correctives en retard', upcomingTalks: 'Causeries à venir', trainingsDue: 'Formations à renouveler',
};
const CH_TITLES = {
  purchasesTrend: 'Achats', receiptsTrend: 'Réceptions', spendBySupplier: 'Dépenses par fournisseur', leadTimeBySupplier: 'Délai moyen par fournisseur (jours)', supplierDebtAging: 'Dettes fournisseurs par ancienneté',
  movementsTrend: 'Mouvements de stock', valueByCategory: 'Valeur par catégorie', abcAnalysis: 'Analyse ABC', lossesByReason: 'Pertes par motif',
  revenueTrend: "Chiffre d'affaires", paymentsByMethod: 'Encaissements par canal', salesByType: 'Ventes par type', receivablesAging: 'Créances par ancienneté', topCustomers: 'Meilleurs clients', topProducts: 'Meilleurs produits',
  fuelTrend: 'Carburant', distanceTrend: 'Kilométrage', costBreakdown: 'Répartition des coûts', consumptionByVehicle: 'Consommation par véhicule (L/100 km)', vehiclesByStatus: 'Véhicules par statut', downtimeByCategory: "Immobilisations par cause",
  incidentsTrend: 'Incidents', incidentsByType: 'Incidents par type', incidentsBySeverity: 'Incidents par gravité', incidentsByRisk: 'Incidents par risque', actionsByStatus: 'Actions correctives',
};
const COL_FR = {
  reference: 'Référence', supplier: 'Fournisseur', expectedDate: 'Date prévue', lateDays: 'Retard (j)', status: 'Statut', remainingQuantity: 'Reste',
  orderDate: 'Date', amount: 'Montant', name: 'Article', unit: 'Unité', quantity: 'Quantité', threshold: 'Seuil', from: 'De', to: 'Vers', shippedAt: 'Expédié', late: 'En retard', lines: 'Lignes',
  dueDate: 'Échéance', item: 'Article', lotNumber: 'Lot', expiryDate: 'Péremption', daysLeft: 'Jours', expired: 'Périmé', value: 'Valeur', startedAt: 'Début', location: 'Emplacement', daysOpen: 'Jours ouverts',
  date: 'Date', customer: 'Client', total: 'Total', invoice: 'Facture', method: 'Mode', label: 'Type', subject: 'Concerné', vehicle: 'Véhicule', type: 'Type', nextDate: 'Prochaine date', kmLeft: 'Km restants', overdue: 'En retard',
  km: 'Km', liters: 'Litres', actual: 'Réel', reference_: 'Réf.', driver: 'Chauffeur', destination: 'Destination', category: 'Cause', reason: 'Motif', since: 'Depuis', days: 'Jours',
  severity: 'Gravité', description: 'Description', title: 'Intitulé', daysLate: 'Retard (j)', theme: 'Thème', plannedAt: 'Prévue le', person: 'Personne', expiresAt: 'Expire le', balance: 'Solde', installment: 'Échéance',
};
const DEPT_REFRESH = { timer: null };

function fmtCell(k, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? '<span class="badge bad">Oui</span>' : 'Non';
  if (/(date|At|Date|since)$/.test(k) && typeof v === 'string' && /^\d{4}-\d\d-\d\d/.test(v)) return new Date(v).toLocaleDateString('fr-FR');
  if (typeof v === 'number') return fmt(v);
  return esc(v);
}

function deptKpiCard(k) {
  const cls = k.status === 'critical' ? 'bad' : k.status === 'warning' ? 'warn' : 'ok';
  const val = k.value === null || k.value === undefined ? '—' : fmt(k.value);
  let v = '';
  if (k.variationPercent !== null && k.variationPercent !== undefined) {
    const up = k.variationPercent > 0;
    const good = k.favorable === 'neutral' ? null : (k.favorable === 'up') === up;
    const color = good === null ? 'var(--muted)' : good ? 'var(--success)' : 'var(--danger)';
    v = `<span style="color:${color}; font-weight:600;">${up ? '▲' : '▼'} ${Math.abs(k.variationPercent)} %</span> vs période préc.`;
  }
  const border = k.status === 'critical' ? 'var(--danger)' : k.status === 'warning' ? 'var(--gold)' : 'var(--line)';
  return `<div class="kpi-card" style="border-color:${border}"><div class="kpi-label">${esc(k.label)}</div>
    <div class="kpi-value mono">${val} <span style="font-size:12px; color:var(--muted); font-family:Inter,sans-serif;">${esc(k.unit || '')}</span></div>
    <div class="kpi-sub">${v || '&nbsp;'}</div></div>`;
}

function deptChart(title, rows) {
  if (!rows || !rows.length) return '';
  const keys = Object.keys(rows[0]);
  const labelKey = ['period', 'name', 'label', 'category', 'key', 'type', 'status', 'bucket', 'vehicle', 'reason', 'class'].find((k) => keys.includes(k)) || keys[0];
  const numKeys = keys.filter((k) => typeof rows[0][k] === 'number' && !/percent|Percent|id$|Id$/.test(k));
  const nk = ['amount', 'ttc', 'value', 'cost', 'km', 'liters', 'count', 'incidents', 'receipts', 'inValue', 'averageDays', 'actual'].find((k) => numKeys.includes(k)) || numKeys[0];
  if (!nk) return '';
  const max = Math.max(1, ...rows.map((r) => Number(r[nk]) || 0));
  const isTime = labelKey === 'period';
  const body = isTime
    ? `<div style="display:flex; align-items:flex-end; gap:3px; height:110px; margin-top:8px;">${rows.map((r) => `<div title="${esc(r[labelKey])} : ${fmt(r[nk])}" style="flex:1; min-width:3px; background:var(--navy); border-radius:3px 3px 0 0; height:${Math.max(2, ((Number(r[nk]) || 0) / max) * 100)}%;"></div>`).join('')}</div>
       <div class="desc" style="display:flex; justify-content:space-between;"><span>${esc(rows[0][labelKey])}</span><span>${esc(rows[rows.length - 1][labelKey])}</span></div>`
    : rows.slice(0, 12).map((r) => `<div style="margin-top:7px;"><div style="display:flex; justify-content:space-between; font-size:12px;"><span>${esc(r[labelKey])}</span><b class="mono">${fmt(r[nk])}</b></div>
        <div style="background:var(--line); border-radius:4px; height:7px;"><div style="background:var(--gold); height:7px; border-radius:4px; width:${((Number(r[nk]) || 0) / max) * 100}%;"></div></div></div>`).join('');
  return `<div class="panel"><h3 style="margin-top:0;">${esc(title)}</h3>${body}</div>`;
}

function deptWorklist(title, rows) {
  if (!rows || !rows.length) return `<div class="panel"><h3 style="margin-top:0;">${esc(title)}</h3><div class="desc">Rien à traiter.</div></div>`;
  const cols = Object.keys(rows[0]).filter((k) => !/Id$|^id$/.test(k));
  return `<div class="panel" style="overflow-x:auto;"><h3 style="margin-top:0;">${esc(title)} <span class="badge info">${rows.length}</span></h3>
    <table><thead><tr>${cols.map((c) => `<th>${esc(COL_FR[c] || c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${fmtCell(c, r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const DEPT_KIND = { value: 'ALL' };
async function renderDeptDashboard(key) {
  const q = new URLSearchParams({ period: DEPT_PERIOD.value });
  if (key === 'fleet' && DEPT_KIND.value !== 'ALL') q.set('kind', DEPT_KIND.value);
  if (state.siteId) q.set('siteId', state.siteId);
  const d = await api('/dashboards/' + key + '?' + q.toString());
  const periods = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']];
  const kindBar = key === 'fleet' ? `<div style="margin-bottom:10px">${[['ALL', 'Tous'], ['TRUCK', '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Camions'], ['SERVICE_VEHICLE', '<svg class="ic" aria-hidden="true"><use href="#i-car"/></svg> Véhicules de service']].map(([k, t]) => `<button class="btn ${DEPT_KIND.value === k ? 'gold' : ''}" style="margin-right:6px" onclick="DEPT_KIND.value='${k}'; renderView(state.view)">${t}</button>`).join('')}</div>` : '';
  const bar = kindBar + `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:16px;">
    ${periods.map(([v, l]) => `<button class="btn small ${DEPT_PERIOD.value === v ? 'gold' : ''}" onclick="DEPT_PERIOD.value='${v}'; renderView(state.view)">${l}</button>`).join('')}
    <span class="desc" style="margin-left:auto;">${d.access.scope === 'session' ? 'Vue « ma session de caisse » · ' : ''}Période : ${new Date(d.period.from).toLocaleDateString('fr-FR')} → ${new Date(d.period.to).toLocaleDateString('fr-FR')}</span></div>`;
  const kpis = `<div class="kpi-grid">${(d.kpis || []).map(deptKpiCard).join('')}</div>`;
  const allowed = (d.actions || []).filter((a) => a.allowed && a.available !== false);
  const actions = allowed.length ? `<div class="panel"><h3 style="margin-top:0;">Actions rapides</h3><div class="pill-row">${allowed.map((a) => `<button class="btn small ${ACTION_FORMS[a.key] ? '' : 'gold'}" style="${ACTION_FORMS[a.key] ? '' : 'opacity:.75;'}" title="${esc(a.label)}" onclick="runAction('${esc(a.key)}')">${esc(key === 'hse' && HSE_SHORT[a.key] ? HSE_SHORT[a.key] : a.label)}</button>`).join('')}</div></div>` : '';
  const wl = Object.entries(d.worklists || {}).map(([k, rows]) => deptWorklist(WL_TITLES[k] || k, rows)).join('');
  const ch = `<div class="grid-2">${Object.entries(d.charts || {}).map(([k, rows]) => deptChart(CH_TITLES[k] || k, rows)).join('')}</div>`;
  root().innerHTML = bar + kpis + actions + ch + wl;
}

/* ---------------- FORMULAIRES DES ACTIONS RAPIDES ---------------- */
const today10 = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const optList = (rows, v, l) => rows.map((r) => [String(v(r)), String(l(r))]);
const needOpt = (opts, what) => { if (!opts.length) throw new Error(`Aucun(e) ${what} disponible : créez-en d'abord.`); return opts; };

const HSE_SHORT = { declare_incident: 'Incidents', corrective_action: 'Actions correctives', toolbox_talk: 'Causeries', inspection: 'Inspections', ppe: 'EPI', training: 'Formations / Habilitations', worked_hours: 'Heures travaillées' };
// Personnes suivies nominativement (chauffeurs et agents) pour les EPI et les formations
async function hsePeople() {
  const [dr, us] = await Promise.all([api('/drivers?siteId=' + state.siteId).catch(() => []), api('/users').catch(() => [])]);
  const out = [];
  (Array.isArray(dr) ? dr : []).forEach((x) => out.push(['D:' + x.id, `${x.firstName} ${x.lastName} (chauffeur)`]));
  (Array.isArray(us) ? us : []).filter((x) => x.role !== 'CHAUFFEUR').forEach((x) => out.push(['U:' + x.id, `${x.firstName} ${x.lastName}`]));
  return needOpt(out, 'agent ou chauffeur');
}
const hsePerson = (v) => (v && v.startsWith('D:') ? { driverId: v.slice(2) } : v && v.startsWith('U:') ? { userId: v.slice(2) } : {});
const plusMonths = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
const ACTION_FORMS = {
  async ppe() {
    const people = await hsePeople();
    openEditor('Remettre un EPI', [
      { key: 'person', label: 'Agent / chauffeur', options: people },
      { key: 'ppeType', label: "Type d'EPI", options: [['CASQUE', 'Casque'], ['GILET', 'Gilet haute visibilité'], ['CHAUSSURES', 'Chaussures de sécurité'], ['GANTS', 'Gants'], ['LUNETTES', 'Lunettes de protection'], ['BOUCHONS', "Bouchons d'oreilles"], ['MASQUE', 'Masque anti-poussière'], ['HARNAIS', 'Harnais'], ['AUTRE', 'Autre']] },
      { key: 'issuedAt', label: 'Date de remise', type: 'date', value: today10() },
      { key: 'renewalDue', label: 'À renouveler le', type: 'date', value: plusMonths(12) },
      { key: 'compliant', label: 'État', options: [['true', 'Conforme'], ['false', 'À remplacer']] },
    ], async (d) => {
      await api('/hse/ppe', { method: 'POST', body: { siteId: state.siteId, ppeType: d.ppeType, issuedAt: new Date(d.issuedAt).toISOString(), ...(d.renewalDue ? { renewalDue: new Date(d.renewalDue).toISOString() } : {}), compliant: d.compliant !== 'false', ...hsePerson(d.person) } });
      refreshDept();
    });
  },
  async training() {
    const people = await hsePeople();
    openEditor('Enregistrer une formation / habilitation', [
      { key: 'person', label: 'Agent / chauffeur', options: people },
      { key: 'kind', label: 'Formation / habilitation', options: [['Secourisme (SST)', 'Secourisme (SST)'], ['Conduite défensive', 'Conduite défensive'], ['Habilitation électrique', 'Habilitation électrique'], ['Travail en hauteur', 'Travail en hauteur'], ['Lutte contre l\'incendie', "Lutte contre l'incendie"], ['Matières dangereuses (ADR)', 'Matières dangereuses (ADR)'], ['Manutention / engins', 'Manutention / engins'], ['Accueil sécurité', 'Accueil sécurité'], ['', 'Autre (précisez ci-dessous)']] },
      { key: 'other', label: 'Intitulé si « Autre »' },
      { key: 'obtainedAt', label: "Date d'obtention", type: 'date', value: today10() },
      { key: 'expiresAt', label: "Date d'expiration (si elle existe)", type: 'date' },
    ], async (d) => {
      const title = (d.kind || d.other || '').trim();
      if (!title) throw new Error("Choisissez ou précisez l'intitulé de la formation.");
      await api('/hse/trainings', { method: 'POST', body: { title, obtainedAt: new Date(d.obtainedAt).toISOString(), ...(d.expiresAt ? { expiresAt: new Date(d.expiresAt).toISOString() } : {}), ...hsePerson(d.person) } });
      refreshDept();
    });
  },
  async new_order() {
    const [sup, items] = await Promise.all([api('/suppliers'), api('/inventory/items?siteId=' + state.siteId)]);
    openEditor('Nouveau bon de commande', [
      { key: 'supplierId', label: 'Fournisseur', options: needOpt(optList(sup, (x) => x.id, (x) => x.name), 'fournisseur') },
      { key: 'itemId', label: 'Article', options: needOpt(optList(items, (x) => x.id, (x) => x.name), 'article') },
      { key: 'quantityOrdered', label: 'Quantité', type: 'number' },
      { key: 'unitPrice', label: 'Prix unitaire (GNF)', type: 'number' },
      { key: 'expectedDate', label: 'Livraison prévue', type: 'date' },
    ], async (d) => {
      await api('/purchases/orders', { method: 'POST', body: { siteId: state.siteId, supplierId: d.supplierId, orderDate: nowIso(), expectedDate: d.expectedDate ? new Date(d.expectedDate).toISOString() : undefined, lines: [{ itemId: d.itemId, quantityOrdered: d.quantityOrdered, unitPrice: d.unitPrice }] } });
      refreshDept();
    });
  },
  async approve_order() {
    const o = (await api('/purchases/orders?siteId=' + state.siteId + '&status=DRAFT'));
    openEditor('Valider un bon de commande', [{ key: 'id', label: 'Bon de commande (brouillon)', options: needOpt(optList(o, (x) => x.id, (x) => x.reference), 'brouillon') }],
      async (d) => { await api('/purchases/orders/' + d.id + '/confirm', { method: 'POST' }); refreshDept(); });
  },
  async receive() {
    const all = await api('/purchases/orders?siteId=' + state.siteId);
    const o = all.filter((x) => ['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(x.status));
    openEditor('Réceptionner une livraison (reçoit tout le reste à livrer)', [
      { key: 'id', label: 'Bon de commande', options: needOpt(optList(o, (x) => x.id, (x) => x.reference), 'commande à réceptionner') },
      { key: 'deliveryNoteNo', label: 'N° bon de livraison' },
      { key: 'freightCost', label: 'Frais de transport (GNF)', type: 'number' },
    ], async (d) => {
      const order = await api('/purchases/orders/' + d.id);
      const lines = order.lines.map((l) => ({ lineId: l.id, quantityReceived: Number(l.quantityOrdered) - Number(l.quantityReceived) })).filter((l) => l.quantityReceived > 0);
      if (!lines.length) throw new Error('Rien à réceptionner sur cette commande.');
      await api('/purchases/orders/' + d.id + '/receive', { method: 'POST', body: { lines, deliveryNoteNo: d.deliveryNoteNo, freightCost: d.freightCost } });
      refreshDept();
    });
  },
  async transfer() {
    const [sites, items] = await Promise.all([api('/sites'), api('/inventory/items?siteId=' + state.siteId)]);
    openEditor('Transfert vers un autre site', [
      { key: 'toSiteId', label: 'Site de destination', options: needOpt(optList(sites.filter((x) => x.id !== state.siteId), (x) => x.id, (x) => x.name), 'autre site') },
      { key: 'itemId', label: 'Article', options: needOpt(optList(items, (x) => x.id, (x) => `${x.name} (${x.currentQuantity})`), 'article') },
      { key: 'quantity', label: 'Quantité', type: 'number' },
    ], async (d) => { await api('/transfers', { method: 'POST', body: { fromSiteId: state.siteId, toSiteId: d.toSiteId, lines: [{ itemId: d.itemId, quantity: d.quantity }] } }); refreshDept(); });
  },
  async receive_transfer() {
    const t = await api('/transfers?status=IN_TRANSIT&siteId=' + state.siteId);
    openEditor('Réceptionner un transfert', [{ key: 'id', label: 'Transfert en transit', options: needOpt(optList(t.filter((x) => x.toSiteId === state.siteId), (x) => x.id, (x) => `${x.reference} (de ${x.fromSite?.name || '?'})`), 'transfert à réceptionner') }],
      async (d) => { await api('/transfers/' + d.id + '/receive', { method: 'POST', body: {} }); refreshDept(); });
  },
  async new_sale() {
    const [cust, items] = await Promise.all([api('/customers'), api('/inventory/items?siteId=' + state.siteId)]);
    openEditor('Nouvelle vente (commande → livraison → facture → encaissement)', [
      { key: 'customerId', label: 'Client', options: needOpt(optList(cust, (x) => x.id, (x) => x.name), 'client') },
      { key: 'itemId', label: 'Article', options: needOpt(optList(items, (x) => x.id, (x) => `${x.name} (${x.currentQuantity} en stock)`), 'article') },
      { key: 'quantity', label: 'Quantité', type: 'number' },
      { key: 'unitPrice', label: 'Prix unitaire (GNF)', type: 'number' },
      { key: 'discountPercent', label: 'Remise (%)', type: 'number' },
      { key: 'saleType', label: 'Type de vente', options: [['CASH', 'Comptant'], ['CREDIT', 'À crédit'], ['INSTALLMENT', 'Échelonnée (mensualités)']] },
      { key: 'creditDays', label: 'Crédit : délai de paiement (jours, défaut 30)', type: 'number' },
      { key: 'installments', label: 'Échelonnée : nombre de mensualités (défaut 3)', type: 'number' },
      { key: 'deposit', label: 'Acompte / montant encaissé maintenant (GNF) — comptant : laisser vide = tout', type: 'number' },
      { key: 'method', label: "Mode d'encaissement", options: [['CASH', 'Espèces'], ['ORANGE_MONEY', 'Orange Money'], ['MOBILE_MONEY', 'Mobile Money'], ['BANK_TRANSFER', 'Virement']] },
      { key: 'externalRef', label: 'N° de transaction (mobile money / virement)' },
    ], async (d) => {
      const type = d.saleType || 'CASH';
      const order = await api('/sales/orders', { method: 'POST', body: { siteId: state.siteId, customerId: d.customerId, orderDate: nowIso(), status: 'CONFIRMED', saleType: type, discountPercent: d.discountPercent || 0, lines: [{ itemId: d.itemId, quantityOrdered: d.quantity, unitPrice: d.unitPrice }] } });
      const full = order.lines ? order : await api('/sales/orders/' + order.id);
      await api('/sales/orders/' + order.id + '/deliver', { method: 'POST', body: { lines: full.lines.map((l) => ({ lineId: l.id, quantityDelivered: Number(l.quantityOrdered) })) } });
      const invBody = { paymentTerm: type === 'CASH' ? 'CASH' : 'CREDIT' };
      const DAY = 86400000;
      if (type === 'CREDIT') invBody.dueDate = new Date(Date.now() + (d.creditDays || 30) * DAY).toISOString();
      if (type === 'INSTALLMENT') {
        const subtotal = full.lines.reduce((a, l) => a + Number(l.lineTotal), 0);
        const disc = Number((subtotal * (Number(full.discountPercent || 0) / 100)).toFixed(2));
        const tax = Number(((subtotal - disc) * (Number(full.taxPercent || 0) / 100)).toFixed(2));
        const total = Number((subtotal - disc + tax).toFixed(2));
        const n = Math.max(2, Math.min(24, Math.round(d.installments || 3)));
        const each = Math.floor(total / n);
        invBody.installments = Array.from({ length: n }, (_, i) => ({
          dueDate: new Date(Date.now() + (i + 1) * 30 * DAY).toISOString(),
          amount: i === n - 1 ? Number((total - each * (n - 1)).toFixed(2)) : each,
        }));
        invBody.dueDate = invBody.installments[n - 1].dueDate;
      }
      const inv = await api('/sales/orders/' + order.id + '/invoice', { method: 'POST', body: invBody });
      const pay = type === 'CASH' ? (d.deposit || Number(inv.totalAmount)) : (d.deposit || 0);
      if (pay > 0) await api('/payments', { method: 'POST', body: { direction: 'IN', method: d.method, amount: Math.min(pay, Number(inv.totalAmount)), paymentDate: nowIso(), salesInvoiceId: inv.id, externalRef: d.externalRef, clientOpId: 'web-' + Date.now() } });
      alert(`Vente enregistrée : facture ${inv.reference || ''} — total ${fmt(inv.totalAmount)} GNF, encaissé ${fmt(Math.min(pay, Number(inv.totalAmount)))} GNF.`);
      refreshDept();
    });
  },
  async record_payment() {
    const [a, b] = await Promise.all([api('/sales/invoices?siteId=' + state.siteId + '&status=UNPAID'), api('/sales/invoices?siteId=' + state.siteId + '&status=PARTIALLY_PAID')]);
    const inv = [...a, ...b].filter((x) => Number(x.totalAmount) - Number(x.amountPaid) > 0);
    const bal = (x) => Number(x.totalAmount) - Number(x.amountPaid);
    openEditor('Enregistrer un règlement client', [
      { key: 'id', label: 'Facture impayée', options: needOpt(optList(inv, (x) => x.id, (x) => `${x.reference} — ${x.customer?.name || ''} — reste ${fmt(bal(x))} GNF`), 'facture impayée') },
      { key: 'amount', label: 'Montant reçu (GNF) — vide = solde complet', type: 'number' },
      { key: 'method', label: 'Mode de paiement', options: [['CASH', 'Espèces'], ['ORANGE_MONEY', 'Orange Money'], ['MOBILE_MONEY', 'Mobile Money'], ['BANK_TRANSFER', 'Virement'], ['CHEQUE', 'Chèque']] },
      { key: 'externalRef', label: 'N° de transaction' },
    ], async (d) => {
      const x = inv.find((i) => i.id === d.id);
      const amount = Math.min(d.amount || bal(x), bal(x));
      await api('/payments', { method: 'POST', body: { direction: 'IN', method: d.method, amount, paymentDate: nowIso(), salesInvoiceId: d.id, externalRef: d.externalRef, clientOpId: 'web-' + Date.now() } });
      refreshDept();
    });
  },
  async stock_in() { return stockMove('in'); },
  async stock_out() { return stockMove('out'); },
  async fuel() {
    const [v, dr] = await Promise.all([api('/vehicles?siteId=' + state.siteId), api('/drivers?siteId=' + state.siteId)]);
    openEditor('Saisir un plein de carburant', [
      { key: 'vehicleId', label: 'Véhicule', options: needOpt(optList(v, (x) => x.id, (x) => x.internalNumber), 'véhicule') },
      { key: 'driverId', label: 'Chauffeur', options: [['', '—'], ...optList(dr, (x) => x.id, (x) => `${x.firstName} ${x.lastName}`)] },
      { key: 'quantityLiters', label: 'Litres', type: 'number' },
      { key: 'mileage', label: 'Kilométrage', type: 'number' },
      { key: 'source', label: 'Source', options: [['STATION', 'Station'], ['TANK', 'Cuve du site']] },
    ], async (d) => { await api('/fuel', { method: 'POST', body: { ...d, siteId: state.siteId, transactionDate: nowIso() } }); refreshDept(); });
  },
  async assign_mission() {
    const [v, dr, custs] = await Promise.all([api('/vehicles?siteId=' + state.siteId), api('/drivers?siteId=' + state.siteId), api('/customers')]);
    openEditor('Affecter une mission', [
      { key: 'customerId', label: 'Client (pour la facturation)', options: [['', '— À préciser plus tard —'], ...custs.map((c) => [c.id, c.name])] },
      { key: 'vehicleId', label: 'Véhicule', options: needOpt(optList(v, (x) => x.id, (x) => `${x.internalNumber} (${x.currentMileage} km)`), 'véhicule') },
      { key: 'driverId', label: 'Chauffeur', options: needOpt(optList(dr, (x) => x.id, (x) => `${x.firstName} ${x.lastName}`), 'chauffeur') },
      { key: 'startMileage', label: 'Kilométrage de départ', type: 'number' },
      { key: 'destination', label: 'Destination' },
      { key: 'purpose', label: 'Objet' },
    ], async (d) => { await api('/trips', { method: 'POST', body: { ...d, customerId: d.customerId || undefined, siteId: state.siteId, tripDate: nowIso(), startTime: nowIso() } }); refreshDept(); });
  },
  async close_mission() {
    const t = (await api('/trips?siteId=' + state.siteId)).filter((x) => x.status === 'IN_PROGRESS' || (!x.endTime && !x.endMileage));
    openEditor('Retour de mission', [
      { key: 'id', label: 'Mission en cours', options: needOpt(optList(t, (x) => x.id, (x) => `${x.destination || 'Mission'} — ${x.vehicle?.internalNumber || String(x.id).slice(0, 6)}`), 'mission en cours') },
      { key: 'endMileage', label: "Kilométrage d'arrivée", type: 'number' },
      { key: 'endCondition', label: 'État du véhicule', options: [['RAS', 'RAS'], ['DOMMAGE_MINEUR', 'Dommage mineur'], ['DOMMAGE_MAJEUR', 'Dommage majeur'], ['PANNE', 'Panne']] },
    ], async (d) => { await api('/trips/' + d.id + '/close', { method: 'PATCH', body: { endTime: nowIso(), endMileage: d.endMileage, endCondition: d.endCondition } }); refreshDept(); });
  },
  async declare_incident() {
    openEditor('Déclarer un incident / presque-accident', [
      { key: 'type', label: 'Type', options: [['NEAR_MISS', 'Presque-accident'], ['ACCIDENT', 'Accident'], ['DAMAGE', 'Dégât matériel'], ['ENVIRONMENT', 'Environnement'], ['FIRE', 'Incendie'], ['OTHER', 'Autre']] },
      { key: 'severity', label: 'Gravité', options: [['LOW', 'Faible'], ['MEDIUM', 'Moyenne'], ['HIGH', 'Élevée'], ['CRITICAL', 'Critique']] },
      { key: 'description', label: 'Description' },
      { key: 'zone', label: 'Zone / lieu' },
      { key: 'lostDays', label: "Jours d'arrêt (si accident avec arrêt)", type: 'number' },
      { key: 'immediateAction', label: 'Action immédiate' },
    ], async (d) => { await api('/hse/incidents', { method: 'POST', body: { ...d, siteId: state.siteId, occurredAt: nowIso(), clientOpId: 'web-' + Date.now() } }); refreshDept(); });
  },
  async corrective_action() {
    openEditor('Action corrective', [
      { key: 'title', label: 'Action à mener' },
      { key: 'dueDate', label: 'Échéance', type: 'date', value: today10() },
    ], async (d) => { await api('/hse/actions', { method: 'POST', body: { siteId: state.siteId, title: d.title, dueDate: new Date(d.dueDate).toISOString() } }); refreshDept(); });
  },
  async toolbox_talk() {
    openEditor('Planifier une causerie sécurité', [
      { key: 'theme', label: 'Thème' },
      { key: 'plannedAt', label: 'Date prévue', type: 'date', value: today10() },
    ], async (d) => { await api('/hse/talks', { method: 'POST', body: { siteId: state.siteId, theme: d.theme, plannedAt: new Date(d.plannedAt).toISOString() } }); refreshDept(); });
  },
  async inspection() {
    openEditor('Inspection HSE', [
      { key: 'type', label: 'Type', options: [['WAREHOUSE', 'Entrepôt'], ['VEHICLE', 'Véhicule'], ['FIRE_EXTINGUISHER', 'Extincteurs'], ['ZONE', 'Zone']] },
      { key: 'compliant', label: 'Résultat', options: [['true', 'Conforme'], ['false', 'Non conforme']] },
      { key: 'notes', label: 'Observations' },
    ], async (d) => { await api('/hse/inspections', { method: 'POST', body: { siteId: state.siteId, type: d.type, compliant: d.compliant === 'true', notes: d.notes } }); refreshDept(); });
  },
  async worked_hours() {
    openEditor('Heures travaillées du mois', [
      { key: 'period', label: 'Mois (1er jour)', type: 'date', value: today10().slice(0, 8) + '01' },
      { key: 'hours', label: 'Heures travaillées (tous agents)', type: 'number' },
    ], async (d) => { await api('/hse/worked-hours', { method: 'PUT', body: { siteId: state.siteId, period: new Date(d.period).toISOString(), hours: d.hours } }); refreshDept(); });
  },
  async cash_session() {
    const cur = await api('/cash-sessions/current').catch(() => null);
    if (cur && cur.id) {
      openEditor('Clôturer la caisse', [{ key: 'countedCash', label: 'Espèces comptées (GNF)', type: 'number' }, { key: 'note', label: 'Note' }],
        async (d) => { await api('/cash-sessions/' + cur.id + '/close', { method: 'POST', body: d }); refreshDept(); });
    } else {
      openEditor('Ouvrir la caisse', [{ key: 'openingFloat', label: 'Fonds de caisse initial (GNF)', type: 'number' }],
        async (d) => { await api('/cash-sessions/open', { method: 'POST', body: { siteId: state.siteId, openingFloat: d.openingFloat || 0 } }); refreshDept(); });
    }
  },
  async cash_expense() {
    const cur = await api('/cash-sessions/current').catch(() => null);
    if (!cur || !cur.id) throw new Error("Ouvrez d'abord la caisse.");
    openEditor('Décaissement de caisse', [{ key: 'amount', label: 'Montant (GNF)', type: 'number' }, { key: 'reason', label: 'Motif' }],
      async (d) => { await api('/cash-sessions/' + cur.id + '/expenses', { method: 'POST', body: d }); refreshDept(); });
  },
};

