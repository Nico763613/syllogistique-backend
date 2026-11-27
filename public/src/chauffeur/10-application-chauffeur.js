/* ============================================================
   APPLICATION CHAUFFEUR — appareil activé, missions, saisies hors ligne
   Toute saisie passe par une file locale (localStorage) puis POST /driver/sync (idempotent).
   ============================================================ */
const DRV = { tab: 'missions', me: null, blocked: '', flushing: false, error: '' };
const dget = (k, d) => { try { const v = localStorage.getItem('syllo_drv_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const dset = (k, v) => { try { localStorage.setItem('syllo_drv_' + k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const drvDevice = () => { try { return localStorage.getItem('syllo_device_id') || ''; } catch (e) { return ''; } };
const drvUid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const drvQueue = () => dget('queue', []);
const drvDt = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const drvEl = (id) => document.getElementById(id);

function drvEnter() {
  { const uid = String(state.user.id || state.user.email || ''); if (dget('uid', '') !== uid) { try { localStorage.removeItem('syllo_drv_me'); } catch (e) {} dset('uid', uid); } }
  drvEl('login-screen').style.display = 'none';
  drvEl('app').style.display = 'none';
  drvEl('driver-app').style.display = 'block';
  drvEl('drv-name').textContent = `${state.user.firstName} ${state.user.lastName}`;
  spaceApply();
  refreshAvatars(); loadMyPhoto();
  { const m = dget('me', null); if (m) drvEl('drv-sub').textContent = drvKind(m); }
  window.addEventListener('online', () => { drvLoad(); });
  window.addEventListener('offline', drvPill);
  setInterval(() => { if (drvDevice() && navigator.onLine) drvFlush().then(drvRender); }, 30000);
  if (!drvDevice()) return drvActivationScreen();
  drvLoad();
}
function drvLogout() {
  if (drvQueue().some((o) => !o.rejected) && !confirm('Des saisies ne sont pas encore envoyées. Se déconnecter quand même ? (elles seront conservées sur cet appareil)')) return;
  drvEl('driver-app').style.display = 'none';
  logout();
}
function drvPill() {
  const pend = drvQueue().filter((o) => !o.rejected).length;
  const p = drvEl('drv-pill');
  if (!p) return;
  p.className = 'drv-pill' + (!navigator.onLine ? ' off' : pend ? ' pend' : '');
  p.textContent = !navigator.onLine ? `Hors ligne${pend ? ' · ' + pend : ''}` : pend ? `${pend} à envoyer` : 'Synchronisé';
}

async function drvLoad() {
  DRV.me = dget('me', null);
  drvRender();
  try {
    await drvFlush();
    DRV.me = await api('/driver/me');
    dset('me', DRV.me); dset('lastsync', Date.now());
    DRV.blocked = ''; DRV.error = '';
  } catch (e) {
    if (e.code === 'DEVICE_BLOCKED') DRV.blocked = e.message;
    else if (!(e instanceof TypeError)) DRV.error = e.message;
  }
  drvRender();
}

// Vue = données serveur + saisies encore en file (affichage cohérent hors ligne)
function drvView() {
  const me = DRV.me ? JSON.parse(JSON.stringify(DRV.me)) : null;
  if (!me) return null;
  for (const o of drvQueue()) {
    if (o.rejected) continue;
    let t = (me.trips || []).find((x) => x.id === o.tripId);
    if (o.type === 'start' && !t) { t = { id: o.tripId, status: 'PLANNED', destination: o.payload.destination, regions: o.payload.regions, cargo: o.payload.cargo || (o.payload.products || []).join(', '), operationSites: o.payload.operationSites, purposeType: o.payload.purposeType, vehicle: me.vehicle ? me.vehicle.number + ' — ' + me.vehicle.plate : '', vehicleId: me.vehicle && me.vehicle.id }; me.trips.unshift(t); }
    if (o.type === 'start' && t) { t.status = 'IN_PROGRESS'; t.startMileage = o.payload.odometer; t.startTime = o.payload.occurredAt; me.activeTrip = t; }
    if (o.type === 'pause' && t) { t.pauseMileage = o.payload.odometer; t.pauseAt = o.payload.occurredAt; }
    if (o.type === 'arrive' && t) { t.status = 'COMPLETED'; t.loadPlaces = o.payload.loadPlaces; t.unloadPlaces = o.payload.unloadPlaces; t.endMileage = o.payload.odometer; t.endTime = o.payload.occurredAt; if (me.activeTrip && me.activeTrip.id === t.id) me.activeTrip = null; }
  }
  return me;
}

function drvIsTruck(me) { return me && ((me.vehicle && me.vehicle.type === 'TRUCK') || (!me.vehicle && me.driver.activity === 'TRUCK')); }
function drvKind(me) { return (BRAND.name && !['SYLLOGISTIQUE','SYL LOGISTIQUE'].includes(BRAND.name) ? BRAND.name + ' · ' : '') + (drvIsTruck(me) ? 'Chauffeur de camion' : 'Chauffeur de véhicule de service') + (me.vehicle && me.vehicle.registrationType === 'IT' ? ' · plaque IT' : ''); }
DRV.hist = []; DRV.ign = 0;
function drvHb() { try { DRV.ign++; history.back(); } catch (e) { DRV.ign = 0; } }
function drvTab(t, noPush) {
  if (t === DRV.tab) return;
  if (!noPush) { DRV.hist.push(DRV.tab); if (DRV.hist.length > 20) DRV.hist.shift(); try { history.pushState({ drv: 1 }, ''); } catch (e) {} }
  DRV.tab = t; drvRender();
}
// Flèche ← (et bouton retour du téléphone) : ferme le formulaire ouvert, sinon revient à l'onglet précédent, sans quitter l'application.
function drvBack(fromPop) {
  const hov = drvEl('drv-hist-ov');
  if (hov) { hov.remove(); if (!fromPop) drvHb(); return; }
  const sh = drvEl('drv-sheet');
  if (sh) { sh.remove(); if (!fromPop) { drvHb() } return; }
  if (DRV.hist.length) { const t = DRV.hist.pop(); DRV.tab = t; drvRender(); if (!fromPop) { drvHb() } return; }
  if (DRV.tab !== 'missions') { DRV.tab = 'missions'; drvRender(); }
}
window.addEventListener('popstate', () => { if (DRV.ign > 0) { DRV.ign--; return; } if (drvEl('driver-app') && drvEl('driver-app').style.display !== 'none' && (drvEl('drv-sheet') || drvEl('drv-hist-ov') || DRV.hist.length)) drvBack(true); });
function drvBackBtn() { const b = drvEl('drv-back'); if (b) b.style.display = (DRV.tab !== 'missions' || DRV.hist.length || drvEl('drv-sheet')) ? '' : 'none'; }
function drvRender() {
  drvPill(); drvBackBtn();
  if (DRV.me) drvEl('drv-sub').textContent = drvKind(DRV.me);
  document.querySelectorAll('#drv-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === DRV.tab));
  const root = drvEl('drv-root');
  if (DRV.blocked) {
    root.innerHTML = `<div class="drv-card drv-center"><div style="font-size:20px"><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg></div><h4>Application verrouillée</h4><div class="drv-warn">${esc(DRV.blocked)}</div>
      <button class="drv-btn" onclick="drvLoad()">Réessayer</button><button class="drv-btn ghost" onclick="drvResetDevice()">Saisir un nouveau code d'activation</button><button class="drv-btn ghost" onclick="drvLogout()">Changer de chauffeur (déconnexion)</button></div>`;
    return;
  }
  const me = drvView();
  if (!me) { root.innerHTML = `<div class="drv-card drv-center">${DRV.error ? `<div class="drv-warn">${esc(DRV.error)}</div>` : 'Chargement…'}<button class="drv-btn ghost" onclick="drvLoad()">Actualiser</button></div>`; return; }
  const v = me.vehicle;
  const banner = (DRV.error ? `<div class="drv-warn">${esc(DRV.error)}</div>` : '') + (v && v.immobilized ? `<div class="drv-warn"><svg class="ic" aria-hidden="true"><use href="#i-ban"/></svg> Véhicule immobilisé${v.downtimeReason ? ' : ' + esc(v.downtimeReason) : ''}. ${v.downtimeStage && DT_STAGE[v.downtimeStage] ? ' Étape : ' + DT_STAGE[v.downtimeStage][1] + (v.downtimeExpectedEnd ? ', remise en service prévue le ' + new Date(v.downtimeExpectedEnd).toLocaleDateString('fr-FR') : '') + '.' : ''} Départ impossible tant que l'atelier n'a pas validé la levée de réserve.</div>` : '');
  if (DRV.tab === 'missions') { root.innerHTML = banner + drvHomeHtml(me); setTimeout(drvHomeFill, 0); }
  else if (DRV.tab === 'sheet') { root.innerHTML = banner + '<div class="drv-card drv-center">Chargement de la fiche…</div>'; drvSheetLoad(); }
  else if (DRV.tab === 'fuel') { root.innerHTML = banner + '<div class="drv-card drv-center">Chargement…</div>'; drvModuleLoad('fuel', banner); }
  else if (DRV.tab === 'maint') { root.innerHTML = banner + '<div class="drv-card drv-center">Chargement…</div>'; drvModuleLoad('maint', banner); }
  else if (DRV.tab === 'expenses') { root.innerHTML = banner + '<div class="drv-card drv-center">Chargement…</div>'; drvModuleLoad('expenses', banner); }
  else if (DRV.tab === 'profile') root.innerHTML = drvProfileHtml(me);
  else { root.innerHTML = drvQueueHtml(); setTimeout(drvTxLoad, 0); }
}

function drvStepsHtml(t) {
  const s = t.status;
  const cls = (n) => (s === 'COMPLETED' || (s === 'IN_PROGRESS' && n === 0) ? 'done' : (s === 'PLANNED' && n === 0) || (s === 'IN_PROGRESS' && n === 1) ? 'now' : '');
  return `<div class="drv-steps"><div class="${s === 'PLANNED' ? 'now' : 'done'}">1 · Prête</div><div class="${s === 'PLANNED' ? '' : s === 'IN_PROGRESS' ? 'now' : 'done'}">2 · En route</div><div class="${s === 'COMPLETED' ? 'done' : ''}">3 · Arrivée</div></div>`;
}
function drvMissionsHtml(me, listOnly) {
  const v = me.vehicle;
  const trips = me.trips.filter((t) => t.status !== 'CANCELLED');
  const late = (t) => t.scheduledArrival && t.status === 'IN_PROGRESS' && Date.now() > +new Date(t.scheduledArrival) + 15 * 60000;
  const state = me.activeTrip ? `En mission${me.activeTrip.destination ? ' — ' + esc(me.activeTrip.destination) : ''}` : (v && v.immobilized ? 'Véhicule immobilisé' : 'Aucune mission en cours');
  const id = `<div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-user"/></svg> ${esc(me.driver.name)}</h4>
    <div class="drv-row"><span>${state}</span><b></b></div>
    ${v ? `<div class="drv-row"><span>${v.type === 'TRUCK' ? 'Camion' : 'Véhicule'}</span><b>${esc(v.plate)}${v.registrationType === 'IT' ? ' <span class="badge warn">IT</span>' : ''} · ${fmt(v.mileage)} km</b></div>` : '<div class="drv-row"><span>Véhicule</span><b>Aucun véhicule affecté</b></div>'}
    ${v && !me.activeTrip && !v.immobilized ? `<button class="drv-btn gold" onclick="drvStartForm('')"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> ${v.type === 'TRUCK' ? 'Commencer ma journée' : 'Nouvelle mission'}</button>` : ''}
    ${me.activeTrip && v && v.type === 'TRUCK' ? `<button class="drv-btn" onclick="drvPauseForm('${esc(me.activeTrip.id)}')">Pause${me.activeTrip.pauseMileage != null ? ' (dernière : ' + fmt(me.activeTrip.pauseMileage) + ' km)' : ''}</button>` : ''}
    ${me.activeTrip ? `<button class="drv-btn gold" onclick="drvArriveForm('${esc(me.activeTrip.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-flag"/></svg> ${v && v.type === 'TRUCK' ? 'Arrêt de la journée' : 'Arrivée / retour'}</button>` : ''}
    <button class="drv-btn ghost" style="margin-top:8px" onclick="drvMissionHistory()"><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Mes missions passées</button></div>`;
  const list = trips.map((t) => `
    <div class="drv-card">
      <h4>${esc(t.destination || (t.regions && t.regions.join(', ')) || 'Mission')} ${late(t) ? '<span class="badge bad">En retard</span>' : ''}</h4>
      ${drvStepsHtml(t)}
      ${t.reference ? `<div class="drv-row"><span>N° de mission</span><b>${esc(t.reference)}</b></div>` : ''}
      <div class="drv-row"><span>Départ</span><b>${drvDt(t.startTime)}</b></div>
      <a href="#" onclick="drvTimeline('${esc(t.id)}');return false;" style="font-size:14px"><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> Voir la chronologie</a>
      <details style="margin:6px 0"><summary style="font-size:14px;color:var(--muted);cursor:pointer">Voir les détails</summary>
      <div class="drv-row"><span>Véhicule</span><b>${esc(t.vehicle)}</b></div>
      ${t.purposeType ? `<div class="drv-row"><span>Nature</span><b>${esc({ MISSION: 'Mission', AUTRE: 'Autre', TRANSPORT: 'Transport' }[t.purposeType] || t.purposeType)}${t.cargo ? ' — ' + esc(t.cargo) : ''}</b></div>` : ''}
      ${t.regions && t.regions.length ? `<div class="drv-row"><span>Régions</span><b>${esc(t.regions.join(', '))}</b></div>` : ''}
      ${t.purpose ? `<div class="drv-row"><span>Motif / instructions</span><b style="text-align:right">${esc(t.purpose)}</b></div>` : ''}
      ${t.passengerName ? `<div class="drv-row"><span>Contact / client</span><b>${esc(t.passengerName)}</b></div>` : ''}
      ${t.observations ? `<div class="drv-row"><span>Notes</span><b style="text-align:right">${esc(t.observations)}</b></div>` : ''}
      ${t.scheduledArrival ? `<div class="drv-row"><span>Arrivée prévue</span><b>${drvDt(t.scheduledArrival)}</b></div>` : ''}
      ${t.status !== 'PLANNED' ? `<div class="drv-row"><span>Compteur départ → arrêt</span><b>${esc(t.startMileage)} → ${t.endMileage ?? '…'}</b></div>` : ''}
      ${t.operationSites && t.operationSites.length ? `<div class="drv-row"><span>Sites d'opération</span><b style="text-align:right">${esc(t.operationSites.join(', '))}</b></div>` : ''}
      ${t.pauseMileage != null ? `<div class="drv-row"><span>Pause</span><b>${fmt(t.pauseMileage)} km</b></div>` : ''}
      ${t.loadPlaces && t.loadPlaces.length ? `<div class="drv-row"><span>Chargement → déchargement</span><b style="text-align:right">${esc(t.loadPlaces.join(', '))} → ${esc((t.unloadPlaces || []).join(', '))}</b></div>` : ''}
      ${t.tripsCount != null ? `<div class="drv-row"><span>Voyages</span><b>${esc(t.tripsCount)}${t.tonnagePerTrip ? ' × ' + esc(t.tonnagePerTrip) + ' t = ' + (Math.round(t.tripsCount * t.tonnagePerTrip * 10) / 10) + ' t' : ''}</b></div>` : ''}
      </details>
      ${t.status === 'PLANNED' ? `<button class="drv-btn gold" onclick="drvStartForm('${esc(t.id)}')">Déclarer le départ</button>` : ''}
      ${t.status === 'IN_PROGRESS' ? `<button class="drv-btn gold" onclick="drvArriveForm('${esc(t.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-flag"/></svg> Arrivée / retour</button>` : ''}
    </div>`).join('');
  if (listOnly) return list || '<div class="drv-center" style="font-size:14px">Aucune mission pour le moment.</div>';
  return id + (list || '<div class="drv-card drv-center">Aucune mission pour le moment.<button class="drv-btn ghost" onclick="drvLoad()">Actualiser</button></div>');
}

/* Accueil du chauffeur : salutation, carte du véhicule, 4 gros boutons, fiche du jour, dernière synchronisation */
function drvHomeHtml(me) {
  const v = me.vehicle, act = me.activeTrip, tid = act ? esc(act.id) : '', truck = v && v.type === 'TRUCK';
  const first = esc((me.driver.name || '').split(' ')[0]);
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const stateTxt = act ? `En mission${act.destination ? ' — ' + esc(act.destination) : ''}` : (v && v.immobilized ? 'Véhicule immobilisé' : 'Au repos');
  const off = !v || v.immobilized;
  const pend = drvQueue().filter((o) => !o.rejected).length, ls = dget('lastsync', 0);
  const hm = ls ? new Date(ls).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
  const pause = act && truck ? `<button onclick="drvPauseForm('${tid}')">Pause${act.pauseMileage != null ? ' (' + fmt(act.pauseMileage) + ' km)' : ''}</button>` : '';
  return `<div class="drv-hello"><h2>${esc(me.driver.name || '')}</h2><div>${esc(today.charAt(0).toUpperCase() + today.slice(1))}</div></div>
    <div class="drv-card"><h4>${v ? (truck ? '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> ' : '<svg class="ic" aria-hidden="true"><use href="#i-car"/></svg> ') + esc(v.plate) + (v.registrationType === 'IT' ? ' <span class="badge warn">IT</span>' : '') : '<svg class="ic" aria-hidden="true"><use href="#i-ban"/></svg> Aucun véhicule affecté'}</h4>
      <div class="drv-row"><span>État</span><b>${stateTxt}</b></div>
      ${v ? `<div class="drv-row"><span>Kilométrage</span><b>${fmt(v.mileage)} km</b></div>` : ''}
      ${v && v.immobilized && v.downtimeReason ? `<div class="drv-warn">${esc(v.downtimeReason)}</div>` : ''}</div>
    <div class="drv-big">
      ${act ? `<button class="b1" onclick="drvArriveForm('${tid}')"><span><svg class="ic" aria-hidden="true"><use href="#i-flag"/></svg></span>${truck ? 'Arrêt de la journée' : 'Arrivée'}<small>Terminer la mission</small></button>` : `<button class="b1" ${off ? 'disabled' : ''} onclick="drvStartForm('')"><span><svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg></span>Départ<small>${truck ? 'Commencer ma journée' : 'Nouvelle mission'}</small></button>`}
      <button class="b2" ${v ? '' : 'disabled'} onclick="drvFuelForm('${tid}')"><span><svg class="ic" aria-hidden="true"><use href="#i-fuel"/></svg></span>Carburant<small>Plein + photo du reçu</small></button>
      <button class="b3" ${v ? '' : 'disabled'} onclick="drvExpenseForm('${tid}')"><span><svg class="ic" aria-hidden="true"><use href="#i-receipt"/></svg></span>Dépense<small>Montant + photo du reçu</small></button>
      <button class="b4" ${v ? '' : 'disabled'} onclick="drvFaultForm('${tid}')"><span><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg></span>Panne<small>Signaler un problème</small></button></div>
    <div class="drv-sec">${pause}<button ${v ? '' : 'disabled'} onclick="drvMaintForm('${tid}')"><svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg> Entretien effectué</button><button onclick="drvMissionHistory()"><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Missions passées</button></div>
    <div class="drv-card" id="drv-fiche"><h4><svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg> Ma fiche du jour</h4><div class="drv-center" style="font-size:14px">Chargement…</div></div>
    <details class="drv-card" style="padding:10px 14px"><summary style="cursor:pointer;font-weight:600;color:var(--navy)"><svg class="ic" aria-hidden="true"><use href="#i-map-pin"/></svg> Mes missions du jour</summary><div style="margin-top:10px">${drvMissionsHtml(me, true)}</div></details>
    <div class="drv-sync">Dernière synchronisation ${hm} · ${pend} saisie(s) en attente</div>`;
}
async function drvHomeFill() {
  if (!drvEl('drv-fiche')) return;
  const sh = await drvDayData();
  const box = drvEl('drv-fiche'); if (!box || DRV.tab !== 'missions') return;
  const me = drvView(), pend = drvQueue().filter((o) => !o.rejected).length;
  if (!sh || !me) { box.innerHTML = '<h4><svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg> Ma fiche du jour</h4><div class="drv-center" style="font-size:14px">Indisponible hors connexion. Vos saisies sont conservées sur le téléphone.</div>'; return; }
  const sent = sh.status === 'SENT';
  const n = sh.trips.length + sh.fuel.length + sh.maintenance.length + (sh.expenses || []).length;
  const missing = sh.fuel.filter((f) => f.source === 'STATION' && f.cost > 0 && !f.receiptUrl).length + (sh.expenses || []).filter((e) => !e.receiptUrl).length + sh.maintenance.filter((m) => m.nature !== 'ANOMALIE' && m.cost > 0 && !(m.photoUrls || []).length).length;
  let why = '';
  if (!sent) {
    if (me.activeTrip) why = "Terminez d'abord la mission en cours (Arrivée)."; else if (pend) why = pend + ' saisie(s) à synchroniser : il faut du réseau.';
    else if (missing) why = missing + ' reçu(s) manquant(s).'; else if (!sh.trips.length && !sh.fuel.length && !sh.maintenance.length) why = 'Rien à envoyer pour le moment.'; else if (!navigator.onLine) why = 'Connexion nécessaire pour envoyer.';
  }
  box.innerHTML = `<h4><svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg> Ma fiche du jour ${sent ? stepBadge(sh.step) : ''}</h4>
    ${sh.rejectNote && !sent ? `<div class="drv-warn">Renvoyée par la hiérarchie : ${esc(sh.rejectNote)}. Corrigez puis renvoyez.</div>` : ''}
    <div class="drv-row"><span>Saisies du jour</span><b>${n + pend}</b></div>
    <div class="drv-row"><span>Reçus manquants</span><b>${missing ? '<span class="badge bad">' + missing + '</span>' : '<span class="badge ok">0</span>'}</b></div>
    ${sent ? '<div style="font-size:14px;color:var(--muted)"><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg> Fiche envoyée. Déposez vos reçus papier au responsable.</div>' : `<button class="drv-btn gold" ${why ? 'disabled' : ''} onclick="drvSheetSend('${esc(sh.date)}')"><svg class="ic" aria-hidden="true"><use href="#i-upload"/></svg> Envoyer ma fiche</button>${why ? '<div style="font-size:12px;color:var(--muted);text-align:center;margin-top:6px">' + esc(why) + '</div>' : ''}`}`;
}

function drvQueueHtml() {
  const q = drvQueue();
  const label = { start: 'Départ', arrive: 'Arrêt', fuel: 'Carburant', breakdown: 'Panne', incident: 'Incident', maintenance: 'Maintenance / anomalie', expense: 'Dépense' };
  const rows = q.map((o) => `<div class="drv-row"><span>${esc(label[o.type])} · ${drvDt(o.createdAt)}</span><b>${o.rejected ? `<span class="badge bad">Refusé</span> <a href="#" onclick="drvDrop('${esc(o.clientOpId)}');return false;">supprimer</a>` : '<span class="badge warn">En attente</span>'}</b></div>${o.rejected ? `<div class="drv-warn" style="margin:4px 0">${esc(o.error)}</div>` : ''}`).join('');
  return `<div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg> Envois vers le bureau</h4>
    <button class="drv-btn gold" style="font-size:20px;padding:16px" onclick="drvSyncNow()"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg> Synchroniser maintenant</button>
    <div style="font-size:12px;color:var(--muted);margin:6px 0 10px">Hors connexion, vos saisies restent sur le téléphone et partent dès le retour du réseau.</div>
    ${rows || '<div class="drv-center">Tout est synchronisé <svg class="ic" aria-hidden="true"><use href="#i-check"/></svg></div>'}</div>
    <div class="drv-card" id="drv-tx"><h4><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg> Suivi de mes transmissions</h4><div class="drv-center">Chargement…</div></div>`;
}
async function drvTxLoad() {
  const box = drvEl('drv-tx'); if (!box) return;
  let r;
  try { r = await api('/driver/transmissions'); dset('tx', r); } catch (e) { r = dget('tx'); if (!r) { box.innerHTML = '<h4><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg> Suivi de mes transmissions</h4><div class="drv-center">Indisponible hors connexion.</div>'; return; } }
  const dt = (x) => (x ? drvDt(x) : '');
  const step = (ok, label, when) => `<span class="badge ${ok ? 'ok' : 'warn'}">${ok ? '<svg class="ic" aria-hidden="true"><use href="#i-check"/></svg>' : '<svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg>'} ${label}${ok && when ? ' ' + dt(when) : ''}</span>`;
  const sheets = r.sheets.map((x) => `<div style="padding:8px 0;border-bottom:1px dashed #D9E0E8"><b>Fiche du ${esc(x.date.split('-').reverse().join('/'))}</b><div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">${x.step === 'REJECTED' ? '<span class="badge bad"><svg class="ic" aria-hidden="true"><use href="#i-chevron-left"/></svg> Renvoyée pour correction</span>' : step(true, 'Soumise', x.sentAt) + step(!!x.processedAt, 'Vérifiée', x.processedAt) + step(!!x.opsAt, 'Validée', x.opsAt)}</div>${x.note ? `<div style="font-size:12px;color:#5A6B7D">${x.step === 'REJECTED' ? 'Motif' : 'Note du bureau'} : ${esc(x.note)}</div>` : ''}</div>`).join('');
  const exps = r.expenses.map((e) => `<div class="drv-row"><span>${esc(DRV_EXP[e.category] || e.category)} · ${esc(drvDt(e.date))}${e.note ? `<br><small>${esc(e.note)}</small>` : ''}</span><b>${fmt(e.amount)} GNF <span class="badge ${DRV_EXP_ST[e.status][0]}">${DRV_EXP_ST[e.status][1]}</span></b></div>`).join('');
  box.innerHTML = `<h4><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg> Suivi de mes transmissions</h4>${sheets || '<div class="drv-center">Aucune fiche envoyée.</div>'}${exps ? '<h4 style="margin-top:12px"><svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg> Mes dépenses</h4>' + exps : ''}`;
}
function drvLicenseHtml(me) {
  const l = (me.driver && me.driver.license) || {};
  const exp = l.expiry ? new Date(l.expiry) : null;
  const days = exp ? Math.ceil((+exp - Date.now()) / 86400000) : null;
  const badge = !exp ? '<span class="badge warn">Non renseignée</span>' : days < 0 ? '<span class="badge bad">Expiré</span>' : days <= 60 ? `<span class="badge warn">Expire dans ${days} j</span>` : '<span class="badge ok">Valide</span>';
  return `<div style="margin:12px 0 4px;font-weight:700;color:var(--navy)"><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Permis de conduire</div>
    <div class="drv-row"><span>Numéro</span><b>${esc(l.number || '—')}</b></div>
    <div class="drv-row"><span>Catégorie</span><b>${esc(l.category || '—')}</b></div>
    <div class="drv-row"><span>Expiration</span><b>${exp ? exp.toLocaleDateString('fr-FR') : '—'}</b></div>
    <div class="drv-row"><span>Statut</span><b>${badge}</b></div>
    ${l.number ? '' : '<div style="font-size:12px;color:var(--muted)">À compléter par le gestionnaire de flotte (fiche chauffeur).</div>'}
    ${l.photoUrl ? `<div style="margin:8px 0"><img src="${esc(brandSrc(l.photoUrl))}" alt="Photo du permis" style="max-width:100%;border-radius:8px;border:1px solid var(--line)"></div>` : '<div style="font-size:12px;color:var(--muted);margin:8px 0">Photo du permis non fournie.</div>'}
    <label class="drv-btn" style="display:block;text-align:center;cursor:pointer;margin-top:6px"><svg class="ic" aria-hidden="true"><use href="#i-camera"/></svg> ${l.photoUrl ? 'Remplacer la photo du permis' : 'Photographier mon permis'}<input type="file" accept="image/*" capture="environment" hidden onchange="drvLicensePhoto(this)"></label>`;
}
async function drvLicensePhoto(input) {
  const f = input.files && input.files[0]; if (!f) return;
  try {
    if (!navigator.onLine) throw new Error('Connexion requise pour envoyer la photo du permis.');
    const url = await drvUpload(await drvShrink(f), 'driver_license');
    await api('/driver/license-photo', { method: 'POST', body: { url } });
    await drvLoad();
  } catch (e) { alert(e.message || 'Envoi impossible.'); }
  input.value = '';
}
function drvProfileHtml(me) {
  const v = me.vehicle;
  const dispo = !v ? 'Sans véhicule' : v.immobilized ? 'Immobilisé' : me.activeTrip || v.status === 'ON_MISSION' ? 'En mission' : 'Disponible';
  return `<div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-user"/></svg> Mon profil</h4>
    <div class="drv-row"><span>Nom</span><b>${esc(me.driver.name)}</b></div>
    <div class="drv-row"><span>Rôle</span><b>${esc(drvKind(me))}</b></div>
    <div class="drv-row"><span>Disponibilité</span><b>${dispo}</b></div>
    <div class="drv-row"><span>Véhicule</span><b>${v ? esc(v.plate) + ' · ' + esc(v.label || '—') : 'Aucun'}</b></div>
    ${v ? `<div class="drv-row"><span>Compteur</span><b>${fmt(v.mileage)} km</b></div>` : ''}
    <div class="drv-row"><span>Appareil Android</span><b>${esc((me.device && me.device.model) || 'activé')}</b></div>
    <label>Téléphone</label><input id="p-phone" inputmode="tel" value="${esc(me.driver.phone || '')}">
    <button class="drv-btn" onclick="drvSavePhone()">Enregistrer le téléphone</button><div id="p-msg1"></div></div>
    <div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg> Verrou de l'appareil</h4><div class="desc" style="font-size:12px;color:var(--muted)">Un code PIN protège l'application sur ce téléphone.</div>${pinIsSet() ? '<div class="drv-row"><span>Code PIN</span><b>Activé</b></div><button class="drv-btn" onclick="pinSetup()">Changer le code</button><button class="drv-btn ghost" onclick="pinRemove();drvRender()">Désactiver</button>' : '<button class="drv-btn" onclick="pinSetup()">Activer un code PIN</button>'}</div>
    ${v && v.type === 'TRUCK' ? `<div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Mon camion</h4>
    <label>Type de camion</label><select id="sp-type"><option value="">— Choisir —</option>${TRUCK_TYPES.map(t => `<option value="${t[0]}"${v.truckType === t[0] ? ' selected' : ''}>${t[1]}</option>`).join('')}</select>
    <label>Nombre de roues</label>${otherSel('sp-wheels', TRUCK_WHEELS, n => n + ' roues', 'Nombre de roues', v.wheels)}
    <label>Capacité</label>${otherSel('sp-cap', TRUCK_CAPS, n => n + ' tonnes', 'Ex. 80 t', capNum(v.capacity))}
    <button class="drv-btn" onclick="drvSaveSpec()">Enregistrer mon camion</button><div id="p-msg3"></div></div>` : ''}
    <div class="drv-card">${drvLicenseHtml(me)}</div>
    <div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg> Je remplace un collègue</h4>
    <div style="font-size:14px;color:var(--muted)">Si le chauffeur habituel est malade ou absent, prenez le véhicule : il passe sur votre compte et le gestionnaire est prévenu.</div>
    <button class="drv-btn ghost" onclick="drvTakeoverForm()">Choisir le véhicule à reprendre</button></div>
    <div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-key"/></svg> Changer mon mot de passe</h4>
    <label>Mot de passe actuel</label><input id="pw-old" type="password" autocomplete="current-password">
    <label>Nouveau mot de passe (8 caractères minimum, avec une lettre et un chiffre)</label><input id="pw-new" type="password" autocomplete="new-password">
    <button class="drv-btn" onclick="drvChangePw()">Changer le mot de passe</button><div id="p-msg2"></div></div>`;
}
async function drvSavePhone() {
  const m = drvEl('p-msg1');
  try { const r = await api('/driver/profile', { method: 'POST', body: { phone: drvEl('p-phone').value } }); DRV.me.driver.phone = r.phone; dset('me', DRV.me); m.innerHTML = '<div class="msg ok">Téléphone enregistré.</div>'; }
  catch (e) { m.innerHTML = `<div class="drv-warn">${esc(e.message)}</div>`; }
}
async function drvSaveSpec() {
  const m = drvEl('p-msg3');
  try {
    const wheels = otherVal('sp-wheels'), cap = otherVal('sp-cap'), tt = drvEl('sp-type').value;
    const body = { ...(tt ? { truckType: tt } : {}), ...(wheels && Number(wheels) > 0 ? { wheels: Math.round(Number(wheels)) } : {}), ...(cap ? { capacity: capFmt(cap) } : {}) };
    const r = await api('/driver/vehicle-spec', { method: 'POST', body });
    Object.assign(DRV.me.vehicle, r); dset('me', DRV.me);
    m.innerHTML = '<div class="msg ok">Camion enregistré.</div>';
  } catch (e) { m.innerHTML = `<div class="drv-warn">${esc(e.message)}</div>`; }
}
async function drvChangePw() {
  const m = drvEl('p-msg2');
  try { await api('/auth/change-password', { method: 'POST', body: { currentPassword: drvEl('pw-old').value, newPassword: drvEl('pw-new').value } }); drvEl('pw-old').value = ''; drvEl('pw-new').value = ''; m.innerHTML = '<div class="msg ok">Mot de passe modifié.</div>'; }
  catch (e) { m.innerHTML = `<div class="drv-warn">${esc(e.message)}</div>`; }
}
async function drvTakeoverForm() {
  let list;
  try { list = await api('/driver/vehicles'); } catch (e) { return alert(e instanceof TypeError ? 'Connexion nécessaire pour changer de véhicule.' : e.message); }
  drvSheet('Remplacement de chauffeur', `
    <label>Véhicule à reprendre</label><select id="t-veh">${list.filter((x) => !x.mine).map((x) => `<option value="${esc(x.id)}">${esc(x.plate)} · ${esc(x.label || x.number)}${x.currentDriver ? ' — actuellement ' + esc(x.currentDriver) : ''}</option>`).join('') || '<option value="">Aucun véhicule disponible</option>'}</select>
    <label>Motif du remplacement</label><select id="t-reason"><option value="MALADIE">Maladie du chauffeur</option><option value="CONGE">Congé</option><option value="AUTRE">Autre</option></select>
    <label>Précisions</label><input id="t-note" placeholder="Facultatif">`, async () => {
    const vehicleId = drvEl('t-veh').value;
    if (!vehicleId) throw new Error('Aucun véhicule à reprendre.');
    await api('/driver/takeover', { method: 'POST', body: { vehicleId, reason: drvEl('t-reason').value, note: drvEl('t-note').value.trim() || undefined } });
    DRV.tab = 'missions'; await drvLoad();
  }, 'Confirmer le remplacement');
}
function drvDrop(id) { dset('queue', drvQueue().filter((o) => o.clientOpId !== id)); drvRender(); }
async function drvSyncNow() { await drvLoad(); }

/* ---------- File d'envoi hors ligne ---------- */
function drvEnqueue(op) {
  const q = drvQueue();
  q.push({ ...op, clientOpId: drvUid(), createdAt: new Date().toISOString() });
  if (!dset('queue', q)) { alert("Mémoire de l'appareil pleine : envoyez d'abord les saisies en attente."); return false; }
  drvRender();
  if (navigator.onLine) drvFlush().then(() => drvLoad());
  return true;
}
async function drvUpload(dataUrl, category) {
  const blob = await (await fetch(dataUrl)).blob();
  const fd = new FormData();
  fd.append('file', blob, 'photo.jpg');
  const res = await fetch(state.apiUrl.replace(/\/$/, '') + '/uploads?category=' + category, { method: 'POST', headers: { Authorization: 'Bearer ' + state.accessToken }, body: fd });
  if (res.status === 401) { await api('/driver/me').catch(() => {}); throw new TypeError('session'); }
  if (!res.ok) throw new Error('Envoi de la photo refusé.');
  return (await res.json()).url;
}
async function drvFlush() {
  if (DRV.flushing || !navigator.onLine) return;
  let q = drvQueue();
  if (!q.some((o) => !o.rejected)) return;
  DRV.flushing = true;
  try {
    for (const o of q) {
      if (o.rejected || !o.photos || !o.photos.length || o.uploaded) continue;
      o.uploaded = [];
      for (const p of o.photos) o.uploaded.push(await drvUpload(p, o.type === 'fuel' ? 'fuel_receipt' : o.type === 'expense' ? 'expense_receipt' : 'incident_photo'));
      if (o.type === 'fuel' || o.type === 'expense') o.payload.receiptImageUrl = o.uploaded[0]; else o.payload.photoUrls = o.uploaded;
      o.photos = [];
      dset('queue', q);
    }
    const todo = q.filter((o) => !o.rejected).slice(0, 50);
    if (!todo.length) return;
    const r = await api('/driver/sync', { method: 'POST', body: { ops: todo.map((o) => ({ type: o.type, clientOpId: o.clientOpId, tripId: o.tripId || undefined, payload: o.payload })) } });
    const byId = new Map(r.results.map((x) => [x.clientOpId, x]));
    q = drvQueue().filter((o) => { const x = byId.get(o.clientOpId); if (x && x.ok) return false; if (x && !x.ok) { o.rejected = true; o.error = x.error; } return true; });
    dset('queue', q);
  } catch (e) {
    if (e.code === 'DEVICE_BLOCKED') DRV.blocked = e.message;
  } finally { DRV.flushing = false; }
}

/* ---------- Outils : position, photos, fenêtre de saisie ---------- */
function drvGeo() {
  return new Promise((res) => {
    if (!navigator.geolocation) return res({});
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res({}), { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  });
}
function drvShrink(file, max = 1280, q = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo illisible : reprenez-la en JPEG.')); };
    img.src = url;
  });
}
const DRV_PHOTOS = [];
async function drvPickPhotos(input) {
  for (const f of input.files) { if (DRV_PHOTOS.length < 4) DRV_PHOTOS.push(await drvShrink(f)); }
  input.value = '';
  drvEl('drv-thumbs').innerHTML = DRV_PHOTOS.map((p) => `<img src="${p}">`).join('');
}
function drvSheet(title, html, onSubmit, submitLabel) {
  DRV_PHOTOS.length = 0;
  const old = drvEl('drv-sheet'); if (old) old.remove();
  const s = document.createElement('div');
  s.id = 'drv-sheet'; s.className = 'drv-sheet';
  s.innerHTML = `<div><a href="#" onclick="drvBack();return false;" style="font-size:14px;text-decoration:none;color:var(--navy);font-weight:700">← Retour</a><h3>${esc(title)}</h3>${html}<div id="drv-sheet-msg"></div><button class="drv-btn gold" id="drv-sheet-ok">${esc(submitLabel || 'Enregistrer')}</button><button class="drv-btn ghost" onclick="drvBack()">Annuler</button></div>`;
  document.body.appendChild(s); drvBackBtn(); try { history.pushState({ drv: 1 }, ''); } catch (e) {}
  drvEl('drv-sheet-ok').onclick = async () => {
    const btn = drvEl('drv-sheet-ok'); btn.disabled = true; btn.textContent = 'Position GPS…';
    try { await onSubmit(); s.remove(); drvHb() } catch (e) { drvEl('drv-sheet-msg').innerHTML = `<div class="drv-warn">${esc(e.message)}</div>`; btn.disabled = false; btn.textContent = submitLabel || 'Enregistrer'; }
  };
}
const drvPhotoField = (label, multiple) => `<label>${label}</label><input type="file" accept="image/*" capture="environment" ${multiple ? 'multiple' : ''} onchange="drvPickPhotos(this)"><div class="drv-thumbs" id="drv-thumbs"></div>`;
const drvNum = (id) => { const v = drvEl(id).value.trim(); return v === '' ? undefined : Number(v); };
const drvTripOf = (id) => (drvView().trips || []).find((t) => t.id === id);

/* ---------- Formulaires ---------- */
function drvToggleStart() {
  const an = drvEl('f-cond').value === 'ANOMALIE'; drvEl('f-anom-box').style.display = an ? 'block' : 'none';
  const m = drvEl('f-ptype'); if (m) drvEl('f-reg-box').style.display = m.value === 'MISSION' ? 'block' : 'none';
}
/* ---------- Géographie standardisée (listes à cocher) ---------- */
const GEO_CONAKRY = ['Kaloum', 'Almamya', 'Boulbinet', 'Sans-Fil', 'Tombo', 'Coronthie', 'Dixinn', 'Dixinn-Port', 'Camayenne', 'Landréah', 'Minière', 'Taouyah', 'Hafia', 'Belle-Vue', 'Cameroun', 'Matam', 'Madina', 'Kobaya', 'Ratoma', 'Kipé', 'Nongo', 'Lambanyi', 'Hamdallaye', 'Bambeto', 'Cosa', 'Kaporo', 'Sonfonia', 'Koloma', 'Simbaya', 'Dar-es-Salam', 'Matoto', 'Gbessia', 'Dabompa', 'Enta', 'Yimbaya', 'Tombolia', 'Sangoyah', 'Coléah', 'Kagbélen', 'Sanoyah'];
const GEO_INTERIEUR = { 'Boké': ['Boké', 'Boffa', 'Fria', 'Gaoual', 'Koundara', 'Kamsar'], 'Kindia': ['Kindia', 'Coyah', 'Dubréka', 'Forécariah', 'Télimélé'], 'Mamou': ['Mamou', 'Dalaba', 'Pita'], 'Labé': ['Labé', 'Koubia', 'Lélouma', 'Mali', 'Tougué'], 'Faranah': ['Faranah', 'Dabola', 'Dinguiraye', 'Kissidougou'], 'Kankan': ['Kankan', 'Kérouané', 'Kouroussa', 'Mandiana', 'Siguiri'], "N'Zérékoré": ["N'Zérékoré", 'Beyla', 'Guéckédou', 'Lola', 'Macenta', 'Yomou'] };
const GEO_REGION_OF = {}; Object.entries(GEO_INTERIEUR).forEach(([r, l]) => l.forEach((c) => { GEO_REGION_OF[c] = r; }));
const GEO_VILLES = Object.values(GEO_INTERIEUR).flat();
// Liste déroulante à cases à cocher (une ou plusieurs valeurs)
function drvMulti(id, title, items) {
  return `<details class="msel" id="${id}" style="border:1px solid #D9E0E8;border-radius:8px;margin:6px 0;background:#fff"><summary style="padding:12px;font-size:14px;cursor:pointer;color:var(--text)">${esc(title)} <b class="msel-n" style="color:var(--navy)"></b></summary>
    <div style="max-height:240px;overflow:auto;padding:4px 12px 10px">${items.map((x) => `<label style="display:flex;gap:10px;align-items:center;margin:6px 0;font-size:14px;color:var(--text)"><input type="checkbox" value="${esc(x)}" style="width:22px;height:22px" onchange="drvMultiUpd('${id}')"> ${esc(x)}</label>`).join('')}</div></details>`;
}
function drvMultiUpd(id) { const d = drvEl(id), n = d.querySelectorAll('input:checked').length; d.querySelector('.msel-n').textContent = n ? '(' + n + ' choisi' + (n > 1 ? 's' : '') + ')' : ''; }
const drvMultiVal = (id) => [...drvEl(id).querySelectorAll('input:checked')].map((x) => x.value);
const DRV_REGIONS = ['Conakry', 'Boké', 'Kindia', 'Mamou', 'Labé', 'Faranah', 'Kankan', "N'Zérékoré"];
const drvHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const drvAt = (hm) => { if (!hm) return new Date().toISOString(); const [h, m] = hm.split(':'); const d = new Date(); d.setHours(+h, +m, 0, 0); return (d > new Date() ? new Date() : d).toISOString(); };
const drvFuelSel = (id, label) => `<label>${label || 'Carburant dans le réservoir (litres) — obligatoire'}</label><input id="${id}" type="number" inputmode="decimal" step="0.1" min="0" placeholder="Ex. 45">`;
const drvFuelTxt = (v) => (v == null ? '—' : fmt(v) + ' L');
const drvPrice = () => Number((drvView() || {}).fuelPrice) || 12000;
function drvFuelCalc() { const l = drvNum('f-liters'), b = drvEl('f-cost'); if (b && !b.dataset.manual) b.value = l > 0 ? Math.round(l * drvPrice()) : ''; }
const drvSrc = (f) => ({ TANK: 'Dépôt', VOUCHER: 'Bon' }[f.source] || 'Station') + (f.station && f.source !== 'TANK' ? ' · ' + f.station : '') + (f.notes ? ' · ' + f.notes : '');
function drvStartForm(tripId) {
  const me = drvView(), v = me.vehicle, t = tripId ? drvTripOf(tripId) : null, truck = drvIsTruck(me);
  const id = tripId || drvUid();
  const sitesList = (me.operationSites || []).slice();
  const truckRegs = `<label>Site(s) d'opération — cochez un ou plusieurs *</label>${sitesList.length ? drvMulti('g-site', "Sites d'opération", sitesList) : ''}<label>Autre site (facultatif)</label><input id="f-dest" placeholder="Site non listé">`;
  const regs = truck ? truckRegs : `<label>Destinations — cochez une ou plusieurs</label>${drvMulti('g-con', '<svg class="ic" aria-hidden="true"><use href="#i-map-pin"/></svg> Conakry — quartiers', GEO_CONAKRY)}${drvMulti('g-int', 'Hors Conakry — villes et préfectures', GEO_VILLES)}<label>Autre destination (facultatif)</label><input id="f-dest" placeholder="${truck ? 'Site minier de…' : 'Précisez si absente des listes'}" value="${esc(t ? t.destination || '' : '')}">`;
  const motif = truck
    ? `<label>Produit transporté — cochez un ou plusieurs *</label>${drvMulti('g-prod', 'Produit transporté', TRUCK_PRODUCTS)}<label>Autre produit (si « Autre » coché)</label><input id="f-prodo" placeholder="Précisez le produit">`
    : `<label>Motif du déplacement</label><select id="f-ptype"><option value="MISSION">Mission</option><option value="AUTRE">Autre</option></select>`;
  drvSheet('1 · Départ', `
    <div class="drv-card" style="margin:0 0 6px"><div class="drv-row"><span>Date</span><b>${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</b></div><div class="drv-row"><span>${truck ? 'Camion' : 'Véhicule'}</span><b>${esc(v ? v.plate : '')} ${esc(v ? v.label || '' : '')}</b></div></div>
    <label>Heure de départ</label><input id="f-hm" type="time" value="${drvHM()}">
    <label>Kilométrage au départ (km) — obligatoire</label><input id="f-odo" type="number" inputmode="numeric" value="${esc(v ? v.mileage : '')}">
    ${drvFuelSel('f-fuel')}
    ${truck ? '' : `<label>Trajet</label><input id="f-route" value="${esc(t && t.route ? t.route : '')}" placeholder="Ex. Conakry → Coyah → Kindia">`}
    ${regs}${motif}
    <label>Précisions sur le motif</label><input id="f-purpose" placeholder="${truck ? 'Matériau, client, chantier…' : 'Objet de la mission'}">
    <label>État du véhicule avant le départ</label><select id="f-cond" onchange="drvToggleStart()"><option value="RAS">Bon état (RAS)</option><option value="ANOMALIE">Signaler une anomalie</option></select>
    <div id="f-anom-box" style="display:none"><label>Description des anomalies</label><textarea id="f-anom" rows="3" placeholder="Pneu usé, feux cassés, fuite, rétroviseur…"></textarea></div>`, async () => {
    const odometer = drvNum('f-odo');
    if (odometer === undefined || odometer < 0) throw new Error('Saisissez le kilométrage au départ.');
    if (drvNum('f-fuel') === undefined || drvNum('f-fuel') < 0) throw new Error('Indiquez les litres de carburant dans le réservoir au départ.');
    const cond = drvEl('f-cond').value, anom = drvEl('f-anom').value.trim();
    if (cond === 'ANOMALIE' && !anom) throw new Error("Décrivez l'anomalie constatée.");
    const sites = truck ? drvMultiVal('g-site') : [];
    const prods = truck ? drvMultiVal('g-prod').map((x) => (x === 'Autre' ? drvFix(drvEl('f-prodo').value) || 'Autre' : x)) : [];
    if (truck && !sites.length && !drvFix(drvEl('f-dest').value)) throw new Error("Cochez au moins un site d'opération.");
    if (truck && !prods.length) throw new Error('Cochez le produit transporté.');
    const quartiers = truck ? [] : drvMultiVal('g-con'), villes = truck ? [] : drvMultiVal('g-int');
    const regions = [...new Set([...(quartiers.length ? ['Conakry'] : []), ...villes.map((c) => GEO_REGION_OF[c]).filter(Boolean)])];
    const ptype = truck ? 'TRANSPORT' : drvEl('f-ptype').value;
    const dest = [...sites, ...quartiers, ...villes, drvFix(drvEl('f-dest').value)].filter(Boolean).join(', ');
    if (!dest) throw new Error('Choisissez au moins une destination.');
    const g = await drvGeo();
    drvEnqueue({ type: 'start', tripId: id, payload: { odometer, fuelLiters: drvNum('f-fuel'), occurredAt: drvAt(drvEl('f-hm').value), offline: !navigator.onLine, purposeType: ptype, regions, destination: dest || undefined, route: drvEl('f-route') ? drvEl('f-route').value.trim() || undefined : undefined, operationSites: truck ? [...sites, drvFix(drvEl('f-dest').value)].filter(Boolean) : undefined, products: truck ? prods : undefined, purpose: drvEl('f-purpose').value.trim() || undefined, preCondition: cond, preAnomalies: cond === 'ANOMALIE' ? anom : undefined, ...g } });
  }, 'Enregistrer le départ');
  drvToggleStart();
}
const drvOutside = (t) => (t.regions || []).some((r) => r !== 'Conakry');
function drvPauseForm(tripId) {
  const t = drvTripOf(tripId);
  drvSheet('Pause', `<label>Heure de la pause</label><input id="f-hm" type="time" value="${drvHM()}">
    <label>Kilométrage à la pause (km) — obligatoire (départ : ${esc(t.startMileage)})</label><input id="f-odo" type="number" inputmode="numeric">`, async () => {
    const odometer = drvNum('f-odo');
    if (odometer === undefined || odometer < t.startMileage) throw new Error(`Le kilométrage doit être supérieur ou égal à ${t.startMileage}.`);
    drvEnqueue({ type: 'pause', tripId, payload: { odometer, occurredAt: drvAt(drvEl('f-hm').value), offline: !navigator.onLine } });
  }, 'Enregistrer la pause');
}
function drvArriveCalc(startKm) {
  const km = drvNum('f-odo'), box = drvEl('f-calc'); if (!box) return;
  if (km === undefined || km < startKm) { box.textContent = ''; return; }
  const dist = km - startKm, sh = DRV.lastSheet;
  const liters = sh ? sh.fuel.reduce((a, f) => a + f.liters, 0) : 0;
  box.innerHTML = `Distance parcourue : <b>${fmt(dist)} km</b>${liters > 0 && dist >= 20 ? ` · Consommation : <b>${(Math.round(liters / dist * 1000) / 10)} L/100 km</b>` : ''}`;
}
function drvArriveForm(tripId) {
  const t = drvTripOf(tripId), truck = drvIsTruck(drvView()), outside = drvOutside(t);
  const late = t.scheduledArrival && Date.now() > +new Date(t.scheduledArrival) + 15 * 60000;
  const places = (drvView().operationSites || []).concat(['Autre lieu']);
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  drvSheet('3 · Arrivée / retour — ' + (t.destination || 'mission'), `
    ${outside || truck ? `<label>${truck ? "Heure d'arrêt" : "Date et heure d'arrivée à destination"}</label><input id="f-arrdt" type="datetime-local" value="${nowLocal}">` : ''}
    <label>Kilométrage au retour / à l'arrêt (km) — obligatoire (départ : ${esc(t.startMileage)})</label><input id="f-odo" type="number" inputmode="numeric" oninput="drvArriveCalc(${Number(t.startMileage)})">
 ${drvFuelSel('f-fuel')}
    <div id="f-calc" class="drv-warn" style="background:#eef4fb;color:#1F3A5F;border-color:#c9daf0"></div>
    ${truck ? `<label>Nombre de mouvements (chargement → déchargement) *</label><input id="f-voy" type="number" inputmode="numeric" value="1">
      <label>Nom du chargeur (facultatif)</label><input id="f-loader" placeholder="Chargeur / pointeur sur le site">
      <label>Lieu de chargement — cochez *</label>${drvMulti('g-load', '<svg class="ic" aria-hidden="true"><use href="#i-upload"/></svg> Lieu de chargement', places)}<label>Lieu de déchargement — cochez *</label>${drvMulti('g-unload', '<svg class="ic" aria-hidden="true"><use href="#i-download"/></svg> Lieu de déchargement', places)}
      ${t.pauseMileage != null ? `<div class="drv-warn" style="background:#eef4fb;color:#1F3A5F;border-color:#c9daf0">Pause enregistrée : ${fmt(t.pauseMileage)} km${t.pauseAt ? ' à ' + new Date(t.pauseAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</div>` : ''}` : ''}
    ${truck ? `<label>Tonnage par voyage (cochez) *</label><div onchange="document.getElementById('f-ton-o').style.display=(document.querySelector('input[name=f-ton]:checked')||{}).value==='o'?'block':'none'" style="display:flex;flex-wrap:wrap;gap:8px 14px;margin:4px 0">${TON_CHOICES.map(n => `<label style="display:flex;align-items:center;gap:5px;margin:0"><input type="radio" name="f-ton" value="${n}" style="width:auto"> ${n} t</label>`).join('')}<label style="display:flex;align-items:center;gap:5px;margin:0"><input type="radio" name="f-ton" value="o" style="width:auto"> Autre</label></div><input id="f-ton-o" inputmode="decimal" placeholder="Tonnage (ex. 38)" style="display:none">` : ''}
    <label>Nom de la personne qui réceptionne</label><input id="f-recipient">
    <label>État du véhicule</label><select id="f-cond"><option value="RAS">RAS</option><option value="DOMMAGE_MINEUR">Dommage mineur</option><option value="DOMMAGE_MAJEUR">Dommage majeur</option><option value="PANNE">Panne</option></select>
    ${late ? '<label>Motif du retard</label><input id="f-delay" placeholder="Embouteillage, contrôle, attente chargement…">' : ''}
    <label>Observations</label><textarea id="f-obs" rows="2"></textarea>
    ${truck ? '' : '<label>Signature du destinataire (bon de livraison)</label><canvas class="drv-sig" id="f-sig" width="600" height="260"></canvas><a href="#" onclick="drvSigClear();return false;" style="font-size:12px">Effacer la signature</a>'}`, async () => {
    const odometer = drvNum('f-odo');
    if (odometer === undefined) throw new Error("Saisissez le kilométrage de retour / d'arrêt.");
    if (odometer < t.startMileage) throw new Error(`Le kilométrage doit être supérieur ou égal à ${t.startMileage}.`);
    if (drvNum('f-fuel') === undefined || drvNum('f-fuel') < 0) throw new Error("Indiquez les litres de carburant dans le réservoir à l'arrivée.");
    let tonnage;
    if (drvEl('f-voy')) {
      const r = document.querySelector('input[name="f-ton"]:checked');
      tonnage = r ? (r.value === 'o' ? Number(String(drvEl('f-ton-o').value).replace(',', '.')) : Number(r.value)) : undefined;
      if (!tonnage || !(tonnage > 0)) throw new Error('Cochez le tonnage transporté (pour le contrôle avec les pointeurs).');
    }
    const loadPlaces = drvEl('g-load') ? drvMultiVal('g-load') : undefined, unloadPlaces = drvEl('g-unload') ? drvMultiVal('g-unload') : undefined;
    if (drvEl('g-load') && (!loadPlaces.length || !unloadPlaces.length)) throw new Error('Cochez le lieu de chargement et le lieu de déchargement.');
    const g = await drvGeo();
    const sig = drvEl('f-sig') ? drvSigData() : undefined;
    const arr = drvEl('f-arrdt') && drvEl('f-arrdt').value ? new Date(drvEl('f-arrdt').value).toISOString() : new Date().toISOString();
    drvEnqueue({ type: 'arrive', tripId, payload: { odometer, fuelLiters: drvNum('f-fuel'), tripsCount: drvEl('f-voy') ? drvNum('f-voy') : undefined, tonnagePerTrip: tonnage, loadPlaces, unloadPlaces, loaderName: drvEl('f-loader') ? drvEl('f-loader').value.trim() || undefined : undefined, occurredAt: arr, offline: !navigator.onLine, recipientName: drvEl('f-recipient').value, endCondition: drvEl('f-cond').value, delayReason: drvEl('f-delay') ? drvEl('f-delay').value : undefined, observations: drvEl('f-obs').value, signatureData: sig, ...g } });
  }, 'Enregistrer l\'arrivée');
  if (drvEl('f-sig')) drvSigInit();
}
let drvSigDrawn = false;
function drvSigInit() {
  const c = drvEl('f-sig'), ctx = c.getContext('2d'); drvSigDrawn = false;
  ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = '#1F3A5F';
  let down = false;
  const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.onpointerdown = (e) => { down = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); c.setPointerCapture(e.pointerId); };
  c.onpointermove = (e) => { if (!down) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); drvSigDrawn = true; };
  c.onpointerup = () => { down = false; };
}
function drvSigClear() { const c = drvEl('f-sig'); c.getContext('2d').clearRect(0, 0, c.width, c.height); drvSigDrawn = false; }
function drvSigData() {
  if (!drvSigDrawn) return undefined;
  const c = drvEl('f-sig'), s = document.createElement('canvas'); s.width = 300; s.height = 130;
  const x = s.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 130); x.drawImage(c, 0, 0, 300, 130);
  return s.toDataURL('image/png');
}
const DRV_STATIONS = ['Shell', 'TotalEnergies', 'Star Oil', 'Tradex', 'Autre'];
function drvFuelSrc() {
  const src = drvEl('f-src').value;
  drvEl('f-bon').style.display = src === 'VOUCHER' ? 'block' : 'none';
  drvEl('f-stbox').style.display = src === 'STATION' ? 'block' : 'none';
  drvFuelStOther();
}
function drvFuelStOther() { drvEl('f-stother').style.display = drvEl('f-src').value === 'STATION' && drvEl('f-st').value === 'Autre' ? 'block' : 'none'; }
function drvFuelForm(tripId) {
  const me = drvView();
  drvSheet('Plein de carburant', `
    <label>Kilométrage actuel (km)</label><input id="f-odo" type="number" inputmode="numeric" value="${esc(me.vehicle ? me.vehicle.mileage : '')}">
    <label>Quantité (litres)</label><input id="f-liters" type="number" inputmode="decimal" step="0.01" oninput="drvFuelCalc()">
    <label>Montant total (GNF) — calculé à ${fmt(drvPrice())} GNF le litre, modifiable s'il diffère du reçu</label><input id="f-cost" type="number" inputmode="numeric" oninput="this.dataset.manual='1'">
    <label>Origine du carburant</label><select id="f-src" onchange="drvFuelSrc()"><option value="STATION">Station</option><option value="TANK">Dépôt de l'entreprise</option><option value="VOUCHER">Bon (remis par l'entreprise)</option></select>
    <div id="f-stbox"><label>Station</label><select id="f-st" onchange="drvFuelStOther()">${DRV_STATIONS.map((x) => `<option>${esc(x)}</option>`).join('')}</select>
      <div id="f-stother" style="display:none"><label>Préciser la station</label><input id="f-stname" placeholder="Nom de la station"></div></div>
    <div id="f-bon" style="display:none"><label>Numéro du bon (facultatif)</label><input id="f-bonno"></div>
    ${drvPhotoField('Photo du reçu ou du ticket de caisse — obligatoire', false)}`, async () => {
    const liters = drvNum('f-liters');
    if (!liters || liters <= 0) throw new Error('Saisissez les litres.');
    const src = drvEl('f-src').value;
    let station = src === 'STATION' ? drvEl('f-st').value : "Dépôt de l'entreprise";
    if (src === 'STATION' && station === 'Autre') { station = drvFix(drvEl('f-stname').value); if (!station) throw new Error('Précisez le nom de la station.'); }
    if (!DRV_PHOTOS.length) throw new Error('La photo du reçu est obligatoire.');
    const g = await drvGeo();
    drvEnqueue({ type: 'fuel', tripId: tripId || undefined, photos: DRV_PHOTOS.slice(), payload: { liters, totalCost: drvNum('f-cost'), source: src, voucherNo: drvEl('f-bonno').value.trim() || undefined, station, odometer: drvNum('f-odo'), occurredAt: new Date().toISOString(), offline: !navigator.onLine, ...g } });
  }, 'Enregistrer le plein');
  drvFuelSrc();
}
function drvBreakdownForm(tripId) {
  drvSheet('Déclarer une panne', `
    <label>Gravité</label><select id="f-sev"><option value="LOW">Légère</option><option value="MEDIUM" selected>Moyenne</option><option value="HIGH">Grave — immobilisé</option><option value="CRITICAL">Critique — danger</option></select>
    <label>Description</label><textarea id="f-desc" rows="3" placeholder="Que se passe-t-il ? Voyants, bruit, fuite…"></textarea>
    ${drvPhotoField('Photos (jusqu’à 4)', true)}
    <div class="desc" style="font-size:12px;color:var(--muted);margin-top:8px">Le véhicule sera immobilisé et le gestionnaire de flotte alerté avec votre position GPS.</div>`, async () => {
    const description = drvEl('f-desc').value.trim();
    if (!description) throw new Error('Décrivez la panne.');
    const g = await drvGeo();
    drvEnqueue({ type: 'breakdown', tripId: tripId || undefined, photos: DRV_PHOTOS.slice(), payload: { severity: drvEl('f-sev').value, description, occurredAt: new Date().toISOString(), offline: !navigator.onLine, ...g } });
  }, 'Envoyer la panne');
}
function drvIncidentForm(tripId) {
  drvSheet('Déclarer un incident', `
    <label>Type</label><select id="f-kind"><option value="ACCIDENT">Accident</option><option value="POLICE_CONTROL">Contrôle de police</option><option value="ROAD_EVENT">Événement routier</option><option value="OTHER">Autre</option></select>
    <label>Gravité</label><select id="f-sev"><option value="LOW">Faible</option><option value="MEDIUM">Moyenne</option><option value="HIGH">Grave</option><option value="CRITICAL">Critique</option></select>
    <label>Description</label><textarea id="f-desc" rows="3"></textarea>
    ${drvPhotoField('Photos (jusqu’à 4)', true)}`, async () => {
    const description = drvEl('f-desc').value.trim();
    if (!description) throw new Error("Décrivez l'incident.");
    const g = await drvGeo();
    drvEnqueue({ type: 'incident', tripId: tripId || undefined, photos: DRV_PHOTOS.slice(), payload: { kind: drvEl('f-kind').value, severity: drvEl('f-sev').value, description, occurredAt: new Date().toISOString(), offline: !navigator.onLine, ...g } });
  }, "Envoyer l'incident");
}

/* ---------- Activation de l'appareil (code à 6 chiffres ou QR) ---------- */
function drvResetDevice() { try { localStorage.removeItem('syllo_device_id'); } catch (e) {} DRV.blocked = ''; drvActivationScreen(); }
function drvActivationScreen() {
  drvPill();
  drvEl('drv-root').innerHTML = `<div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-phone"/></svg> Activer cet appareil</h4>
    <div style="font-size:14px;color:var(--muted)">Votre compte est personnel et fonctionne sur un seul appareil. Saisissez le code à 6 chiffres remis par le gestionnaire de flotte, ou scannez son QR code.</div>
    <label>Code d'activation</label><input id="act-code" inputmode="text" autocomplete="off" style="font-size:20px;text-align:center" placeholder="000000">
    <video id="act-video" playsinline style="display:none;width:100%;border-radius:8px;margin-top:10px"></video>
    <div id="act-msg"></div>
    <button class="drv-btn gold" onclick="drvActivate()">Activer</button>
    <button class="drv-btn ghost" onclick="drvScan()"><svg class="ic" aria-hidden="true"><use href="#i-camera"/></svg> Scanner le QR code</button></div>`;
}
async function drvActivate() {
  const code = drvEl('act-code').value.trim();
  try {
    let fp = localStorage.getItem('syllo_fp'); if (!fp) { fp = drvUid(); localStorage.setItem('syllo_fp', fp); }
    const r = await api('/driver/activate', { method: 'POST', body: { code, fingerprint: fp, model: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || 'mobile', os: navigator.userAgent.slice(0, 110) } });
    localStorage.setItem('syllo_device_id', r.deviceId);
    drvLoad();
  } catch (e) { drvEl('act-msg').innerHTML = `<div class="drv-warn" style="margin-top:10px">${esc(e.message)}</div>`; }
}
async function drvScan() {
  const msg = drvEl('act-msg');
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices) { msg.innerHTML = '<div class="drv-warn" style="margin-top:10px">Scan non disponible sur ce navigateur : saisissez le code à 6 chiffres.</div>'; return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = drvEl('act-video'); video.srcObject = stream; video.style.display = 'block'; await video.play();
    const det = new BarcodeDetector({ formats: ['qr_code'] });
    const tick = async () => {
      if (!drvEl('act-video')) return stream.getTracks().forEach((t) => t.stop());
      try { const found = await det.detect(video); if (found.length) { stream.getTracks().forEach((t) => t.stop()); drvEl('act-code').value = found[0].rawValue; return drvActivate(); } } catch (e) {}
      setTimeout(tick, 300);
    };
    tick();
  } catch (e) { msg.innerHTML = '<div class="drv-warn" style="margin-top:10px">Caméra inaccessible : saisissez le code à 6 chiffres.</div>'; }
}

