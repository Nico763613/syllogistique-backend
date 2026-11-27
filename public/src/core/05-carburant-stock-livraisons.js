async function createFuel() {
  const msg = document.getElementById('f-msg');
  try {
    await api('/fuel', { method: 'POST', body: {
      siteId: state.siteId,
      vehicleId: document.getElementById('f-vehicle').value,
      transactionDate: document.getElementById('f-date').value,
      mileage: Number(document.getElementById('f-mileage').value),
      quantityLiters: Number(document.getElementById('f-liters').value),
      station: document.getElementById('f-station').value,
    }});
    msg.innerHTML = '<div class="msg ok">Ravitaillement enregistré — coût calculé automatiquement.</div>';
    renderFuel();
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

async function saveFuelPrice() {
  const msg = document.getElementById('fp-msg');
  try {
    await api('/settings/FUEL_PRICE_PER_LITER', { method: 'PUT', body: {
      value: String(Number(document.getElementById('fp-price').value)),
      reason: document.getElementById('fp-reason').value,
    }});
    renderFuel();
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ---------------- MAINTENANCE ---------------- */
let maintKind = 'ALL', maintVeh = '';
function setMaintKind(k) { maintKind = k; maintVeh = ''; renderMaintenance(); }
function setMaintVeh(id) { maintVeh = id; renderMaintenance(); }
async function renderMaintenance() {
  const [list, alerts, vehicles] = await Promise.all([
    api('/maintenance'),
    api('/maintenance/alerts?siteId=' + state.siteId),
    api('/vehicles?siteId=' + state.siteId),
  ]);
  const alertRows = alerts.map(a => `<div class="msg ${a.level === 'OVERDUE' ? 'err' : 'ok'}" style="margin-bottom:6px;">${a.level === 'OVERDUE' ? '<svg class="ic ic-bad" aria-hidden="true"><use href="#i-dot"/></svg>' : '<svg class="ic ic-warn" aria-hidden="true"><use href="#i-dot"/></svg>'} ${esc(a.internalNumber)} — entretien ${a.level === 'OVERDUE' ? 'en retard' : 'bientôt dû'}</div>`).join('') || '<div class="desc">Aucune alerte de maintenance.</div>';
  const inKind = (t) => maintKind === 'ALL' || t === maintKind;
  const vehs = vehicles.filter((v) => inKind(v.vehicleType));
  const alertOf = {}; alerts.forEach((a) => { alertOf[a.internalNumber] = a.level; });
  const perVeh = vehs.map((v) => {
    const mine = list.filter((m) => m.vehicle.internalNumber === v.internalNumber);
    const last = mine[0];
    return `<tr><td><a href="#" onclick="setMaintVeh('${esc(v.id)}');return false;"><b>${esc(v.internalNumber)}</b></a> <span style="font-size:12px;color:var(--muted)">${esc(v.registrationNumber)}</span></td><td class="mono">${mine.length}</td><td class="mono">${fmt(mine.reduce((s, m) => s + Number(m.cost || 0), 0))}</td><td>${last ? new Date(last.maintenanceDate).toLocaleDateString('fr-FR') + ' · ' + esc(last.maintenanceType.label) : '—'}</td><td>${alertOf[v.internalNumber] === 'OVERDUE' ? '<span class="badge bad">En retard</span>' : alertOf[v.internalNumber] ? '<span class="badge warn">Bientôt dû</span>' : '<span class="badge ok">À jour</span>'}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">Aucun véhicule.</td></tr>';
  const shown = list.filter((m) => inKind(m.vehicle.vehicleType) && (!maintVeh || (vehicles.find((v) => v.id === maintVeh) || {}).internalNumber === m.vehicle.internalNumber));
  const rows = shown.map(m => `<tr><td>${new Date(m.maintenanceDate).toLocaleDateString('fr-FR')}</td><td>${esc(m.vehicle.internalNumber)}</td><td>${esc(m.maintenanceType.label)}</td><td class="mono">${fmt(m.cost)} GNF</td></tr>`).join('') || `<tr><td colspan="4" class="empty">Aucun entretien enregistré.</td></tr>`;
  const options = vehicles.map(v => `<option value="${esc(v.id)}">${esc(v.internalNumber)}</option>`).join('');
  const types = ['VIDANGE','REVISION','PNEUS','FREINS','BATTERIE','HUILE','FILTRE','SUSPENSION','REPARATION','AUTRE'];
  const typeOptions = types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');

  root().innerHTML = `
    <div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> Alertes d'échéance</h3>${alertRows}</div>
    <div class="panel" id="mp-panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg> Plans d'entretien préventif</h3>
      <div class="desc">Fixez pour chaque véhicule un seuil (vidange tous les X km, révision tous les Y jours…). L'application calcule l'échéance, prévient la logistique avant la date, puis l'atelier une fois l'entretien planifié.</div>
      <div id="mp-body"><div class="empty">Chargement…</div></div></div>
    <div class="panel" id="mr-panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg> Coûts de maintenance &amp; prochaines échéances</h3>
      <div class="desc">Calculé automatiquement à partir des interventions enregistrées. Coût = montant saisi, sinon pièces + main-d'œuvre.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0"><select id="mr-kind" onchange="mrLoad()" style="max-width:220px"><option value="TRUCK"${window._mrKind === 'SERVICE_VEHICLE' ? '' : ' selected'}>Camions</option><option value="SERVICE_VEHICLE"${window._mrKind === 'SERVICE_VEHICLE' ? ' selected' : ''}>Véhicules de service</option></select><select id="mr-per" onchange="mrLoad()" style="max-width:200px"><option value="3">3 derniers mois</option><option value="6" selected>6 derniers mois</option><option value="12">12 derniers mois</option></select><button class="btn small" style="margin:0" onclick="mrCsv()"><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg> Exporter (Excel/CSV)</button></div>
      <div id="mr-body"><div class="empty">Chargement…</div></div></div>
    <div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg> Maintenance par véhicule</h3>
      <div style="margin:6px 0">${KIND_TABS(maintKind, 'setMaintKind')}</div>
      <table><thead><tr><th>Véhicule</th><th>Interventions</th><th>Coût (GNF)</th><th>Dernier entretien</th><th>État</th></tr></thead><tbody>${perVeh}</tbody></table></div>
    <div class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg> Nouvel entretien</h3>
      <div class="grid-2">
        <div><label>Véhicule</label><select id="m-vehicle">${options}</select></div>
        <div><label>Type</label><select id="m-type">${typeOptions}</select></div>
        <div><label>Date</label><input id="m-date" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
        <div><label>Coût (GNF)</label><input id="m-cost" type="number" /></div>
      </div>
      <button class="btn gold" onclick="createMaintenance()">Enregistrer</button>
      <div id="m-msg"></div>
    </div>
    <div class="panel">
      <h3>Historique${maintVeh ? ' — ' + esc((vehicles.find((v) => v.id === maintVeh) || {}).internalNumber || '') + ' <a href="#" onclick="setMaintVeh(\'\');return false;" style="font-size:14px">(voir tous)</a>' : ''}</h3>
      <table><thead><tr><th>Date</th><th>Véhicule</th><th>Type</th><th>Coût</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
}
async function createMaintenance() {
  const msg = document.getElementById('m-msg');
  try {
    await api('/maintenance', { method: 'POST', body: {
      vehicleId: document.getElementById('m-vehicle').value,
      maintenanceTypeCode: document.getElementById('m-type').value,
      maintenanceDate: document.getElementById('m-date').value,
      cost: Number(document.getElementById('m-cost').value) || undefined,
    }});
    msg.innerHTML = '<div class="msg ok">Entretien enregistré.</div>';
    renderMaintenance();
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ---------------- STOCK ---------------- */
/* ---------------- Catalogue logistique pré-rempli (saisie libre toujours possible) ---------------- */
const STOCK_UNITS = ['Pièce', 'Carton', 'Sac', 'Litre', 'Fût', 'Bidon', 'Kg', 'Tonne', 'Mètre', 'Palette', 'Boîte', 'Rouleau', 'Paire', 'Jeu', 'Bouteille', 'Autre…'];
const STOCK_CATALOG = [
  ['Filtre à huile', 'Pièce'], ['Filtre à air', 'Pièce'], ['Filtre à gasoil', 'Pièce'], ['Filtre hydraulique', 'Pièce'],
  ['Huile moteur 15W40', 'Litre'], ['Huile hydraulique', 'Fût'], ['Huile de boîte / pont', 'Litre'], ['Graisse', 'Kg'],
  ['Liquide de refroidissement', 'Bidon'], ['Liquide de frein', 'Bouteille'], ['Gasoil', 'Litre'], ['AdBlue', 'Bidon'],
  ['Pneu camion', 'Pièce'], ['Pneu véhicule léger', 'Pièce'], ['Chambre à air', 'Pièce'], ['Batterie 12V', 'Pièce'],
  ['Plaquettes de frein', 'Jeu'], ['Disque de frein', 'Pièce'], ['Courroie', 'Pièce'], ['Ampoule / phare', 'Pièce'],
  ['Fusible', 'Boîte'], ['Câble électrique', 'Rouleau'], ['Boulonnerie', 'Boîte'], ['Joint', 'Pièce'],
  ['Casque de sécurité', 'Pièce'], ['Gants de protection', 'Paire'], ['Chaussures de sécurité', 'Paire'], ['Gilet haute visibilité', 'Pièce'],
  ['Lunettes de protection', 'Pièce'], ['Bouchons d\'oreilles', 'Boîte'], ['Masque anti-poussière', 'Boîte'], ['Extincteur', 'Pièce'],
  ['Trousse de premiers secours', 'Pièce'], ['Triangle de signalisation', 'Pièce'], ['Sangle d\'arrimage', 'Pièce'], ['Bâche', 'Pièce'],
  ['Ciment', 'Sac'], ['Sable', 'Tonne'], ['Gravier', 'Tonne'], ['Fer à béton', 'Pièce'], ['Carton d\'emballage', 'Carton'],
  ['Palette bois', 'Palette'], ['Film étirable', 'Rouleau'], ['Papier / fournitures de bureau', 'Carton'],
];
function stockUnitPick() {
  const sel = document.getElementById('i-unit'), other = document.getElementById('i-unit-other');
  if (other) other.style.display = sel && sel.value === 'Autre…' ? 'block' : 'none';
}
function stockUnitValue() {
  const sel = document.getElementById('i-unit'); if (!sel) return 'pièce';
  if (sel.value === 'Autre…') return (document.getElementById('i-unit-other').value || '').trim() || 'pièce';
  return sel.value.toLowerCase() === 'pièce' ? 'pièce' : sel.value;
}
function stockNamePick() {
  const n = (document.getElementById('i-name').value || '').trim().toLowerCase();
  const hit = STOCK_CATALOG.find(c => c[0].toLowerCase() === n);
  const sel = document.getElementById('i-unit');
  if (hit && sel) { sel.value = hit[1]; stockUnitPick(); }
}
async function renderStock() {
  let [items, valuation, fleet] = await Promise.all([
    api('/inventory/items?siteId=' + state.siteId),
    api('/inventory/valuation?siteId=' + state.siteId).catch(() => ({})),
    api('/vehicles?siteId=' + state.siteId).catch(() => []),
  ]);
  const vehOptions = (Array.isArray(fleet) ? fleet : []).slice().sort((a, b) => (a.vehicleType === 'TRUCK' ? 0 : 1) - (b.vehicleType === 'TRUCK' ? 0 : 1))
    .map(v => `<option value="${esc(v.id)}">${v.vehicleType === 'TRUCK' ? '' : ''} ${esc(v.internalNumber || '')} — ${esc(v.registrationNumber || '')}</option>`).join('');
  // Indicateurs : jamais « undefined » ; à défaut, calculés à partir des articles
  valuation = valuation && typeof valuation === 'object' ? valuation : {};
  if (typeof valuation.totalItems !== 'number') valuation.totalItems = items.length;
  if (typeof valuation.belowMinimum !== 'number') valuation.belowMinimum = items.filter((i) => Number(i.currentQuantity) < Number(i.minimumQuantity)).length;
  if (typeof valuation.totalValue !== 'number') valuation.totalValue = items.reduce((t, i) => t + Number(i.currentQuantity || 0) * Number(i.unitPrice || 0), 0);
  const rows = items.map(i => `
    <tr><td><b>${esc(i.sku)}</b></td><td><a href="#" style="color:var(--primary);font-weight:600" onclick="stockItemSheet('${esc(i.id)}');return false">${esc(i.name)}</a></td>
    <td class="mono">${fmt(i.currentQuantity)} ${esc(i.unit)}</td>
    <td class="mono">${fmt(i.minimumQuantity)} ${esc(i.unit)}</td>
    <td class="mono">${i.maximumQuantity === null || i.maximumQuantity === undefined ? '—' : fmt(i.maximumQuantity) + ' ' + esc(i.unit)}</td>
    <td>${esc(i.location || '—')}</td>
    <td>${Number(i.currentQuantity) <= 0 ? '<span class="badge bad">Rupture</span>' : Number(i.currentQuantity) < Number(i.minimumQuantity) ? '<span class="badge bad">Sous seuil</span>' : (i.maximumQuantity !== null && i.maximumQuantity !== undefined && Number(i.currentQuantity) > Number(i.maximumQuantity)) ? '<span class="badge">Au-dessus du max</span>' : '<span class="badge ok">OK</span>'}</td>
    <td><button class="btn small" onclick="editThresholds('${esc(i.id)}', ${Number(i.minimumQuantity)}, ${i.maximumQuantity === null || i.maximumQuantity === undefined ? 'null' : Number(i.maximumQuantity)})">Seuils</button></td></tr>`).join('') || `<tr><td colspan="7" class="empty">Aucun article enregistré.</td></tr>`;
  const itemOptions = items.map(i => `<option value="${esc(i.id)}">${esc(i.sku)} — ${esc(i.name)} (${fmt(i.currentQuantity)} ${esc(i.unit)})</option>`).join('');

  root().innerHTML = `
    <div id="st-tabs">${syTabs(STOCK_TABS, stockTab, 'setStockTab')}</div>
    <div class="kpi-grid st-kpis">
      <div class="kpi-card"><div class="kpi-label">Articles</div><div class="kpi-value mono">${fmt(valuation.totalItems)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Valeur du stock</div><div class="kpi-value mono">${fmt(valuation.totalValue)}</div><div class="kpi-sub">GNF</div></div>
      <div class="kpi-card"><div class="kpi-label">Sous seuil minimum</div><div class="kpi-value mono">${fmt(valuation.belowMinimum)}</div></div>
    </div>
    <div data-stab="articles" class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Nouvel article</h3>
      <div class="grid-2">
        <div><label>Code article</label><input id="i-sku" /></div>
        <div><label>Désignation</label><input id="i-name" list="stock-catalog" autocomplete="off" placeholder="Saisie libre ou choisir dans la liste" oninput="stockNamePick()" />
          <datalist id="stock-catalog">${STOCK_CATALOG.map(c => `<option value="${esc(c[0])}"></option>`).join('')}</datalist></div>
        <div><label>Unité</label><select id="i-unit" onchange="stockUnitPick()">${STOCK_UNITS.map(u => `<option>${esc(u)}</option>`).join('')}</select>
          <input id="i-unit-other" placeholder="Précisez l'unité" style="display:none; margin-top:6px;" /></div>
        <div><label>Seuil minimum (alerte)</label><input id="i-min" type="number" /></div>
        <div><label>Seuil maximum (alerte, optionnel)</label><input id="i-max" type="number" /></div>
        <div><label>Entrepôt / emplacement</label><input id="i-loc" placeholder="Ex : Entrepôt A, citerne 1…" /></div>
      </div>
      <button class="btn gold" onclick="createItem()">Créer l'article</button>
      <div id="i-msg"></div>
    </div>
    <div data-stab="mouvements" class="panel">
      <h3 id="mv-title"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg> Mouvement de stock</h3>
      <div class="grid-2">
        <div><label>Article</label><select id="mv-item">${itemOptions}</select></div>
        <div><label>Quantité</label><input id="mv-qty" type="number" step="0.01" /></div>
        <div><label>Motif (obligatoire)</label><input id="mv-reason" placeholder="Ex : approvisionnement, livraison, dépotage…" /></div>
        <div id="mv-veh-w"><label>Imputer à (sortie : camion / véhicule)</label><select id="mv-veh"><option value="">— Aucun —</option>${vehOptions}</select></div>
      </div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <button id="mv-in-b" class="btn small" style="background:var(--success); margin-top:0;" onclick="stockMovePanel('in')" aria-label="Entrée de stock">＋ Entrée</button>
        <button id="mv-out-b" class="btn small" style="background:var(--danger); margin-top:0;" onclick="stockMovePanel('out')" aria-label="Sortie de stock">－ Sortie</button>
      </div>
      <div id="mv-msg"></div>
    </div>
    <div data-stab="transferts" class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg> Entrepôts et transferts</h3>
      <div id="wh-box"></div>
      <div class="grid-2">
        <div><label>Article</label><select id="tf-item">${itemOptions}</select></div>
        <div><label>Destination</label><select id="tf-site"></select></div>
        <div><label>Quantité</label><input id="tf-qty" type="number" step="0.01" /></div>
        <div><label>Motif (obligatoire)</label><input id="tf-reason" placeholder="Ex : réapprovisionnement du chantier" /></div>
      </div>
      <button class="btn gold" onclick="transferStock()">Transférer</button>
      <div id="tf-msg"></div>
    </div>
    <div data-stab="inventaire" class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg> Inventaire physique</h3>
      <div class="desc">Comptez le stock réel, comparez-le au stock théorique, puis validez l'inventaire (motif obligatoire) : le stock est ajusté et chaque écart est tracé.</div>
      <div class="grid-2">
        <div><label>Entrepôt / emplacement (vide = tout le site)</label><input id="ic-loc" placeholder="Ex : Entrepôt A" /></div>
      </div>
      <button class="btn gold" onclick="startCount()">Démarrer un inventaire</button>
      <div id="ic-msg"></div>
      <div id="ic-list" style="margin-top:12px;"></div>
      <div id="ic-detail"></div>
    </div>
    <div data-stab="mouvements" class="panel">
      <h3 id="jm-title"><svg class="ic" aria-hidden="true"><use href="#i-book"/></svg> Journal des mouvements</h3>
      <div class="grid-2">
        <div><label>Du</label><input id="jm-from" type="date" onchange="loadMovements()" /></div>
        <div><label>Au</label><input id="jm-to" type="date" onchange="loadMovements()" /></div>
        <div id="jm-type-w"><label>Type</label><select id="jm-type" onchange="loadMovements()"><option value="">Tous</option><option value="IN">Entrées</option><option value="OUT">Sorties</option><option value="ADJUSTMENT">Ajustements</option></select></div>
      </div>
      <button class="btn small" onclick="downloadMovementsExcel()"><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg> Exporter en Excel</button>
      <button id="jm-bs" class="btn small" style="margin-left:6px;" onclick="downloadDeliveryNote()"><svg class="ic" aria-hidden="true"><use href="#i-receipt"/></svg> Bon de sortie (PDF)</button>
      <div id="jm-body" style="margin-top:10px;"></div>
    </div>
    <div data-stab="alertes" class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> Alertes stock</h3><div id="st-alerts"><div class="empty">Chargement…</div></div></div>
    <div data-stab="receptions" class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg> Réceptions des achats</h3>
      <div class="desc">Commandes confirmées en attente de livraison. « Réceptionner » entre le reste à livrer en stock ; l'écart entre commandé et reçu reste visible.</div>
      <div id="st-recv"><div class="empty">Chargement…</div></div></div>
    <div data-stab="articles" class="panel">
      <h3>Articles (${items.length})</h3>
      <table><thead><tr><th>Code</th><th>Désignation</th><th>Stock actuel</th><th>Seuil min.</th><th>Seuil max.</th><th>Entrepôt</th><th>État</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  loadCounts();
  loadTransferSites();
  loadMovements();
  applyStockTab();
  loadStockAlerts();
  loadStockReceipts();
}
const STOCK_TABS = [['articles', 'Articles', 'package'], ['entrepots', 'Entrepôts', 'building'], ['entrees', 'Entrées', 'download'], ['sorties', 'Sorties', 'upload'], ['inventaire', 'Inventaire', 'clipboard'], ['alertes', 'Alertes', 'alert'], ['rapports', 'Rapports', 'file']];
const STOCK_PANELS = { articles: ['articles'], entrepots: ['transferts'], entrees: ['receptions', 'mouvements'], sorties: ['mouvements'], inventaire: ['inventaire'], alertes: ['alertes'] };
let stockTab = 'articles';
function setStockTab(k) { if (k === 'rapports') return go(reportsHome(state.user.role)); stockTab = k; applyStockTab(); }
function applyStockTab() {
  document.querySelectorAll('[data-stab]').forEach((el) => { el.style.display = (STOCK_PANELS[stockTab] || []).includes(el.dataset.stab) ? '' : 'none'; });
  // Chaque onglet ne montre que ce qui le concerne
  const $ = (id) => document.getElementById(id), show = (id, on) => { const e = $(id); if (e) e.style.display = on ? '' : 'none'; };
  const isIn = stockTab === 'entrees', isOut = stockTab === 'sorties';
  const k = document.querySelector('.st-kpis'); if (k) k.style.display = ['articles', 'alertes'].includes(stockTab) ? '' : 'none';
  show('mv-in-b', !isOut); show('mv-out-b', !isIn); show('mv-veh-w', !isIn); show('jm-type-w', !isIn && !isOut); show('jm-bs', !isIn);
  if ($('mv-title')) $('mv-title').innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-${isOut ? 'upload' : 'download'}"/></svg> ${isIn ? 'Nouvelle entrée de stock' : isOut ? 'Nouvelle sortie de stock' : 'Mouvement de stock'}`;
  if ($('jm-title')) $('jm-title').innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-book"/></svg> ${isIn ? 'Historique des entrées' : isOut ? 'Historique des sorties' : 'Journal des mouvements'}`;
  if ($('mv-reason')) $('mv-reason').placeholder = isIn ? 'Ex : achat, livraison fournisseur, retour…' : isOut ? 'Ex : réparation camion, consommation atelier…' : 'Ex : approvisionnement, livraison, dépotage…';
  const ty = $('jm-type'); if (ty) { const want = isIn ? 'IN' : isOut ? 'OUT' : ty.value; if (ty.value !== want) { ty.value = want; if (typeof loadMovements === 'function') loadMovements(); } }
  const bar = document.getElementById('st-tabs');
  if (bar) bar.innerHTML = syTabs(STOCK_TABS, stockTab, 'setStockTab');
}
async function loadStockAlerts() {
  const box = document.getElementById('st-alerts');
  if (!box) return;
  try {
    const [an, dash] = await Promise.all([
      api('/inventory/analysis?siteId=' + state.siteId),
      api('/dashboards/stock?siteId=' + state.siteId).catch(() => null),
    ]);
    const rows = Array.isArray(an) ? an : (an.items || []);
    const low = rows.filter((r) => r.state === 'RUPTURE' || r.state === 'SOUS_SEUIL');
    const cover = rows.filter((r) => r.state !== 'RUPTURE' && r.state !== 'SOUS_SEUIL' && r.coverageDays !== null && r.coverageDays !== undefined && r.coverageDays < 7);
    const dormant = rows.filter((r) => Number(r.currentQuantity) > 0 && Number(r.avgDaily || 0) === 0);
    const lots = (dash && dash.sections && dash.sections.expiringLots) || (dash && dash.expiringLots) || [];
    const tbl = (head, body) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
    const part = (title, n, html) => `<h4 style="margin:12px 0 4px">${title} <span class="badge ${n ? 'bad' : 'ok'}">${n}</span></h4>${n ? html : '<div class="desc"><svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg> Rien à signaler.</div>'}`;
    box.innerHTML =
      part('Ruptures et articles sous le seuil', low.length, tbl(['Article', 'Stock', 'Seuil min.', 'État'], low.map((r) => `<tr><td>${esc(r.name)}</td><td class="mono">${fmt(r.currentQuantity)} ${esc(r.unit || '')}</td><td class="mono">${fmt(r.minimumQuantity)}</td><td>${r.state === 'RUPTURE' ? '<span class="badge bad">Rupture</span>' : '<span class="badge warn">Sous seuil</span>'}</td></tr>`).join(''))) +
      part('Moins de 7 jours de couverture', cover.length, tbl(['Article', 'Stock', 'Couverture'], cover.map((r) => `<tr><td>${esc(r.name)}</td><td class="mono">${fmt(r.currentQuantity)} ${esc(r.unit || '')}</td><td class="mono">${r.coverageDays} j</td></tr>`).join(''))) +
      part('Lots périmés ou bientôt périmés', lots.length, tbl(['Article', 'Lot', 'Quantité', 'Péremption'], lots.map((l) => `<tr><td>${esc(l.item)}</td><td>${esc(l.lotNumber)}</td><td class="mono">${fmt(l.quantity)}</td><td>${l.expired ? '<span class="badge bad">Périmé</span>' : '<span class="badge warn">Dans ' + l.daysLeft + ' j</span>'} ${new Date(l.expiryDate).toLocaleDateString('fr-FR')}</td></tr>`).join(''))) +
      part('Sans sortie récente (stock dormant)', dormant.length, tbl(['Article', 'Stock'], dormant.slice(0, 50).map((r) => `<tr><td>${esc(r.name)}</td><td class="mono">${fmt(r.currentQuantity)} ${esc(r.unit || '')}</td></tr>`).join('')));
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function loadStockReceipts() {
  const box = document.getElementById('st-recv');
  if (!box) return;
  try {
    const list = await api('/purchases/orders?siteId=' + state.siteId);
    const open = (Array.isArray(list) ? list : []).filter((o) => ['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(o.status));
    box.innerHTML = open.length ? `<table><thead><tr><th>Commande</th><th>Fournisseur</th><th>État</th><th></th></tr></thead><tbody>${open.map((o) => `<tr>
      <td><b>${esc(o.reference || o.id.slice(0, 8))}</b></td><td>${esc((o.supplier && o.supplier.name) || '—')}</td>
      <td>${o.status === 'PARTIALLY_RECEIVED' ? '<span class="badge warn">Reçue en partie</span>' : '<span class="badge">À recevoir</span>'}</td>
      <td><button class="btn small gold" onclick="stockReceive('${esc(o.id)}')">Réceptionner</button></td></tr>`).join('')}</tbody></table>` : '<div class="desc"><svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg> Aucune commande en attente de livraison.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function stockReceive(id) {
  try {
    const o = await api('/purchases/orders/' + id);
    const lines = o.lines.map((l) => ({ lineId: l.id, quantityReceived: Number(l.quantityOrdered) - Number(l.quantityReceived) })).filter((l) => l.quantityReceived > 0);
    const resume = o.lines.map((l) => `• ${(l.item && l.item.name) || 'Article'} : commandé ${fmt(l.quantityOrdered)}, déjà reçu ${fmt(l.quantityReceived)}, reste ${fmt(Number(l.quantityOrdered) - Number(l.quantityReceived))}`).join('\n');
    if (!lines.length) return alert('Tout est déjà reçu.');
    if (!confirm('Réceptionner le reste à livrer et entrer en stock ?\n\n' + resume)) return;
    await api('/purchases/orders/' + id + '/receive', { method: 'POST', body: { lines } });
    renderStock();
  } catch (e) { alert(e.message); }
}
async function stockItemSheet(id) {
  try {
    const [it, mv] = await Promise.all([api('/inventory/items/' + id), api('/inventory/movements?itemId=' + id + '&limit=50')]);
    const lab = { IN: 'Entrée', OUT: 'Sortie', ADJUSTMENT: 'Ajustement', TRANSFER: 'Transfert', RETURN: 'Retour' };
    const outV = {};
    mv.filter((m) => m.movementType === 'OUT' && m.vehicle).forEach((m) => { const k = (m.vehicle.internalNumber || '') + ' ' + (m.vehicle.registrationNumber || ''); outV[k] = (outV[k] || 0) + Number(m.totalValue || (m.unitPrice || it.unitPrice || 0) * Number(m.quantity)); });
    const veh = Object.entries(outV);
    const html = `<div class="panel" id="st-sheet"><h3><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Fiche article — ${esc(it.name)} <button class="btn small" style="float:right;margin:0" onclick="document.getElementById('st-sheet').remove()"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg> Fermer</button></h3>
      <div class="grid-2"><div><label>Code</label><b>${esc(it.sku)}</b></div><div><label>Stock actuel</label><b class="mono">${fmt(it.currentQuantity)} ${esc(it.unit)}</b></div>
      <div><label>Seuils</label><b class="mono">${fmt(it.minimumQuantity)} / ${it.maximumQuantity == null ? '—' : fmt(it.maximumQuantity)}</b></div><div><label>Emplacement</label><b>${esc(it.location || '—')}</b></div>
      <div><label>Dernier prix unitaire</label><b class="mono">${it.unitPrice == null ? '—' : fmt(it.unitPrice) + ' GNF'}</b></div><div><label>Fournisseur habituel</label><b>${esc((it.supplier && it.supplier.name) || '—')}</b></div></div>
      ${veh.length ? `<h4 style="margin:12px 0 4px">Coût des sorties par véhicule (50 derniers mouvements)</h4><table><thead><tr><th>Véhicule</th><th>Valeur (GNF)</th></tr></thead><tbody>${veh.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${fmt(v)}</td></tr>`).join('')}</tbody></table>` : ''}
      <h4 style="margin:12px 0 4px">Historique des mouvements</h4>
      ${mv.length ? `<table><thead><tr><th>Date</th><th>Type</th><th>Qté</th><th>Véhicule</th><th>Motif</th></tr></thead><tbody>${mv.map((m) => `<tr><td>${new Date(m.createdAt).toLocaleString('fr-FR')}</td><td>${lab[m.movementType] || esc(m.movementType)}</td><td class="mono">${fmt(m.quantity)}</td><td>${m.vehicle ? esc((m.vehicle.internalNumber || '') + ' ' + (m.vehicle.registrationNumber || '')) : ''}</td><td>${esc(m.reason || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="desc">Aucun mouvement.</div>'}</div>`;
    const old = document.getElementById('st-sheet'); if (old) old.remove();
    const host = document.getElementById('st-tabs'); host.insertAdjacentHTML('afterend', html);
    host.scrollIntoView({ behavior: 'smooth' });
  } catch (e) { alert(e.message); }
}
async function createItem() {
  const msg = document.getElementById('i-msg');
  try {
    await api('/inventory/items', { method: 'POST', body: {
      siteId: state.siteId,
      sku: document.getElementById('i-sku').value,
      name: document.getElementById('i-name').value,
      unit: stockUnitValue(),
      minimumQuantity: Number(document.getElementById('i-min').value) || 0,
      ...(document.getElementById('i-max').value ? { maximumQuantity: Number(document.getElementById('i-max').value) } : {}),
      ...(document.getElementById('i-loc').value.trim() ? { location: document.getElementById('i-loc').value.trim() } : {}),
    }});
    msg.innerHTML = '<div class="msg ok">Article créé.</div>';
    renderStock();
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function editThresholds(id, curMin, curMax) {
  const min = prompt('Seuil MINIMUM (alerte quand le stock passe en dessous) :', curMin);
  if (min === null) return;
  const max = prompt('Seuil MAXIMUM (vide = aucun) :', curMax === null ? '' : curMax);
  if (max === null) return;
  const reason = prompt('Motif de la modification (obligatoire) :');
  if (!reason) return;
  try {
    await api('/inventory/items/' + id, { method: 'PATCH', body: {
      minimumQuantity: Number(min) || 0,
      ...(max !== '' ? { maximumQuantity: Number(max) } : {}),
      reason,
    }});
    renderStock();
  } catch (e) { alert(e.message); }
}
async function loadTransferSites() {
  const sel = document.getElementById('tf-site');
  if (!sel) return;
  try {
    const sites = await api('/sites');
    const others = sites.filter(s => s.id !== state.siteId);
    sel.innerHTML = others.length ? others.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('') : '<option value="">Aucun autre entrepôt — créez le 2e ci-dessous</option>';
    const box = document.getElementById('wh-box');
    if (box) {
      const active = sites.filter(s => s.status === 'ACTIVE');
      box.innerHTML = `<div class="desc">Entrepôts : ${active.map(s => '<b>' + esc(s.name) + '</b>').join(' • ')} (${active.length} / 2)</div>` +
        (active.length < 2 && state.user.role === 'SUPER_ADMIN' ? `<div class="grid-2" style="margin-top:8px;"><div><label>Nom du 2e entrepôt</label><input id="wh-name" placeholder="Entrepôt 2" /></div></div><button class="btn small gold" onclick="createWarehouse()">Créer l'entrepôt</button>` : '');
    }
  } catch (e) {}
}
async function createWarehouse() {
  const name = document.getElementById('wh-name').value.trim();
  if (!name) return;
  try { await api('/sites', { method: 'POST', body: { name } }); renderStock(); } catch (e) { alert(e.message); }
}
async function transferStock() {
  const msg = document.getElementById('tf-msg');
  try {
    const r = await api('/inventory/transfers', { method: 'POST', body: {
      itemId: document.getElementById('tf-item').value,
      toSiteId: document.getElementById('tf-site').value,
      quantity: Number(document.getElementById('tf-qty').value),
      reason: document.getElementById('tf-reason').value.trim(),
    }});
    msg.innerHTML = `<div class="msg ok">Transfert ${esc(r.reference)} : ${esc(r.from)} → ${esc(r.to)}. Stock source : ${fmt(r.sourceQuantity)}, destination : ${fmt(r.destinationQuantity)}.</div>`;
    setTimeout(renderStock, 1800);
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function stockMovePanel(direction) {
  const msg = document.getElementById('mv-msg');
  try {
    const veh = document.getElementById('mv-veh') ? document.getElementById('mv-veh').value : '';
    await api('/inventory/movements/' + direction, { method: 'POST', body: {
      itemId: document.getElementById('mv-item').value,
      siteId: state.siteId,
      quantity: Number(document.getElementById('mv-qty').value),
      reason: document.getElementById('mv-reason').value,
      ...(direction === 'out' && veh ? { vehicleId: veh } : {}),
    }});
    msg.innerHTML = `<div class="msg ok">${direction === 'in' ? 'Entrée' : 'Sortie'} enregistrée — stock recalculé.</div>`;
    renderStock();
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ---------------- JOURNAL DES MOUVEMENTS ---------------- */
function movementsQuery() {
  const q = new URLSearchParams({ siteId: state.siteId });
  const f = document.getElementById('jm-from').value, t = document.getElementById('jm-to').value, ty = document.getElementById('jm-type').value;
  if (f) q.set('from', f);
  if (t) q.set('to', t);
  if (ty) q.set('type', ty);
  return q.toString();
}
async function loadMovements() {
  const box = document.getElementById('jm-body');
  if (!box) return;
  try {
    const list = await api('/inventory/movements?limit=100&' + movementsQuery());
    const lab = { IN: 'Entrée', OUT: 'Sortie', ADJUSTMENT: 'Ajustement', TRANSFER: 'Transfert' };
    box.innerHTML = list.length ? `<table><thead><tr><th>Date</th><th>Type</th><th>Article</th><th>Qté</th><th>Motif</th><th>Par</th></tr></thead><tbody>${list.map(m => `
      <tr><td>${new Date(m.createdAt).toLocaleString('fr-FR')}</td><td>${lab[m.movementType] || esc(m.movementType)}</td>
      <td>${esc(m.item.name)}</td><td class="mono">${fmt(m.quantity)} ${esc(m.item.unit)}</td>
      <td>${esc(m.reason || '')}</td><td>${m.createdBy ? esc(m.createdBy.firstName + ' ' + m.createdBy.lastName) : ''}</td></tr>`).join('')}</tbody></table>` : `<div class="desc">${stockTab === 'entrees' ? 'Aucune entrée sur cette période.' : stockTab === 'sorties' ? 'Aucune sortie sur cette période.' : 'Aucun mouvement.'}</div>`;
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function downloadDeliveryNote() {
  try {
    const who = prompt('Bénéficiaire (nom / service) — facultatif :') ?? '';
    const q = new URLSearchParams({ siteId: state.siteId });
    const f = document.getElementById('jm-from').value, t = document.getElementById('jm-to').value;
    if (f) q.set('from', f);
    if (t) q.set('to', t);
    if (who.trim()) q.set('beneficiary', who.trim());
    const blob = await api('/inventory/delivery-note?' + q.toString());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bon_de_sortie.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) { alert(e.message); }
}
async function downloadMovementsExcel() {
  try {
    const blob = await api('/inventory/movements/export/excel?' + movementsQuery());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mouvements_stock.xlsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) { alert(e.message); }
}


/* ---------------- ACHATS & APPROVISIONNEMENT ---------------- */
async function renderPurchases() {
  const isAdmin = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role);
  root().innerHTML = `
    <div class="panel"><h3>À commander (réapprovisionnement automatique)</h3>
      <div class="desc">Articles sous le seuil ou à moins de 7 jours de couverture, groupés par fournisseur. Les quantités déjà commandées sont déduites.</div>
      <div id="pu-reorder"><div class="empty">Chargement…</div></div><div id="pu-msg"></div></div>
    <div class="panel"><h3>Demandes de prix (comparatif fournisseurs)</h3>
      <div class="desc">Consultez au moins 2 fournisseurs, saisissez leurs prix, comparez, puis validez : le bon de commande est créé automatiquement.</div>
      <button class="btn gold" onclick="prNew()">+ Nouvelle demande de prix</button>
      <div id="pu-pr" style="margin-top:10px"><div class="empty">Chargement…</div></div></div>
    <div class="panel"><h3>Bons de commande</h3><div id="pu-orders"><div class="empty">Chargement…</div></div></div>
    <div class="panel"><h3>Fournisseurs</h3>
      <div class="grid-2">
        <div><label>Nom</label><input id="su-name" /></div><div><label>Contact</label><input id="su-contact" /></div>
        <div><label>Téléphone</label><input id="su-phone" /></div><div><label>E-mail</label><input id="su-email" /></div>
      </div>
      <button class="btn gold" style="margin-top:8px;" onclick="addSupplier()">+ Ajouter le fournisseur</button><div id="su-msg"></div>
      <div id="su-list" style="margin-top:12px;"></div></div>`;
  loadReorder(); loadPriceRequests(); loadOrders(isAdmin); loadSuppliers();
}
