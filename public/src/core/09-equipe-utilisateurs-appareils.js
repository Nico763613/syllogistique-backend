function flInsurance(v) {
  const i = v.insurance; if (!i || i.status === 'NONE') return { lvl: 'bad', txt: 'Aucune assurance' };
  if (i.status === 'EXPIRED') return { lvl: 'bad', txt: 'Assurance expirée le ' + flD(i.expiryDate) };
  if (i.status === 'EXPIRING') return { lvl: 'warn', txt: 'Assurance : expire dans ' + i.daysLeft + ' j' };
  return { lvl: 'ok', txt: 'Assurance valide' + (i.expiryDate ? ' → ' + flD(i.expiryDate) : '') };
}
async function renderFleet(kind) {
  flStyle();
  window._flKind = kind;
  const trucks = kind === 'TRUCK', label = trucks ? 'Camions' : 'Véhicules de service';
  const [list, other] = await Promise.all([
    api('/vehicles/fleet-overview?vehicleType=' + kind + (state.siteId ? '&siteId=' + encodeURIComponent(state.siteId) : '')),
    api('/vehicles/fleet-overview?vehicleType=' + (trucks ? 'SERVICE_VEHICLE' : 'TRUCK') + (state.siteId ? '&siteId=' + encodeURIComponent(state.siteId) : '')).catch(() => []),
  ]);
  if (!/^fleet-/.test(state.view)) return;
  window._flList = list;
  const nT = trucks ? list.length : other.length, nS = trucks ? other.length : list.length;
  const c = (s) => list.filter((v) => v.status === s).length, av = c('AVAILABLE'), mi = c('ON_MISSION'), ma = c('MAINTENANCE'), im = c('IMMOBILIZED') + c('OUT_OF_SERVICE');
  const pct = list.length ? Math.round((av / list.length) * 100) : null;
  const kpi = (col, ic, lb, v, foot) => `<div class="dg-kpi"><div class="top"><div class="dg-ico" style="background:${col}"><svg class="ic" aria-hidden="true"><use href="#i-${ic}"/></svg></div><div><div class="lb">${lb}</div><div class="vl">${v}</div></div></div>${foot ? `<div class="ft">${foot}</div>` : ''}</div>`;
  dgStyle();
  const watch = [];
  list.forEach((v) => {
    const n = esc(v.internalNumber);
    if (trucks) { const i = flInsurance(v); if (i.lvl !== 'ok') watch.push(`${n} — ${i.txt}`); }
    if (v.registrationType === 'IT' && v.itExpiryDate) { const d = Math.floor((new Date(v.itExpiryDate) - Date.now()) / 864e5); if (d <= 30) watch.push(`${n} — plaque IT ${d < 0 ? 'expirée' : 'expire dans ' + d + ' j'} (${flD(v.itExpiryDate)})`); }
    const m = flMaint(v); if (m && m.lvl !== 'ok') watch.push(`${n} — ${m.txt}`);
    if (v.openDowntime) watch.push(`${n} — immobilisé : ${esc(FL_DT[v.openDowntime.category] || v.openDowntime.category)} (${esc(v.openDowntime.reason)}) depuis le ${flD(v.openDowntime.since)}`);
  });
  const canEdit = FL_EDIT_ROLES.includes(state.user.role);
  root().innerHTML = `<div class="fl-tabs"><button class="tab ${trucks ? 'on' : ''}" onclick="go('fleet-trucks')">Camions (${nT})</button><button class="tab ${trucks ? '' : 'on'}" onclick="go('fleet-service')">Véhicules de service (${nS})</button><span class="sp"></span>${canEdit ? `<button class="btn gold" onclick="go('${trucks ? 'trucks' : 'service-vehicles'}')">Gérer : ajouter / modifier</button>` : ''}</div>
    <div class="dg-kpis">${kpi('#2F6FB5', trucks ? 'truck' : 'car', 'Total ' + label.toLowerCase(), fmt(list.length), '')}${kpi('#2E8B57', 'check-circle', 'Disponibles', fmt(av), pct == null ? '' : `<span>${pct} % de la flotte</span>`)}${kpi('#4F8FD6', 'target', 'En mission', fmt(mi), '')}${kpi('#D08A1E', 'wrench', 'En maintenance', fmt(ma), '')}${kpi('#D64545', 'alert', 'Immobilisés / hors service', fmt(im), '')}</div>
    ${watch.length ? `<div class="fl-watch"><b>À surveiller (${watch.length})</b>${watch.slice(0, 8).map((w) => `<div>${w}</div>`).join('')}${watch.length > 8 ? `<div>… et ${watch.length - 8} autre(s)</div>` : ''}</div>` : ''}
    <div class="fl-filters"><input id="fl-q" placeholder="Rechercher : n° interne, plaque, chauffeur…" oninput="flDraw()"><select id="fl-s" onchange="flDraw()"><option value="">Tous les états</option>${Object.entries(FL_ST).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div id="fl-list" class="fl-grid"></div>`;
  flDraw();
}
function flDraw() {
  const box = document.getElementById('fl-list'); if (!box) return;
  const q = ((document.getElementById('fl-q') || {}).value || '').toLowerCase().trim(), s = (document.getElementById('fl-s') || {}).value || '', trucks = window._flKind === 'TRUCK';
  const rows = (window._flList || []).filter((v) => (!s || v.status === s) && (!q || [v.internalNumber, v.registrationNumber, v.brand, v.model, v.assignedDriver && v.assignedDriver.firstName + ' ' + v.assignedDriver.lastName].filter(Boolean).join(' ').toLowerCase().includes(q)));
  box.innerHTML = rows.map((v) => {
    const m = flMaint(v), ins = trucks ? flInsurance(v) : null, t = v.currentTrip;
    const row = (a, b) => `<div class="fl-row"><span>${a}</span><b>${b}</b></div>`;
    return `<div class="fl-card ${esc(v.status)}" onclick="flOpen('${esc(v.id)}')">
      <div class="fl-top"><div><b>${esc(v.internalNumber)}</b><small>${esc(v.registrationNumber)}${v.registrationType === 'IT' ? ' · plaque IT' : ''} · ${esc([v.brand, v.model].filter(Boolean).join(' ') || '—')}</small></div>${statusBadge(v.status)}</div>
      ${v.openDowntime ? `<div class="fl-alert">${esc(FL_DT[v.openDowntime.category] || v.openDowntime.category)} : ${esc(v.openDowntime.reason)} (depuis le ${flD(v.openDowntime.since)})</div>` : ''}
      ${row('Kilométrage', fmt(v.currentMileage) + ' km')}
      ${row('Affectation', v.assignedDriver ? esc(v.assignedDriver.firstName + ' ' + v.assignedDriver.lastName) : 'Non affecté')}
      ${row('Mission en cours', t ? esc((t.destination || 'En route') + (t.driver ? ' · ' + t.driver : '')) : 'Aucune')}
      ${row('Ce mois', `${v.month.trips} mission(s) · ${fmt(v.month.km)} km · ${fmt(Math.round(v.month.liters))} L`)}
      ${m ? `<div class="fl-row"><span>Entretien</span><b><span class="badge ${m.lvl === 'bad' ? 'bad' : 'warn'}">${esc(m.txt)}</span></b></div>` : ''}
      ${ins && ins.lvl !== 'ok' ? `<div class="fl-row"><span>Assurance</span><b><span class="badge ${ins.lvl === 'bad' ? 'bad' : 'warn'}">${esc(ins.txt)}</span></b></div>` : ''}
    </div>`;
  }).join('') || '<div class="empty" style="grid-column:1/-1">Aucun véhicule ne correspond.</div>';
}
async function flOpen(id) {
  flStyle();
  const old = document.getElementById('fl-ov'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = 'fl-ov'; ov.className = 'fl-ov';
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  ov.innerHTML = '<div class="fl-dos"><div class="fl-dh"><h3>Chargement…</h3><button onclick="document.getElementById(\'fl-ov\').remove()">Fermer</button></div></div>';
  document.body.appendChild(ov);
  try {
    const d = await api('/vehicles/' + encodeURIComponent(id) + '/dossier');
    window._flDos = d; flShow('trips');
  } catch (e) { ov.querySelector('.fl-dos').innerHTML = `<div class="fl-dh"><h3>Dossier indisponible</h3><button onclick="document.getElementById('fl-ov').remove()">Fermer</button></div><div class="fl-db"><div class="msg err">${esc(e.message)}</div></div>`; }
}
function flShow(tab) {
  const d = window._flDos, ov = document.getElementById('fl-ov'); if (!d || !ov) return;
  const v = d.vehicle, t = d.totals, cur = (window._flList || []).find((x) => x.id === v.id) || {}, trucks = v.vehicleType === 'TRUCK';
  const ins = trucks ? flInsurance({ insurance: cur.insurance }) : null;
  const id = (a, b) => `<div><span>${a}</span><b>${b}</b></div>`;
  const tot = (a, b) => `<div><b>${a}</b><span>${b}</span></div>`;
  const tb = (heads, rows) => `<div class="fl-tb"><table><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${heads.length}" class="empty">Aucun enregistrement.</td></tr>`}</table></div>`;
  const tabs = { trips: 'Missions', fuel: 'Carburant', maint: 'Maintenance', inc: 'Incidents', docs: 'Documents', aff: 'Chauffeurs' };
  let body = '';
  if (tab === 'trips') body = tb(['Date', 'Référence', 'Chauffeur', 'Destination', 'Distance', 'État'], d.trips.map((x) => [flD(x.tripDate), esc(x.reference || '—'), x.driver ? esc(x.driver.firstName + ' ' + x.driver.lastName) : '—', esc(x.destination || '—'), x.distance != null ? fmt(x.distance) + ' km' : '—', esc(FL_TS[x.status] || x.status)]));
  if (tab === 'fuel') body = tb(['Date', 'Litres', 'Montant', 'Lieu', 'Km', 'Responsable'], d.fuel.map((x) => [flD(x.transactionDate), fmt(x.quantityLiters) + ' L', fmt(x.totalCost) + ' GNF', esc((x.source === 'TANK' ? 'Dépôt' : 'Station') + (x.station ? ' · ' + x.station : '')), fmt(x.mileage), x.driver ? esc(x.driver.firstName + ' ' + x.driver.lastName) : '—']));
  if (tab === 'maint') body = tb(['Date', 'Type', 'Description', 'Garage', 'Coût', 'État'], d.maintenance.map((x) => [flD(x.maintenanceDate), esc((x.maintenanceType && x.maintenanceType.label) || '—') + (x.kind === 'PREVENTIVE' ? '<br><small>Préventif</small>' : ''), esc(x.description || '—'), esc((x.supplier && x.supplier.name) || '—'), fmt(x.cost) + ' GNF', esc({ PLANNED: 'Planifié', IN_PROGRESS: 'En cours', COMPLETED: 'Terminé', OVERDUE: 'En retard' }[x.status] || x.status)]));
  if (tab === 'docs') {
    const nm = { ASSURANCE: 'Assurance', VISITE_TECHNIQUE: 'Visite technique', CARTE_GRISE: 'Carte grise', CONTRAT: 'Contrat', AUTRE: 'Autre' }, canRenew = MP_FLEET.includes((state.user && state.user.role) || '');
    const st = (x) => { if (!x.expiryDate) return '<span class="badge info">Sans échéance</span>'; const j = Math.ceil((new Date(x.expiryDate) - Date.now()) / 864e5); return j < 0 ? `<span class="badge bad">Expiré (${-j} j)</span>` : j <= 7 ? `<span class="badge bad">Urgent : ${j} j</span>` : j <= 30 ? `<span class="badge warn">Expire dans ${j} j</span>` : '<span class="badge ok">Valide</span>'; };
    body = tb(['Document', 'Échéance', 'État', ''], (v.documents || []).filter((x) => !x.replacedAt).map((x) => [esc(nm[x.type] || x.type), x.expiryDate ? flD(x.expiryDate) : '—', st(x), x.expiryDate && canRenew ? `<button class="btn small" onclick="document.getElementById('fl-ov').remove(); renewVehicleDoc('${x.id}')">Renouveler</button>` : '']));
  }
  if (tab === 'aff') body = tb(['Du', 'Au', 'Chauffeur', 'Motif'], (d.assignments || []).map((x) => [flD(x.startedAt), x.endedAt ? flD(x.endedAt) : '<b>En cours</b>', esc(x.driverName || '—'), esc(x.reason || (x.source === 'MANUEL' ? 'Affectation par la logistique' : x.source))]));
  if (tab === 'inc') body = '<h4 style="margin:0 0 6px;color:var(--navy)">Pannes et immobilisations</h4>' + tb(['Début', 'Fin', 'Nature', 'Motif', 'Coût'], d.downtimes.map((x) => [flD(x.startedAt), x.endedAt ? flD(x.endedAt) : '<span class="badge bad">En cours</span>', esc(FL_DT[x.category] || x.category), esc(x.reason) + (x.severity ? '<br><small>Gravité : ' + esc(FL_SEV[x.severity] || x.severity) + '</small>' : ''), (x.actualCost != null ? fmt(x.actualCost) : x.estimatedCost != null ? fmt(x.estimatedCost) + ' (est.)' : '—') + ' GNF'])) + '<h4 style="margin:14px 0 6px;color:var(--navy)">Incidents HSE liés au véhicule</h4>' + tb(['Date', 'Type', 'Gravité', 'État', 'Description'], d.incidents.map((x) => [flD(x.occurredAt), esc(FL_HT[x.type] || x.type), esc(FL_SEV[x.severity] || x.severity), esc({ OPEN: 'Ouvert', INVESTIGATING: 'En analyse', CLOSED: 'Clos' }[x.status] || x.status), esc(x.description)]));
  ov.querySelector('.fl-dos').innerHTML = `<div class="fl-dh"><div><h3>${esc(v.internalNumber)} · ${esc(v.registrationNumber)}</h3><small>${esc([v.brand, v.model, v.year].filter(Boolean).join(' ') || (trucks ? 'Camion' : 'Véhicule de service'))}</small></div><div style="display:flex;gap:8px;align-items:center">${statusBadge(v.status)}<button onclick="document.getElementById('fl-ov').remove()">Fermer</button></div></div>
    <div class="fl-db"><div class="fl-id">${id('Identification', esc(v.internalNumber))}${id('Immatriculation', esc(v.registrationNumber) + (v.registrationType === 'IT' ? ' (IT' + (v.itExpiryDate ? ' → ' + flD(v.itExpiryDate) : '') + ')' : ''))}${id('Type', trucks ? esc((v.truckType ? ttLabel(v.truckType) : 'Camion') + (v.wheels ? ' · ' + v.wheels + ' roues' : '') + (v.capacity ? ' · ' + v.capacity + ' t' : '')) : 'Véhicule de service')}${id('Kilométrage', fmt(v.currentMileage) + ' km')}${id('Disponibilité', v.status === 'AVAILABLE' ? 'Disponible' : esc(FL_ST[v.status] || v.status))}${id('Affectation', v.assignedDriver ? esc(v.assignedDriver.firstName + ' ' + v.assignedDriver.lastName) + (v.assignedDriver.phone ? '<br><small>' + esc(v.assignedDriver.phone) + '</small>' : '') : 'Non affecté')}${ins ? id('Assurance', esc(ins.txt)) : ''}${id('Observations', esc(v.observations || '—'))}</div>
    <div class="fl-tot">${tot(fmt(t.completedTrips), 'Missions terminées')}${tot(fmt(t.km) + ' km', 'Distance parcourue')}${tot(fmt(Math.round(t.liters)) + ' L', 'Carburant consommé')}${tot(fmt(t.fuelCost) + ' GNF', 'Coût carburant')}${tot(fmt(t.maintenanceCost) + ' GNF', 'Coût maintenance (' + t.interventions + ')')}</div>
    <div class="fl-sub">${Object.entries(tabs).map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" onclick="flShow('${k}')">${l}</button>`).join('')}</div>${body}</div>`;
}
// Données fictives (mode démonstration uniquement)
function demoFleet(kind) {
  const trucks = kind === 'TRUCK', n = trucks ? 8 : 3, st = ['AVAILABLE', 'ON_MISSION', 'AVAILABLE', 'MAINTENANCE', 'ON_MISSION', 'AVAILABLE', 'IMMOBILIZED', 'AVAILABLE'], now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const s = st[i % st.length], pad = String(i + 1).padStart(3, '0');
    return { id: 'demo-' + kind + i, vehicleType: kind, internalNumber: (trucks ? 'CAM-' : 'VS-') + pad, registrationNumber: 'DEMO ' + (1000 + i * 37) + ' X', brand: trucks ? 'Sinotruk' : 'Toyota', model: trucks ? 'HOWO' : 'Hilux', year: 2020 + (i % 4), capacity: trucks ? '30' : null, wheels: trucks ? 10 : null, truckType: trucks ? 'BENNE' : null, currentMileage: 48000 + i * 7300, status: s, registrationType: i === 4 ? 'IT' : 'NORMALE', itExpiryDate: i === 4 ? new Date(now + 12 * 864e5).toISOString() : null, observations: null,
      assignedDriver: s === 'MAINTENANCE' ? null : { id: 'd' + i, firstName: 'Chauffeur', lastName: 'Fictif ' + (i + 1), phone: '620 00 00 0' + i },
      insurance: { status: i === 2 ? 'EXPIRING' : i === 6 ? 'EXPIRED' : 'VALID', expiryDate: new Date(now + (i === 6 ? -9 : i === 2 ? 14 : 200) * 864e5).toISOString(), daysLeft: i === 2 ? 14 : 200 },
      currentTrip: s === 'ON_MISSION' ? { reference: 'TRP-DEMO-' + pad, destination: 'Kankan', since: new Date(now - 6 * 36e5).toISOString(), driver: 'Chauffeur Fictif ' + (i + 1) } : null,
      openDowntime: s === 'IMMOBILIZED' ? { category: 'PANNE', reason: 'Boîte de vitesses', since: new Date(now - 3 * 864e5).toISOString() } : null,
      lastMaintenanceAt: new Date(now - 40 * 864e5).toISOString(), nextMaintenanceDate: i === 3 ? new Date(now - 4 * 864e5).toISOString() : new Date(now + 60 * 864e5).toISOString(), nextMaintenanceMileage: 60000 + i * 7300,
      month: { trips: 4 + i, km: 1200 + i * 310, liters: 520 + i * 90, fuelCost: 6500000 } };
  });
}
function demoDossier(id) {
  const kind = id.includes('SERVICE') ? 'SERVICE_VEHICLE' : 'TRUCK', v = demoFleet(kind).find((x) => x.id === id) || demoFleet(kind)[0], d = (x) => new Date(Date.now() - x * 864e5).toISOString();
  return { vehicle: v, trips: [1, 3, 6, 9].map((x, i) => ({ id: 't' + i, reference: 'TRP-DEMO-' + x, tripDate: d(x), status: 'COMPLETED', destination: ['Kankan', 'Labé', 'Mamou', 'Kindia'][i], distance: 300 + i * 40, driver: { firstName: 'Chauffeur', lastName: 'Fictif' } })),
    fuel: [2, 7, 12].map((x, i) => ({ id: 'f' + i, transactionDate: d(x), quantityLiters: 180 + i * 20, totalCost: 2250000 + i * 250000, station: 'Station fictive', source: i === 1 ? 'TANK' : 'STATION', mileage: v.currentMileage - x * 90, driver: { firstName: 'Chauffeur', lastName: 'Fictif' } })),
    maintenance: [{ id: 'm1', maintenanceDate: d(40), kind: 'PREVENTIVE', status: 'COMPLETED', description: 'Vidange et filtres', cost: 1800000, mileage: v.currentMileage - 3000, maintenanceType: { label: 'Vidange' }, supplier: { name: 'Garage fictif' } }],
    downtimes: v.openDowntime ? [{ id: 'x1', category: 'PANNE', reason: v.openDowntime.reason, severity: 'HIGH', startedAt: v.openDowntime.since, endedAt: null, actualCost: null, estimatedCost: 4500000 }] : [], incidents: [],
    totals: { completedTrips: 42, km: 15800, liters: 5200, fuelCost: 65000000, maintenanceCost: 6400000, interventions: 5 } };
}

/* ---------------- MON ESPACE : gestionnaire de stock, agent HSE, mécanicien, pointeur ---------------- */
async function renderWorkspace() {
  execStyle();
  const d = await api('/dashboards/workspace' + (state.siteId ? '?siteId=' + state.siteId : ''));
  const u = state.user, k = d.kpis;
  const names = { STORE: 'Gestionnaire de stock', HSE: 'Agent HSE', MECHANIC: 'Mécanicien', POINTER: 'Pointeur' };
  const hello = { STORE: 'Gérez vos articles, entrées et sorties du jour.', HSE: 'Prévention, inspections et incidents de votre site.', MECHANIC: 'Interventions, diagnostics et véhicules à réparer.', POINTER: 'Pointage du jour et présence des chauffeurs.' }[d.kind];
  const rep = d.myReport ? `Rapport du jour ${stepBadge(staffStep(d.myReport))}` : `<span class="badge warn">Rapport du jour non envoyé</span>`;
  const hero = `<div class="ex-hero"><div><h2>${esc(u.firstName)} ${esc(u.lastName)}</h2><p>${names[d.kind]} — ${hello}</p></div><div class="ex-date">${rep}<br><button class="btn small" style="margin-top:6px" onclick="renderView(state.view)"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg> Actualiser</button></div></div>`;
  const act = (ico, label, view) => `<button onclick="go('${view}')"><span>${emoIc(ico)}</span>${label}</button>`;
  const atAct = (ico, label, tab) => `<button onclick="atTab='${tab}';go('atelier')"><span>${emoIc(ico)}</span>${label}</button>`;
  const ptAct = (ico, label, tab) => `<button onclick="ptTab='${tab}';go('pointage')"><span>${emoIc(ico)}</span>${label}</button>`;
  const stAct = (ico, label, tab) => `<button onclick="stockTab='${tab}';go('stock')"><span>${emoIc(ico)}</span>${label}</button>`;
  const actions = (items) => `<div class="ex-card" style="margin-bottom:14px"><h3><svg class="ic" aria-hidden="true"><use href="#i-zap"/></svg> Actions rapides</h3><div class="ex-act">${items}${act('<svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg>', 'Mon rapport du jour', 'my-report')}</div></div>`;
  const empty = (t) => `<div class="empty" style="padding:10px">${t}</div>`;
  let body = '';
  if (d.kind === 'STORE') {
    const sign = (t) => (t === 'IN' || t === 'RETURN' ? ['+', '#3F8F6B'] : ['−', '#C0504D']);
    body = `<div class="ex-kpis">${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-package"/></svg>', '#E8F0F8', fmt(k.items), 'Articles en stock')}${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-upload"/></svg>', '#E1F4E8', k.entriesToday, 'Entrées aujourd’hui')}${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-download"/></svg>', '#FDF1D6', k.exitsToday, 'Sorties aujourd’hui')}${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg>', '#FDE8E4', k.belowMinimum, 'Articles sous le seuil')}</div>
      <div class="ex-grid"><div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg> Mouvements récents <a style="font-size:12px;cursor:pointer;color:var(--navy-soft)" onclick="go('stock')">Voir tout →</a></h3>${d.recent.length ? `<div style="overflow:auto"><table><tr><th>Date</th><th>Article</th><th>Type</th><th>Qté</th><th>Destination</th></tr>${d.recent.map((r) => { const [sg, c] = sign(r.type); return `<tr><td>${drvDt(r.at)}</td><td>${esc(r.item)}</td><td style="color:${c}">${r.type === 'IN' ? 'Entrée' : r.type === 'OUT' ? 'Sortie' : esc(r.type)}</td><td style="color:${c}">${sg}${fmt(r.quantity)}</td><td>${esc(r.vehicle || r.reason || '—')}</td></tr>`; }).join('')}</table></div>` : empty('Aucun mouvement.')}</div>
      <div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-bell"/></svg> Alertes de stock</h3>${d.alerts.length ? d.alerts.map((a) => `<div class="ex-al"><div class="ex-dot" style="background:${a.quantity <= 0 ? '#C0504D' : '#C9A24D'}"></div><div><b>${esc(a.name)}</b><div style="color:var(--muted)">${fmt(a.quantity)} ${esc(a.unit)} en stock (minimum ${fmt(a.minimum)})</div></div></div>`).join('') : empty('Aucune alerte : tous les articles sont au-dessus du seuil.')}</div></div>`
      + actions(stAct('📥', 'Entrée', 'entrees') + stAct('📤', 'Sortie', 'sorties') + stAct('📋', 'Inventaire', 'inventaire') + stAct('🚨', 'Alertes stock', 'articles') + act('📝', 'États des besoins', 'needs'));
  } else if (d.kind === 'HSE') {
    const sev = { LOW: '#2F6FB5', MEDIUM: '#C9A24D', HIGH: '#C9A24D', CRITICAL: '#C0504D' };
    const ring = (v) => `<div class="ex-ring" style="background:conic-gradient(#3F8F6B ${(v || 0) * 3.6}deg,#E6ECF2 0)"><div>${v == null ? '—' : v + '%'}</div></div>`;
    body = `<div class="ex-kpis">${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-shield"/></svg>', '#E8F0F8', k.inspections, 'Inspections (mois)')}${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg>', '#FDF1D6', k.openIncidents, 'Incidents ouverts')}${exKpi('🚑', '#FDE8E4', k.accidents, 'Accidents (mois)')}${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg>', '#E1F4E8', k.compliance == null ? '—' : k.compliance + ' %', 'Conformité')}</div>
      <div class="ex-grid"><div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-hard-hat"/></svg> État sécurité</h3>${ring(k.compliance)}<div class="desc" style="text-align:center">${k.compliance == null ? 'Aucune inspection ce mois-ci' : k.compliance >= 90 ? 'Très bon niveau' : k.compliance >= 70 ? 'Niveau acceptable' : 'À améliorer'}</div></div>
      <div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-bell"/></svg> Alertes sécurité</h3>${d.incidents.length ? d.incidents.map((i) => `<div class="ex-al"><div class="ex-dot" style="background:${sev[i.severity] || '#2F6FB5'}"></div><div><b>${esc(i.type)} — ${esc(i.severity)}</b><div style="color:var(--muted)">${esc(i.description)}</div><div style="color:var(--muted);font-size:12px">${drvDt(i.at)}</div></div></div>`).join('') : empty('Aucun incident ouvert.')}</div>
      <div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-search"/></svg> Dernières inspections</h3>${d.inspections.length ? d.inspections.map((i) => `<div class="ex-row"><span>${esc(i.type)}</span><span>${drvDt(i.at)}</span><span class="badge ${i.compliant ? 'ok' : 'warn'}">${i.compliant == null ? '—' : i.compliant ? 'Conforme' : 'Non conforme'}</span></div>`).join('') : empty('Aucune inspection.')}</div></div>`
      + actions(act('🦺', 'Inspections, incidents, actions', 'dash-hse'));
  } else if (d.kind === 'MECHANIC') {
    const st = { COMPLETED: ['Terminé', 'ok'], IN_PROGRESS: ['En cours', 'warn'], PLANNED: ['Planifié', 'warn'], OVERDUE: ['En retard', 'bad'] };
    body = `<div class="ex-kpis">${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg>', '#FDE8E4', k.down, 'Véhicules en panne')}${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg>', '#FDF1D6', k.inProgress, 'Réparations en cours')}${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg>', '#E1F4E8', k.doneMonth, 'Terminées (mois)')}${exKpi('📅', '#E8F0F8', k.todo, 'Interventions à faire')}</div>
      <div class="ex-grid"><div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg> Interventions récentes <a style="font-size:12px;cursor:pointer;color:var(--navy-soft)" onclick="go('maintenance')">Voir tout →</a></h3>${d.recent.length ? `<div style="overflow:auto"><table><tr><th>Date</th><th>Véhicule</th><th>Nature</th><th>Statut</th></tr>${d.recent.map((r) => { const [t, c] = st[r.status] || [r.status, 'warn']; return `<tr><td>${drvDt(r.at)}</td><td>${esc(r.vehicle)}</td><td>${esc(r.nature)}</td><td><span class="badge ${c}">${t}</span></td></tr>`; }).join('')}</table></div>` : empty('Aucune intervention enregistrée.')}</div>
      <div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> Véhicules à l’arrêt</h3>${d.stopped.length ? d.stopped.map((v) => `<div class="ex-row"><span><b>${esc(v.vehicle)}</b> <span style="color:var(--muted)">${esc(v.plate)}</span></span><span class="badge bad">${v.status === 'MAINTENANCE' ? 'En maintenance' : 'Immobilisé'}</span></div>`).join('') : empty('Aucun véhicule à l’arrêt.')}</div></div>`
      + actions(act('➕', 'Nouvelle intervention', 'maintenance') + atAct('🚧', 'Véhicule à réparer', 'repair') + atAct('📦', 'Pièces', 'parts'));
  } else {
    body = `<div class="ex-kpis">${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-users"/></svg>', '#E8F0F8', k.total, 'Effectif total')}${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg>', '#E1F4E8', k.present, 'Présents')}${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-x"/></svg>', '#FDE8E4', k.absent, 'Absents')}${exKpi('<svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg>', '#FDF1D6', k.remaining, 'Pointage restant')}</div>
      <div class="ex-grid"><div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> Pointage du jour</h3>${k.remaining === 0 && k.total > 0 ? '<div class="msg ok">Pointage terminé : tous les chauffeurs sont pointés.</div>' : `<div class="msg err">${k.remaining} chauffeur(s) restent à pointer.</div>`}<button class="btn gold" style="margin-top:8px" onclick="go('pointage')">Faire le pointage</button>${k.others ? `<div class="desc" style="margin-top:8px">${k.others} en repos, permission ou maladie.</div>` : ''}</div>
      <div class="ex-card"><h3><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg> Absences du jour</h3>${d.absentees.length ? d.absentees.map((a) => `<div class="ex-row"><span>${esc(a.name)}</span><span style="color:var(--muted)">${esc(a.reason || '')}</span></div>`).join('') : empty('Aucune absence enregistrée.')}</div></div>`
      + actions(ptAct('🕒', 'Pointer les chauffeurs', 'presence') + ptAct('🚛', 'Compter les camions', 'camions'));
  }
  root().innerHTML = hero + body;
}
/* ---------------- POINTAGE des chauffeurs (pointeur, responsable logistique) ---------------- */
const ATT_ST = [['PRESENT', 'Présent', 'ok'], ['LATE', 'Retard', 'warn'], ['ABSENT', 'Absent', 'bad'], ['REST', 'Repos', 'warn'], ['PERMISSION', 'Permission', 'warn'], ['SICK', 'Maladie', 'warn'], ['LEAVE', 'Congé', 'warn']];
let ptTab = 'presence';
async function renderPointage() {
  const bar = `<div class="dp-tabs" id="dp-bar">${[['presence', '<svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> Présence'], ['camions', '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Camions']].map(([k, t]) => `<button class="${ptTab === k ? 'on' : ''}" onclick="ptTab='${k}';renderPointage()">${t}</button>`).join('')}</div>`;
  if (ptTab === 'camions') return renderPointCamions(bar);
  const date = window._ptDate || new Date().toISOString().slice(0, 10);
  const [drivers, att] = await Promise.all([api('/drivers?siteId=' + state.siteId), api('/drivers/attendance/day?siteId=' + state.siteId + '&date=' + date)]);
  const by = {}; att.forEach((a) => { by[a.driverId] = a; });
  const list = drivers.filter((d) => d.status === 'ACTIVE' || !d.status);
  const done = list.filter((d) => by[d.id]).length;
  window._ptDrivers = list; window._ptAtt = by;
  root().innerHTML = bar + `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> Pointage des chauffeurs</h3>
    <div class="desc">Touchez le statut de chaque chauffeur. Une correction demande un motif.</div>
    <label>Jour</label><input type="date" value="${esc(date)}" max="${new Date().toISOString().slice(0, 10)}" style="max-width:220px" onchange="window._ptDate=this.value;renderPointage()">
    <div class="msg ${done === list.length && list.length ? 'ok' : 'err'}" style="margin-top:10px">${done} / ${list.length} chauffeurs pointés</div></div>
    <div class="panel">${list.map((d) => { const a = by[d.id]; const cur = a && ATT_ST.find((s) => s[0] === a.status);
      return `<div class="drv-row" style="flex-wrap:wrap;gap:6px"><span style="min-width:150px"><b>${esc(d.lastName)}</b> ${esc(d.firstName)} ${cur ? `<span class="badge ${cur[2]}">${cur[1]}</span>` : '<span class="badge warn">Non pointé</span>'}</span>
      <span>${ATT_ST.map((s) => `<button class="btn small ${a && a.status === s[0] ? 'gold' : ''}" style="margin:2px;min-height:44px;min-width:44px" onclick="ptMark('${esc(d.id)}','${s[0]}')">${s[1]}</button>`).join('')}</span></div>`; }).join('') || '<div class="empty">Aucun chauffeur enregistré.</div>'}</div>`;
}
async function renderPointCamions(bar) {
  const date = window._ptDate || new Date().toISOString().slice(0, 10);
  const r = await api('/pointer/day?date=' + date + '&siteId=' + encodeURIComponent(state.siteId || ''));
  window._ptCount = {}; r.rows.forEach((x) => { window._ptCount[x.vehicleId] = x; });
  const done = r.rows.filter((x) => x.pointer).length;
  root().innerHTML = bar + `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Comptage des camions à la barrière</h3>
    <div class="desc">Saisissez ce que vous avez compté : mouvements et tonnes de chaque camion.</div>
    <label>Jour</label><input type="date" value="${esc(date)}" max="${new Date().toISOString().slice(0, 10)}" style="max-width:220px" onchange="window._ptDate=this.value;renderPointage()">
    <div class="msg ${done === r.rows.length && r.rows.length ? 'ok' : 'err'}" style="margin-top:10px">${done} / ${r.rows.length} camions comptés</div></div>
    <div class="panel">${r.rows.map((x) => `<div class="drv-row" style="flex-wrap:wrap;gap:8px;align-items:center"><span style="min-width:150px"><b>${esc(x.vehicle)}</b> ${x.pointer ? '<span class="badge ok">Compté</span>' : '<span class="badge warn">À compter</span>'}${x.locked ? ' <span class="badge info"><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg> Validé</span>' : ''}</span>
      <span style="display:flex;gap:6px;flex-wrap:wrap"><input id="pc-m-${esc(x.vehicleId)}" type="number" inputmode="numeric" min="0" placeholder="Mouvements" value="${x.pointer ? x.pointer.movements : ''}" style="width:120px;min-height:44px" ${x.locked ? 'disabled' : ''}><input id="pc-t-${esc(x.vehicleId)}" type="number" inputmode="decimal" min="0" step="0.1" placeholder="Tonnes" value="${x.pointer ? x.pointer.tons : ''}" style="width:100px;min-height:44px" ${x.locked ? 'disabled' : ''}>
      <button class="btn small gold" style="min-height:44px" ${x.locked ? 'disabled' : ''} onclick="ptCount('${esc(x.vehicleId)}')">${x.pointer ? 'Corriger' : 'Enregistrer'}</button></span></div>`).join('') || '<div class="empty">Aucun camion.</div>'}<div id="pc-msg"></div></div>`;
}
async function ptCount(vehicleId) {
  const date = window._ptDate || new Date().toISOString().slice(0, 10), prev = (window._ptCount || {})[vehicleId] && window._ptCount[vehicleId].pointer;
  const m = document.getElementById('pc-m-' + vehicleId).value, t = document.getElementById('pc-t-' + vehicleId).value;
  const msg = document.getElementById('pc-msg');
  if (m === '' || t === '' || isNaN(Number(m)) || isNaN(Number(t))) { msg.innerHTML = '<div class="msg err">Saisissez les mouvements et les tonnes.</div>'; return; }
  const body = { vehicleId, day: date, movements: Math.round(Number(m)), tons: Number(t) };
  if (prev) { if (prev.movements === body.movements && prev.tons === body.tons) return; const c = prompt('Comptage déjà saisi. Motif de la correction :', ''); if (!c || c.trim().length < 3) return; body.correctionReason = c.trim(); }
  try { await api('/pointer/count?siteId=' + encodeURIComponent(state.siteId || ''), { method: 'POST', body }); renderPointage(); } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function ptMark(driverId, status) {
  const date = window._ptDate || new Date().toISOString().slice(0, 10), prev = (window._ptAtt || {})[driverId];
  const body = { driverId, siteId: state.siteId, date, status };
  if (status === 'ABSENT') { const r = prompt("Motif de l'absence (obligatoire) :", prev && prev.absenceReason || ''); if (!r || r.trim().length < 2) return; body.absenceReason = r.trim(); }
  if (prev) { if (prev.status === status && status !== 'ABSENT') return; const c = prompt('Pointage déjà saisi. Motif de la correction :', ''); if (!c || c.trim().length < 3) return; body.correctionReason = c.trim(); }
  if (status === 'PRESENT') body.checkIn = new Date().toISOString();
  try { await api('/drivers/attendance', { method: 'POST', body }); renderPointage(); } catch (e) { alert(e.message); }
}

/* ---------------- RESPONSABLES : le Master Admin enregistre le DG et le Responsable logistique et leur envoie le lien ---------------- */
const MGR_ROLES = { DIRECTEUR_GENERAL: 'Directeur Général', ADMIN_LOGISTIQUE: 'Responsable logistique', RESPONSABLE_OPERATIONS: 'Responsable des opérations', COMPTABLE: 'Comptabilité' };
async function renderManagers() {
  root().innerHTML = `
    <div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-building"/></svg> Responsables de l'entreprise</h3>
      <div class="desc">Vous enregistrez ici le Directeur Général et le Responsable logistique, puis vous leur envoyez le lien de l'application par WhatsApp. Chacun arrive directement dans son propre espace.</div></div>
    <div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Nouveau responsable</h3>
      <div class="grid-2"><div><label>Fonction</label><select id="st-role">${Object.entries(MGR_ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div><label>Prénom</label><input id="st-first"></div><div><label>Nom</label><input id="st-last"></div><div><label>Téléphone (WhatsApp)</label><input id="st-phone" type="tel" placeholder="6xx xx xx xx"></div></div>
      <button class="btn gold" onclick="mgSave()">Enregistrer et préparer le message</button><div id="st-msg"></div></div>
    <div class="panel"><h3>Responsables enregistrés</h3><div id="st-team"><div class="empty">Chargement…</div></div><div id="st-inv"></div></div>`;
  mgLoad();
}
async function mgLoad() {
  const box = document.getElementById('st-team'); if (!box) return;
  try {
    const team = await api('/staff?role=DIRECTEUR_GENERAL,ADMIN_LOGISTIQUE');
    box.innerHTML = team.length ? `<div style="overflow:auto"><table><tr><th>Fonction</th><th>Nom</th><th>Téléphone</th><th>Application</th><th></th></tr>${team.map((u) => `<tr><td>${esc(MGR_ROLES[u.role] || u.role)}</td><td><b>${esc(u.lastName)}</b> ${esc(u.firstName)}</td><td>${esc(u.phone || '—')}</td>
      <td>${u.neverConnected ? '<span class="badge warn">Pas encore connecté</span>' : '<span class="badge ok">Connecté</span>'}</td>
      <td><button class="btn small gold" onclick="stInvite('${esc(u.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-message"/></svg> Envoyer le lien par WhatsApp</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Aucun responsable enregistré.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
/* ---------------- GESTION DU PERSONNEL (hiérarchie : chacun gère uniquement son domaine, contrôlé aussi côté serveur) ---------------- */
const PERS_CFG = {
  ADMIN_LOGISTIQUE: { title: 'GESTION DU PERSONNEL LOGISTIQUE', desc: "Enregistrez vos collaborateurs, activez ou désactivez leur compte et envoyez-leur une invitation individuelle par WhatsApp. Les chauffeurs (permis, véhicule, appareil) se gèrent dans « Équipes terrain ».", roles: { MAGASINIER: 'Gestionnaire de stock', MECANICIEN: 'Mécanicien', POINTEUR: 'Pointeur' } },
  DIRECTEUR_GENERAL: { title: 'GESTION DES RESPONSABLES', desc: "Créez les comptes de vos responsables, puis envoyez à chacun son invitation individuelle par WhatsApp. Chacun arrive directement dans son propre espace.", roles: { ADMIN_LOGISTIQUE: 'Responsable logistique', RESPONSABLE_OPERATIONS: 'Responsable des opérations', COMPTABLE: 'Comptabilité', GESTIONNAIRE_HSE: 'Responsable HSE' } },
};
const PERS_ST = { ACTIVE: ['Actif', 'ok'], SUSPENDED: ['Suspendu', 'warn'], DISABLED: ['Désactivé', 'bad'] };
async function renderPersonnel() {
  const cfg = PERS_CFG[state.user.role];
  if (!cfg) { root().innerHTML = '<div class="panel"><div class="msg err">Cet espace n\'est pas disponible pour votre fonction.</div></div>'; return; }
  root().innerHTML = `
    <div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-users"/></svg> ${cfg.title}</h3><div class="desc">${esc(cfg.desc)}</div>
      <div id="pe-sum" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px"></div></div>
    <div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Nouveau collaborateur</h3>
      <h4 style="margin:6px 0 4px">Identité</h4><div class="grid-2"><div><label>Prénom</label><input id="pe-first" autocomplete="off"></div><div><label>Nom</label><input id="pe-last" autocomplete="off"></div></div>
      <h4 style="margin:10px 0 4px">Contact</h4><div><label>Téléphone (WhatsApp)</label><input id="pe-phone" type="tel" placeholder="6xx xx xx xx"></div>
      <h4 style="margin:10px 0 4px">Fonction</h4><div><select id="pe-role">${Object.entries(cfg.roles).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
      <button class="btn gold" style="margin-top:12px" onclick="peSave()">Enregistrer et préparer l'invitation WhatsApp</button><div id="pe-msg"></div></div>
    <div class="panel"><h3>Personnel enregistré</h3><div id="pe-list"><div class="empty">Chargement…</div></div><div id="st-inv"></div></div>`;
  peLoad();
}
async function peLoad() {
  const cfg = PERS_CFG[state.user.role], box = document.getElementById('pe-list'); if (!cfg || !box) return;
  try {
    const list = await api('/staff?role=' + Object.keys(cfg.roles).join(',')); window._peList = list;
    const act = list.filter((u) => u.status === 'ACTIVE').length, off = list.filter((u) => u.status !== 'ACTIVE').length, wait = list.filter((u) => u.neverConnected && u.status === 'ACTIVE').length;
    const tile = (n, l, c) => `<div style="flex:1;min-width:100px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px;text-align:center"><div style="font-size:20px;font-weight:700;color:${c}">${n}</div><div style="font-size:12px;color:var(--muted)">${l}</div></div>`;
    document.getElementById('pe-sum').innerHTML = tile(act, 'Comptes actifs', '#3F8F6B') + tile(wait, 'Invitations en attente', '#C9A24D') + tile(off, 'Suspendus / désactivés', '#B33A32');
    box.innerHTML = list.length ? `<div style="overflow:auto"><table><tr><th>Nom</th><th>Fonction</th><th>Téléphone</th><th>Compte</th><th>Invitation</th><th></th></tr>${list.map((u) => { const st = PERS_ST[u.status] || [u.status, 'warn'];
      return `<tr><td><b>${esc(u.firstName + ' ' + u.lastName)}</b></td><td>${esc(cfg.roles[u.role] || u.role)}</td><td>${esc(u.phone || '—')}</td><td><span class="badge ${st[1]}">${st[0]}</span></td>
      <td>${u.neverConnected ? '<span class="badge warn">En attente</span>' : '<span class="badge ok">Acceptée</span>'}</td>
      <td style="white-space:nowrap"><button class="btn small" onclick="peEdit('${esc(u.id)}')">Modifier</button> ${u.status === 'ACTIVE' ? `<button class="btn small" onclick="peStatus('${esc(u.id)}','DISABLED')">Désactiver</button> <button class="btn small gold" onclick="stInvite('${esc(u.id)}')">Invitation WhatsApp</button>` : `<button class="btn small primary" onclick="peStatus('${esc(u.id)}','ACTIVE')">Réactiver</button>`}</td></tr>`; }).join('')}</table></div>` : '<div class="empty">Aucun collaborateur enregistré pour le moment.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function peSave() {
  const m = document.getElementById('pe-msg'), g = (id) => document.getElementById(id).value.trim();
  if (!g('pe-first') || !g('pe-last')) { m.innerHTML = '<div class="msg err">Prénom et nom obligatoires.</div>'; return; }
  if (g('pe-phone').replace(/\D/g, '').length < 8) { m.innerHTML = '<div class="msg err">Numéro de téléphone obligatoire : l\'invitation est envoyée par WhatsApp.</div>'; return; }
  try {
    const r = await api('/staff', { method: 'POST', body: { firstName: g('pe-first'), lastName: g('pe-last'), phone: g('pe-phone'), role: g('pe-role'), siteId: state.siteId } });
    m.innerHTML = '<div class="msg ok">Compte enregistré.</div>';
    ['pe-first', 'pe-last', 'pe-phone'].forEach((id) => { document.getElementById(id).value = ''; });
    await stInvite(r.id); peLoad();
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function peStatus(id, status) {
  const u = (window._peList || []).find((x) => x.id === id); if (!u) return;
  if (status !== 'ACTIVE' && !confirm('Désactiver le compte de ' + u.firstName + ' ' + u.lastName + ' ? Il sera déconnecté aussitôt ; ses données sont conservées et vous pourrez le réactiver.')) return;
  try { await api('/staff/' + encodeURIComponent(id) + '/status', { method: 'POST', body: { status } }); } catch (e) { alert(e.message); }
  peLoad();
}
function peEdit(id) {
  const u = (window._peList || []).find((x) => x.id === id); if (!u) return;
  const old = document.getElementById('pe-overlay'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = 'pe-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,39,71,.55);z-index:1000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:12px';
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  ov.innerHTML = `<div class="panel" style="max-width:480px;width:100%;margin:20px auto"><h3>Modifier le collaborateur</h3>
    <label>Prénom</label><input id="pe-ef" value="${esc(u.firstName)}"><label>Nom</label><input id="pe-el" value="${esc(u.lastName)}"><label>Téléphone (WhatsApp)</label><input id="pe-ep" type="tel" value="${esc(u.phone || '')}">
    <div id="pe-emsg"></div><div style="margin-top:12px;display:flex;gap:8px"><button class="btn gold" onclick="peEditSave('${esc(id)}')">Enregistrer</button><button class="btn" onclick="document.getElementById('pe-overlay').remove()">Annuler</button></div></div>`;
  document.body.appendChild(ov);
}
async function peEditSave(id) {
  const m = document.getElementById('pe-emsg'), g = (x) => document.getElementById(x).value.trim();
  try { await api('/staff/' + encodeURIComponent(id), { method: 'PATCH', body: { firstName: g('pe-ef'), lastName: g('pe-el'), phone: g('pe-ep') } }); document.getElementById('pe-overlay').remove(); peLoad(); }
  catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function mgSave() {
  const m = document.getElementById('st-msg'), g = (id) => document.getElementById(id).value.trim();
  if (!g('st-first') || !g('st-last')) { m.innerHTML = '<div class="msg err">Prénom et nom obligatoires.</div>'; return; }
  if (g('st-phone').replace(/\D/g, '').length < 8) { m.innerHTML = '<div class="msg err">Numéro de téléphone obligatoire (le lien est envoyé par WhatsApp).</div>'; return; }
  try {
    const r = await api('/staff', { method: 'POST', body: { firstName: g('st-first'), lastName: g('st-last'), phone: g('st-phone'), role: g('st-role'), siteId: state.siteId } });
    m.innerHTML = '<div class="msg ok">Enregistré.</div>';
    await stInvite(r.id); mgLoad();
    ['st-first', 'st-last', 'st-phone'].forEach((id) => { document.getElementById(id).value = ''; });
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function stReject(id) { const note = prompt('Motif du rejet (le personnel pourra corriger et renvoyer) :'); if (!note) return; try { await api('/staff/reports/' + id + '/reject', { method: 'POST', body: { note } }); (document.getElementById('st-reports') ? stLoad : renderOpsValidation)(); } catch (e) { alert(e.message); } }
async function stValidate(id) { try { await api('/staff/reports/' + id + '/validate', { method: 'POST', body: {} }); renderOpsValidation(); } catch (e) { alert(e.message); } }
async function stReceive(id) { try { await api('/staff/reports/' + id + '/receive', { method: 'POST', body: {} }); stLoad(); } catch (e) { alert(e.message); } }
// Côté agent HSE / magasinier : « Mon rapport du jour »
async function renderMyReport() {
  const today = new Date().toISOString().slice(0, 10);
  const list = await api('/staff/reports/mine');
  const cur = list.find((r) => r.date === today);
  root().innerHTML = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg> Mon rapport du jour</h3>
    <div class="desc">Décrivez vos activités de la journée : votre responsable le reçoit directement.</div>
    <label>Date</label><input id="mr-date" type="date" value="${today}" max="${today}" style="max-width:220px">
    <label>Activités de la journée</label><textarea id="mr-act" rows="6" placeholder="Ex : réception de 20 cartons, 3 sorties pour le camion RC-1, inventaire de l'allée B…">${esc(cur ? cur.activities : '')}</textarea>
    <label>Observations (facultatif)</label><textarea id="mr-obs" rows="3">${esc(cur && cur.observations ? cur.observations : '')}</textarea>
    <button class="btn gold" onclick="sendMyReport()"><svg class="ic" aria-hidden="true"><use href="#i-upload"/></svg> Envoyer mon rapport</button><div id="mr-msg"></div></div>
    <div class="panel"><h3>Mes derniers rapports</h3>${list.length ? list.map((r) => `<div class="drv-row"><span>${esc(r.date)}${r.rejectNote ? '<br><small style="color:var(--bad-fg)">Rejeté : ' + esc(r.rejectNote) + ' — corrigez puis renvoyez.</small>' : ''}</span>${stepBadge(staffStep(r))}</div>`).join('') : '<div class="empty">Aucun rapport envoyé.</div>'}</div>`;
}
async function sendMyReport() {
  const m = document.getElementById('mr-msg');
  try {
    await api('/staff/reports', { method: 'POST', body: { date: document.getElementById('mr-date').value, activities: document.getElementById('mr-act').value, observations: document.getElementById('mr-obs').value || undefined } });
    m.innerHTML = '<div class="msg ok">Rapport envoyé à votre responsable.</div>'; setTimeout(renderMyReport, 900);
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function dailyTripsTable(r) {
  if (!r.trips.list.length) return '';
  const hh = (d) => (d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '…');
  const rows = r.trips.list.map((x) => `<tr>
    <td><b>${esc(x.plate)}</b><div style="font-size:12px;color:var(--muted)">${esc(x.brand)}</div></td>
    <td>${esc(x.driver.split(' (')[0])}<div style="font-size:12px;color:var(--muted)">${esc(x.phone)}</div></td>
    <td>${esc(x.destination || x.regions.join(', ') || '—')}${x.cargo ? '<div style="font-size:12px">' + esc(x.cargo) + '</div>' : ''}${x.loadPlaces && x.loadPlaces.length ? '<div style="font-size:12px"><svg class="ic" aria-hidden="true"><use href="#i-upload"/></svg> ' + esc(x.loadPlaces.join(', ')) + ' → <svg class="ic" aria-hidden="true"><use href="#i-download"/></svg> ' + esc((x.unloadPlaces || []).join(', ')) + '</div>' : ''}</td>
    <td>${hh(x.startTime)} → ${hh(x.endTime)}${x.voyages ? '<div style="font-size:12px">' + x.voyages + ' mouvement(s)' + (x.tons ? ' = ' + x.tons + ' t' : '') + '</div>' : ''}${x.pauseMileage != null ? '<div style="font-size:12px">pause ' + fmt(x.pauseMileage) + ' km</div>' : ''}</td>
    <td class="mono">${fmt(x.startMileage)} → ${x.endMileage !== null ? fmt(x.endMileage) : '…'}${x.fuelMileages.length ? '<div style="font-size:12px">plein : ' + x.fuelMileages.map(fmt).join(', ') + '</div>' : ''}</td>
    <td class="mono"><b>${fmt(x.km)} km</b></td>
    <td class="mono">${x.tankStart !== null || x.tankEnd !== null ? 'Réservoir ' + (x.tankStart ?? '?') + ' → ' + (x.tankEnd ?? '?') + ' L' + (x.tankUsed !== null ? '<div style="font-size:12px">' + x.tankUsed + ' L utilisés</div>' : '') : ''}<div style="font-size:12px">${x.liters ? 'Pleins : ' + x.liters + ' L · ' + fmt(x.fuelCost) + ' GNF' : 'Aucun plein'}${x.consumption !== null ? ' · ' + x.consumption + ' L/100' : ''}</div></td>
    <td>${x.condition === 'ANOMALIE' ? '<span class="badge warn">Anomalie</span> ' + esc(x.anomalies) : ''}${x.maintenanceNeeded ? '<div><span class="badge bad">Maintenance</span> ' + esc(x.maintenanceReason) + '</div>' : ''}</td></tr>`).join('');
  return `<div style="overflow:auto;margin-top:14px"><table><tr><th>Véhicule</th><th>Chauffeur</th><th>Destination / motif</th><th>Horaires</th><th>Compteur</th><th>Distance</th><th>Carburant</th><th>Observations</th></tr>${rows}</table></div>`;
}
async function loadDaily() {
  const body = document.getElementById('d-body');
  try {
    const date = document.getElementById('d-date').value;
    const { report: r, text: reportText } = await api('/reports/daily?siteId=' + state.siteId + '&kind=' + dailyKind + '&date=' + date);
    dailyText = reportText;
    const f = r.fleet;
    body.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-label">${dailyKind === 'TRUCK' ? 'Camions' : 'Véhicules de service'} disponibles</div><div class="kpi-value mono">${f.available}/${f.total}</div><div class="kpi-sub">${f.onMission} en mission • ${f.maintenance + f.immobilized} indisponibles</div></div>
        <div class="kpi-card"><div class="kpi-label">Missions</div><div class="kpi-value mono">${r.trips.count}</div><div class="kpi-sub">${fmt(r.trips.totalKm)} km • ${r.drivers.onDuty} chauffeur(s) en service</div></div>
        <div class="kpi-card"><div class="kpi-label">Carburant du jour (pleins)</div><div class="kpi-value mono">${fmt(r.fuel.liters)} L</div><div class="kpi-sub">${fmt(r.fuel.cost)} GNF • semaine : ${fmt(r.fuel.week.liters)} L</div></div>
      </div>
      ${dailyTripsTable(r)}
      <label style="margin-top:14px">Texte du rapport (corps du message envoyé par e-mail)</label>
      <pre class="mono" style="white-space:pre-wrap; margin:6px 0 14px;">${esc(reportText)}</pre>
      <button class="btn gold" onclick="downloadDailyPdf()"><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Télécharger le PDF</button>
      <button class="btn" style="margin-left:8px;" onclick="printDaily()"><svg class="ic" aria-hidden="true"><use href="#i-printer"/></svg> Imprimer</button>
      <button class="btn" style="margin-left:8px;" onclick="saveDailyToFolder()"><svg class="ic" aria-hidden="true"><use href="#i-save"/></svg> Enregistrer dans un dossier</button>
      <div class="grid-2" style="margin-top:14px;">
        <div><label>Hiérarchie — e-mail(s) du/des destinataire(s)</label><input id="d-email" value="${esc(dailyEmails)}" placeholder="chef@entreprise.com, directeur@entreprise.com" /></div>
        <div><label>Comptabilité — e-mail(s)</label><input id="d-acc" value="${esc(dailyAccEmails)}" placeholder="compta@entreprise.com" /></div>
      </div>
      <button class="btn" onclick="sendDailyEmail('HIERARCHY')"><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg> Envoyer à la hiérarchie (PDF joint)</button>
      <button class="btn" style="margin-left:8px;" onclick="sendDailyEmail('ACCOUNTING')"><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg> Envoyer à la comptabilité (PDF joint)</button>
      <div id="d-msg"></div>`;
  } catch (e) { body.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function dailyPdfPath() {
  return '/reports/daily/export/pdf?siteId=' + state.siteId + '&kind=' + dailyKind + '&date=' + document.getElementById('d-date').value;
}
async function downloadDailyPdf() {
  const msg = document.getElementById('d-msg');
  try {
    const blob = await api(dailyPdfPath());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rapport_du_jour_' + (dailyKind === 'TRUCK' ? 'camions_' : 'vehicules_service_') + document.getElementById('d-date').value + '.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
// Impression directe du PDF du rapport (boîte de dialogue d'impression du navigateur)
async function printDaily() {
  const msg = document.getElementById('d-msg');
  try {
    const blob = await api(dailyPdfPath());
    const url = URL.createObjectURL(blob);
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    fr.src = url;
    fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { window.open(url, '_blank'); } setTimeout(() => { fr.remove(); URL.revokeObjectURL(url); }, 60000); };
    document.body.appendChild(fr);
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
// Enregistre le PDF dans un dossier choisi (PC : Chrome/Edge ; téléphone : dossier Téléchargements)
async function saveDailyToFolder() {
  const msg = document.getElementById('d-msg');
  try {
    const name = 'rapport_du_jour_' + (dailyKind === 'TRUCK' ? 'camions_' : 'vehicules_service_') + document.getElementById('d-date').value + '.pdf';
    const blob = await api(dailyPdfPath());
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Document PDF', accept: { 'application/pdf': ['.pdf'] } }] });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      msg.innerHTML = '<div class="msg ok">Rapport enregistré dans le dossier choisi.</div>';
    } else {
      await downloadDailyPdf();
      msg.innerHTML = '<div class="msg ok">Rapport téléchargé : retrouvez-le dans le dossier « Téléchargements » de l\'appareil.</div>';
    }
  } catch (e) { if (e.name !== 'AbortError') msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function sendDailyEmail(audience) {
  const msg = document.getElementById('d-msg');
  try {
    const r = await api('/reports/daily/send-email', { method: 'POST', body: {
      to: document.getElementById(audience === 'ACCOUNTING' ? 'd-acc' : 'd-email').value,
      kind: dailyKind, audience,
      siteId: state.siteId,
      date: document.getElementById('d-date').value,
    }});
    msg.innerHTML = r.sent
      ? '<div class="msg ok">E-mail envoyé avec le PDF en pièce jointe.</div>'
      : '<div class="msg err">' + esc(r.message || 'Envoi e-mail non configuré sur le serveur (SMTP).') + ' Le message n\'a pas été envoyé : utilisez le PDF (télécharger ou imprimer) en attendant.</div>';
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function saveDailyNumbers() {
  const msg = document.getElementById('d-nmsg');
  try {
    await api('/settings/REPORT_WHATSAPP_NUMBERS', { method: 'PUT', body: { value: document.getElementById('d-numbers').value } });
    await api('/settings/REPORT_EMAIL_RECIPIENTS', { method: 'PUT', body: { value: document.getElementById('d-emails').value } });
    await api('/settings/REPORT_ACCOUNTING_EMAILS', { method: 'PUT', body: { value: document.getElementById('d-acc-emails').value } });
    msg.innerHTML = '<div class="msg ok">Destinataires enregistrés.</div>';
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ---------------- SYNC ---------------- */
async function renderSync() {
  const pending = await api('/sync/pending-count');
  const log = await api('/sync/log');
  const rows = log.map(l => `<tr><td>${esc(l.entity)}</td><td>${esc(l.operation)}</td><td>${statusBadge(l.status === 'SUCCESS' ? 'AVAILABLE' : l.status === 'FAILED' ? 'IMMOBILIZED' : 'ON_MISSION')}</td><td>${new Date(l.createdAt).toLocaleString('fr-FR')}</td></tr>`).join('') || `<tr><td colspan="4" class="empty">Aucune opération de synchronisation.</td></tr>`;

  root().innerHTML = `
    <div class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg> État de la synchronisation</h3>
      <div class="desc">Cette interface web fonctionne en ligne. Le mode Offline complet (file d'attente locale, synchronisation automatique au retour du réseau) est porté par l'application Flutter mobile/desktop — l'API expose déjà <code>/sync/push</code> pour cela.</div>
      <div class="kpi-grid" style="margin-top:14px;">
        <div class="kpi-card"><div class="kpi-label">Opérations en attente</div><div class="kpi-value mono">${pending}</div></div>
      </div>
    </div>
    <div class="panel">
      <h3>Journal de synchronisation</h3>
      <table><thead><tr><th>Entité</th><th>Opération</th><th>Statut</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
}

/* ---------------- SETTINGS ---------------- */
async function loadUserDevices() {
  const box = document.getElementById('ud-list'); if (!box) return;
  try {
    const rows = await api('/user-devices');
    const st = { ACTIVE: ['Autorisé', 'ok'], REFUSED: ['Refusé', 'warn'], BLOCKED: ['Bloqué', 'bad'] };
    box.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Utilisateur</th><th>Appareil</th><th>Dernière connexion</th><th>Statut</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td><b>${esc(r.lastName)}</b> ${esc(r.firstName)}<br><small>${esc(r.role)}</small></td><td>${r.kind === 'DESKTOP' ? 'Ordinateur' : 'Téléphone'}<br><small>${esc((r.name || '').slice(0, 60))}</small></td><td>${esc(new Date(r.lastSeen).toLocaleString('fr-FR'))}</td><td><span class="badge ${st[r.status][1]}">${st[r.status][0]}${r.attempts ? ' (' + r.attempts + '/3)' : ''}</span></td><td><button class="btn small" onclick="releaseUserDevice('${esc(r.id)}')">Libérer</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aucun appareil enregistré pour le moment.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function releaseUserDevice(id) {
  if (!confirm('Libérer cet appareil ? L\'utilisateur pourra enregistrer un nouvel appareil à sa prochaine connexion.')) return;
  try { await api('/user-devices/' + id + '/release', { method: 'POST' }); loadUserDevices(); } catch (e) { alert(e.message); }
}
function renderSettings() {
  root().innerHTML = `
    <div class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-settings"/></svg> Paramètres de connexion</h3>
      ${state.user && state.user.role === 'SUPER_ADMIN' ? `<label>URL de l'API (administrateur)</label>
      <input id="s-api" value="${esc(state.apiUrl)}" />` : ''}
      <label>Identifiant de site (siteId)</label>
      <input id="s-site" value="${esc(state.siteId)}" />
      <button class="btn gold" onclick="saveSettings()">Enregistrer</button>
      <div id="s-msg"></div>
    </div>
    ${pinPanel()}
    ${state.user && state.user.role === 'SUPER_ADMIN' ? '<div class="panel" id="ud-panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-shield"/></svg> Appareils autorisés des utilisateurs</h3><div class="desc">Directeur général : 1 ordinateur et 1 téléphone. Autres profils : 1 appareil. Un autre appareil est refusé et signalé ; libérez la place pour autoriser un changement.</div><div id="ud-list">Chargement…</div></div>' : ''}
    <div class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-key"/></svg> Changer mon mot de passe</h3>
      <label>Mot de passe actuel</label><input id="pw-old" type="password" autocomplete="current-password" />
      <label>Nouveau mot de passe (8 caractères minimum, avec une lettre et un chiffre)</label><input id="pw-new" type="password" autocomplete="new-password" />
      <label>Confirmer le nouveau mot de passe</label><input id="pw-new2" type="password" autocomplete="new-password" />
      <label style="display:flex; align-items:center; gap:6px; margin-top:6px;"><input type="checkbox" onchange="['pw-old','pw-new','pw-new2'].forEach(i => document.getElementById(i).type = this.checked ? 'text' : 'password')" style="width:auto;" /> Afficher les mots de passe</label>
      <button class="btn gold" style="margin-top:8px;" onclick="changePassword()">Changer le mot de passe</button>
      <div id="pw-msg"></div>
    </div>
    <div class="panel">
      <h3>Compte</h3>
      <div class="desc">${esc(state.user.firstName)} ${esc(state.user.lastName)} — ${roleLabel(state.user.role)}${state.user.department ? ' — Département : ' + esc(deptLabel(state.user.department)) : ''}</div>
    </div>
    ${['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role) ? `<div class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-users"/></svg> Utilisateurs et départements</h3>
      <div class="desc">Un utilisateur rattaché à un département ne peut modifier que les données de son département (consultation libre). « Tous » = aucune restriction. L'Administrateur Général a toujours un accès global.</div>
      <div id="u-body"><div class="empty">Chargement…</div></div>
      <div id="u-msg"></div>
    </div>` : ''}`;
  if (['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role)) loadUsersPanel();
  brandPanel(); loadUserDevices();
  if (['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'DIRECTEUR_GENERAL'].includes(state.user.role)) {
    const p = document.createElement('div'); p.className = 'panel'; p.id = 'nb-panel';
    p.innerHTML = '<h3>Numérotation des documents</h3><div class="desc">Préfixe, nombre de chiffres et remise à zéro de chaque type de document. Les numéros déjà émis ne changent jamais.</div><div id="nb-body"><div class="empty">Chargement…</div></div><div id="nb-msg"></div>';
    root().appendChild(p); loadNumbering();
  }
}
async function loadNumbering() {
  const body = document.getElementById('nb-body'); if (!body) return;
  const canEdit = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role);
  try {
    const rows = await api('/settings/numbering');
    body.innerHTML = `<div style="overflow-x:auto"><table><thead><tr><th>Document</th><th>Préfixe</th><th>Chiffres</th><th>Année</th><th>Remise à zéro</th><th>Dernier</th><th>Prochain</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(r => `<tr>
      <td>${esc(r.label)}</td>
      <td>${canEdit ? `<input id="nb-p-${r.code}" value="${esc(r.prefix)}" maxlength="8" style="width:70px;text-transform:uppercase" />` : esc(r.prefix)}</td>
      <td>${canEdit ? `<input id="nb-d-${r.code}" type="number" min="3" max="8" value="${r.pad}" style="width:60px" />` : r.pad}</td>
      <td>${canEdit ? `<input id="nb-y-${r.code}" type="checkbox" ${r.includeYear ? 'checked' : ''} />` : (r.includeYear ? 'Oui' : 'Non')}</td>
      <td>${canEdit ? `<select id="nb-r-${r.code}"><option value="1" ${r.resetYearly ? 'selected' : ''}>Chaque année</option><option value="0" ${r.resetYearly ? '' : 'selected'}>Jamais</option></select>` : (r.resetYearly ? 'Chaque année' : 'Jamais')}</td>
      <td>${r.lastNumber || '—'}</td><td><b>${esc(r.example)}</b></td>
      ${canEdit ? `<td><button class="btn small" onclick="saveNumbering('${r.code}')">Enregistrer</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  } catch (e) { body.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function saveNumbering(code) {
  const msg = document.getElementById('nb-msg');
  try {
    const g = (k) => document.getElementById('nb-' + k + '-' + code);
    await api('/settings/numbering/' + code, { method: 'PUT', body: { prefix: g('p').value.trim().toUpperCase(), pad: parseInt(g('d').value, 10), includeYear: g('y').checked, resetYearly: g('r').value === '1' } });
    msg.innerHTML = '<div class="msg ok">Numérotation enregistrée : elle s\'applique aux prochains documents.</div>';
    loadNumbering();
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function changePassword() {
  const msg = document.getElementById('pw-msg');
  const v = (i) => document.getElementById(i).value;
  try {
    if (v('pw-new').length < 8 || !/[A-Za-z]/.test(v('pw-new')) || !/\d/.test(v('pw-new'))) throw new Error('Le nouveau mot de passe doit avoir au moins 8 caractères, avec une lettre et un chiffre.');
    if (v('pw-new') !== v('pw-new2')) throw new Error('La confirmation ne correspond pas au nouveau mot de passe.');
    await api('/auth/change-password', { method: 'POST', body: { currentPassword: v('pw-old'), newPassword: v('pw-new') } });
    ['pw-old', 'pw-new', 'pw-new2'].forEach(i => { document.getElementById(i).value = ''; });
    msg.innerHTML = '<div class="msg ok">Mot de passe changé. Utilisez-le à votre prochaine connexion.</div>';
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function deptLabel(d) {
  return { LOGISTIQUE: 'Logistique', CARBURANT: 'Carburant', STOCK: 'Stock', RH: 'Ressources humaines' }[d] || d;
}
async function loadUsersPanel() {
  const body = document.getElementById('u-body');
  try {
    const users = await api('/users');
    const opts = (cur) => ['', 'LOGISTIQUE', 'CARBURANT', 'STOCK', 'RH']
      .map(d => `<option value="${d}" ${(cur || '') === d ? 'selected' : ''}>${d ? deptLabel(d) : 'Tous (sans restriction)'}</option>`).join('');
    body.innerHTML = `<table><thead><tr><th>Nom</th><th>Rôle</th><th>Département</th><th>Session</th></tr></thead><tbody>${users.map(u => `
      <tr><td>${esc(u.firstName)} ${esc(u.lastName)}</td><td>${roleLabel(u.role.name)}</td>
      <td>${u.role.name === 'SUPER_ADMIN' ? 'Accès global' : `<select onchange="setUserDepartment('${esc(u.id)}', this.value)">${opts(u.department)}</select>`}</td>
      <td>${u.id === (state.user && state.user.id) ? '—' : `<button class="btn small" onclick="revokeUserSessions('${esc(u.id)}')">Déconnecter</button>`}</td></tr>`).join('')}</tbody></table>${state.user && state.user.role === 'SUPER_ADMIN' ? `<div style="margin-top:12px"><button class="btn" onclick="revokeAllSessions()">Déconnecter tous les appareils</button><div class="desc" style="margin-top:4px">Ferme les sessions de tous les utilisateurs, sauf la vôtre. Aucun compte ni donnée n'est touché.</div></div>` : ''}`;
  } catch (e) { body.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function revokeUserSessions(id) {
  const msg = document.getElementById('u-msg');
  if (!confirm('Déconnecter cet utilisateur ? Son compte et ses données restent intacts.')) return;
  try { const r = await api('/users/' + id + '/revoke-sessions', { method: 'POST' }); msg.innerHTML = `<div class="msg ok">${esc(r.message)}</div>`; } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function revokeAllSessions() {
  const msg = document.getElementById('u-msg');
  if (!confirm('Déconnecter tous les utilisateurs (sauf vous) ? Aucun compte ni donnée ne sera supprimé.')) return;
  try { const r = await api('/users/revoke-all-sessions', { method: 'POST' }); msg.innerHTML = `<div class="msg ok">${esc(r.message)}</div>`; } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function setUserDepartment(id, value) {
  const msg = document.getElementById('u-msg');
  try {
    await api('/users/' + id, { method: 'PATCH', body: { department: value || null } });
    msg.innerHTML = '<div class="msg ok">Département enregistré (effectif à la prochaine connexion de l\'utilisateur).</div>';
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function saveSettings() {
  const sa = document.getElementById('s-api'); if (sa) state.apiUrl = sa.value.trim() || DEFAULT_API_URL;
  state.siteId = document.getElementById('s-site').value.trim();
  localStorage.setItem('syllo_api_url', state.apiUrl);
  localStorage.setItem('syllo_site_id', state.siteId);
  document.getElementById('s-msg').innerHTML = '<div class="msg ok">Paramètres enregistrés.</div>';
}

/* ---------------- Auto-login si session valide ---------------- */
if (state.accessToken && state.user) {
  enterApp();
}

/* ---------------- PWA : service worker + installation ---------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch(() => {});
    // Nouvelle version installée : rechargement automatique (une seule fois)
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
  });
}

let deferredInstallPrompt = null;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
// Navigateur intégré (WhatsApp, Facebook…) : l'installation n'y est pas possible, il faut ouvrir le lien dans Chrome ou Safari
const inAppBrowser = /; wv\)|FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat/i.test(navigator.userAgent) || (isIOS && !/Safari\//.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent));
function installBtns(show) {
  ['install-btn', 'install-btn-login'].forEach((id) => {
    const b = document.getElementById(id); if (!b) return;
    b.style.display = show ? (id === 'install-btn' ? 'inline-flex' : 'block') : 'none';
    if (show) b.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-download"/></svg> ' + (id === 'install-btn' ? 'Installer l\'application' : 'Installer l\'application sur cet appareil');
  });
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstallPrompt = e; installBtns(true); });
async function installApp() {
  if (deferredInstallPrompt && !inAppBrowser) {
    deferredInstallPrompt.prompt();
    const r = await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    if (r && r.outcome === 'accepted') installBtns(false);
    return;
  }
  installHelp();
}
const INSTALL_CUR = isIOS ? 'ios' : isAndroid ? 'android' : 'pc';
const INSTALL_NAME = { android: 'Android', ios: 'iPhone / iPad', pc: 'Ordinateur (Windows, Mac)' };
function installHelp() {
  // Un seul écran, sans choix d'appareil : la bonne marche à suivre est choisie automatiquement.
  const old = document.getElementById('install-help'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = 'install-help';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1500;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px;';
  ov.innerHTML = `<div class="panel" style="max-width:460px;width:100%;margin:20px auto;"><h3 style="margin-top:0"><svg class="ic" aria-hidden="true"><use href="#i-phone"/></svg> Installer l'application</h3>
    <div id="install-steps"></div>
    <div style="margin-top:12px"><button class="btn" onclick="document.getElementById('install-help').remove()">Fermer</button></div></div>`;
  document.body.appendChild(ov);
  installPick(INSTALL_CUR);
}
function installShareBtn() { return `<div style="margin-top:8px"><button class="btn small gold" onclick="installShare()"><svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg> Envoyer le lien (WhatsApp…)</button> <button class="btn small" onclick="installCopy()">Copier le lien</button></div>`; }
async function installShare() {
  const url = location.href.split('#')[0];
  try { if (navigator.share) { await navigator.share({ title: 'SYL LOGISTIQUE', url }); return; } } catch (e) { return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(url), '_blank');
}
async function installPick(k) {
  const box = document.getElementById('install-steps'); if (!box) return;
  const step = (n, t) => `<div class="step"><b class="n">${n}</b><span>${t}</span></div>`;
  const msg = (t, cls) => { box.innerHTML = `<div class="msg ${cls || ''}" style="margin:0">${t}</div>`; };
  if (k !== INSTALL_CUR) {
    msg(`Vous êtes sur un autre type d'appareil. Ouvrez ce lien sur votre <b>${INSTALL_NAME[k]}</b> : envoyez-le-vous par WhatsApp ou copiez-le.` + installShareBtn());
    return;
  }
  if (isStandalone) { msg('L\'application est déjà installée sur cet appareil.'); return; }
  if (k === 'ios') {
    box.innerHTML = (inAppBrowser ? `<div class="msg err" style="margin:0 0 8px">Vous êtes dans WhatsApp ou un autre navigateur intégré. Copiez le lien puis ouvrez-le dans <b>Safari</b>.` + installShareBtn() + '</div>' : '')
      + `<div class="desc" style="margin:0 0 6px">Apple ne permet pas l'installation automatique : 3 gestes suffisent.</div>`
      + step(1, 'Ouvrez le lien dans <b>Safari</b>.') + step(2, 'Touchez <b>Partager</b> (le carré avec une flèche vers le haut).') + step(3, 'Choisissez <b>« Sur l\'écran d\'accueil »</b>, puis <b>Ajouter</b>.');
    return;
  }
  if (inAppBrowser && k === 'android') {
    const intent = 'intent://' + location.host + location.pathname + location.search + '#Intent;scheme=https;package=com.android.chrome;end';
    box.innerHTML = `<div class="msg err" style="margin:0 0 8px">Vous êtes dans WhatsApp ou un autre navigateur intégré : l'installation n'y marche pas.</div><a class="btn gold" style="display:block;text-align:center;text-decoration:none" href="${intent}">Ouvrir dans Chrome</a>` + installShareBtn();
    return;
  }
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const r = await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    if (r && r.outcome === 'accepted') { installBtns(false); msg('Installation lancée. L\'icône apparaît sur votre écran.'); }
    else msg('Installation annulée. Touchez de nouveau pour réessayer.');
    return;
  }
  // Le navigateur n'a pas (encore) proposé l'installation automatique : geste manuel, très court
  box.innerHTML = `<div class="desc" style="margin:0 0 6px">Votre navigateur n'a pas proposé l'installation automatique. Faites ceci :</div>`
    + (k === 'android' ? step(1, 'Ouvrez le lien dans <b>Chrome</b>, touchez le menu <b>⋮</b> (en haut à droite).') + step(2, 'Choisissez <b>« Installer l\'application »</b> (ou « Ajouter à l\'écran d\'accueil »), puis confirmez.')
      : step(1, 'Ouvrez le lien dans <b>Chrome</b> ou <b>Edge</b>.') + step(2, 'Cliquez sur l\'icône <b>Installer</b> à droite de la barre d\'adresse, puis <b>Installer</b>.'));
}
async function installCopy() {
  const url = location.href.split('#')[0];
  try { await navigator.clipboard.writeText(url); alert('Lien copié. Ouvrez-le maintenant dans ' + (isIOS ? 'Safari' : 'Chrome') + '.'); }
  catch (e) { prompt('Copiez ce lien puis ouvrez-le dans ' + (isIOS ? 'Safari' : 'Chrome') + ' :', url); }
}
window.addEventListener('appinstalled', () => installBtns(false));
// Toujours proposer l'installation tant que l'application n'est pas installée (aide pas à pas si le navigateur ne propose pas l'invite)
if (!isStandalone) installBtns(true);

