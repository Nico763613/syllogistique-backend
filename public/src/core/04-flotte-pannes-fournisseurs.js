async function mpNew() {
  try {
    const [types, vehicles] = await Promise.all([api('/maintenance/types'), api('/vehicles?siteId=' + encodeURIComponent(state.siteId || ''))]);
    dtOverlay('', 'Nouveau plan d\'entretien', `<label>Véhicule</label><select id="mp-veh">${vehicles.map((v) => `<option value="${esc(v.id)}">${esc(v.internalNumber)} — ${esc(v.registrationNumber)}</option>`).join('')}</select>
      <label>Type d'entretien</label><select id="mp-type">${types.map((t) => `<option value="${esc(t.code)}">${esc(t.label)}</option>`).join('')}</select>
      <div class="grid-2"><div><label>Tous les … km</label><input id="mp-km" type="number" inputmode="numeric" placeholder="ex. 10000"></div><div><label>Tous les … jours</label><input id="mp-days" type="number" inputmode="numeric" placeholder="ex. 180"></div>
      <div><label>Alerter … km avant</label><input id="mp-akm" type="number" inputmode="numeric" value="500"></div><div><label>Alerter … jours avant</label><input id="mp-adays" type="number" inputmode="numeric" value="15"></div>
      <div><label>Dernier entretien à (km) — facultatif</label><input id="mp-lkm" type="number" inputmode="numeric"></div><div><label>Dernier entretien le — facultatif</label><input id="mp-ldate" type="date"></div></div>
      <div class="desc">Indiquez au moins un seuil (km ou jours). Sans dernier entretien connu, le kilométrage actuel et aujourd'hui servent de point de départ.</div>`, 'Créer le plan', 'mpNewSend');
  } catch (e) { alert(e.message); }
}
async function mpNewSend() {
  const m = document.getElementById('dt-ov-msg'), n = (id) => { const v = document.getElementById(id).value; return v === '' ? undefined : Number(v); };
  try {
    const ld = document.getElementById('mp-ldate').value;
    await api('/maintenance-plans', { method: 'POST', body: { vehicleId: document.getElementById('mp-veh').value, maintenanceTypeCode: document.getElementById('mp-type').value, intervalKm: n('mp-km'), intervalDays: n('mp-days'), alertKm: n('mp-akm'), alertDays: n('mp-adays'), lastDoneKm: n('mp-lkm'), ...(ld ? { lastDoneAt: new Date(ld + 'T08:00:00').toISOString() } : {}) } });
    document.getElementById('dt-ov').remove(); mpLoad();
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function mpEdit(id) {
  try {
    const r = await api('/maintenance-plans?siteId=' + encodeURIComponent(state.siteId || '')), p = r.items.find((x) => x.id === id); if (!p) return;
    dtOverlay(id, 'Modifier — ' + esc(p.vehicle) + ' · ' + esc(p.type), `<div class="grid-2"><div><label>Tous les … km</label><input id="mp-km" type="number" inputmode="numeric" value="${p.intervalKm || ''}"></div><div><label>Tous les … jours</label><input id="mp-days" type="number" inputmode="numeric" value="${p.intervalDays || ''}"></div>
      <div><label>Alerter … km avant</label><input id="mp-akm" type="number" inputmode="numeric" value="${p.alertKm}"></div><div><label>Alerter … jours avant</label><input id="mp-adays" type="number" inputmode="numeric" value="${p.alertDays}"></div></div>
      <label><input id="mp-active" type="checkbox" ${p.active ? 'checked' : ''} style="width:auto"> Plan actif (décochez pour suspendre les alertes)</label>`, 'Enregistrer', 'mpEditSend');
  } catch (e) { alert(e.message); }
}
async function mpEditSend(id) {
  const m = document.getElementById('dt-ov-msg'), n = (k) => { const v = document.getElementById(k).value; return v === '' ? undefined : Number(v); };
  try {
    await api('/maintenance-plans/' + id, { method: 'PATCH', body: { intervalKm: n('mp-km'), intervalDays: n('mp-days'), alertKm: n('mp-akm'), alertDays: n('mp-adays'), active: document.getElementById('mp-active').checked } });
    document.getElementById('dt-ov').remove(); mpLoad();
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function mpSchedule(id) {
  const t = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  dtOverlay(id, 'Planifier l\'entretien', `<label>Date prévue</label><input id="mp-sdate" type="date" value="${t}"><label>Consigne à l'atelier (facultatif)</label><textarea id="mp-snote" rows="2" placeholder="Ex. prévoir 2 filtres, véhicule disponible à 8 h"></textarea>`, 'Planifier et prévenir l\'atelier', 'mpScheduleSend');
}
async function mpScheduleSend(id) {
  const m = document.getElementById('dt-ov-msg');
  try {
    const d = document.getElementById('mp-sdate').value, note = document.getElementById('mp-snote').value.trim();
    if (!d) throw new Error('Choisissez une date.');
    await api('/maintenance-plans/' + id + '/schedule', { method: 'POST', body: { maintenanceDate: new Date(d + 'T08:00:00').toISOString(), ...(note ? { note } : {}) } });
    document.getElementById('dt-ov').remove(); renderView(state.view);
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function mpComplete(maintenanceId) {
  DRV_PHOTOS.length = 0;
  dtOverlay(maintenanceId, 'Entretien effectué', `<label>Kilométrage actuel (facultatif)</label><input id="mp-ckm" type="number" inputmode="numeric">
    <div class="grid-2"><div><label>Pièces (GNF)</label><input id="mp-cparts" type="number" inputmode="numeric" value="0"></div><div><label>Main-d'œuvre (GNF)</label><input id="mp-clabor" type="number" inputmode="numeric" value="0"></div></div>
    <label>Travaux réalisés (facultatif)</label><textarea id="mp-cnote" rows="2"></textarea>${drvPhotoField('Photo de la facture — obligatoire si un coût est indiqué', false)}`, 'Déclarer effectué', 'mpCompleteSend');
}
async function mpCompleteSend(id) {
  const m = document.getElementById('dt-ov-msg'), n = (k) => { const v = document.getElementById(k).value; return v === '' ? undefined : Number(v); };
  try {
    const parts = n('mp-cparts') || 0, labor = n('mp-clabor') || 0, note = document.getElementById('mp-cnote').value.trim();
    if (parts + labor > 0 && !DRV_PHOTOS.length) throw new Error('La photo de la facture est obligatoire quand un coût est indiqué.');
    m.innerHTML = '<div class="desc">Envoi en cours…</div>';
    const invoiceUrl = DRV_PHOTOS.length ? await drvUpload(DRV_PHOTOS[0], 'maintenance_invoice') : undefined;
    await api('/maintenance-plans/complete/' + id, { method: 'POST', body: { mileage: n('mp-ckm'), partsCost: parts, laborCost: labor, ...(note ? { description: note } : {}), ...(invoiceUrl ? { invoiceUrl } : {}) } });
    document.getElementById('dt-ov').remove(); renderView(state.view);
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ---------- Circuit panne → réparation → remise en service ---------- */
const DT_STAGE = { DECLAREE: ['bad', 'Déclarée'], QUALIFIEE: ['warn', 'Qualifiée'], EN_REPARATION: ['info', 'En réparation'], EN_ATTENTE_PIECES: ['warn', 'En attente de pièces'], REMISE_EN_SERVICE: ['ok', 'Remise en service'] };
function dtStageHtml(i) {
  const [c, l] = DT_STAGE[i.stage] || ['info', i.stage || '—'];
  return `<span class="badge ${c}">${l}</span>${i.priority === 'URGENTE' ? ' <span class="badge bad">Urgent</span>' : ''}${i.late ? ' <span class="badge bad">En retard</span>' : ''}`;
}
function dtInfoHtml(i) {
  const dd = (x) => new Date(x).toLocaleDateString('fr-FR');
  const meta = [i.expectedEndAt ? 'Remise en service prévue le ' + dd(i.expectedEndAt) : '', i.mechanicName ? 'Mécanicien : ' + esc(i.mechanicName) : '', i.need ? 'Pièces : ' + esc(i.need.reference) : ''].filter(Boolean).join(' · ');
  return (meta ? `<div style="margin-top:4px;font-size:13px;color:var(--muted)">${meta}</div>` : '') + (i.next ? `<div style="margin-top:4px;font-size:13px"><b>Prochaine étape — ${esc(i.next.who)} :</b> ${esc(i.next.text)}</div>` : '');
}
function dtButtons(i) {
  if (i.endedAt) return '';
  const role = (state.user && state.user.role) || '';
  const FLEET = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE'];
  const b = (fn, label, gold) => `<button class="btn small ${gold ? 'gold' : ''}" onclick="${fn}('${esc(i.id)}')">${label}</button>`;
  const out = [];
  if (i.stage === 'DECLAREE' && FLEET.includes(role)) out.push(b('dtQualify', 'Qualifier', true));
  if (role === 'MECANICIEN' || role === 'SUPER_ADMIN') {
    if (!i.mechanicId && ['DECLAREE', 'QUALIFIEE'].includes(i.stage)) out.push(b('dtTake', 'Prendre en charge', true));
    if (i.stage === 'EN_REPARATION' && (i.mineToRepair || role === 'SUPER_ADMIN')) { out.push(b('dtParts', 'Demander des pièces')); out.push(b('atResolve', 'Réparation terminée', true)); }
  }
  if (i.stage === 'EN_ATTENTE_PIECES' && ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'MAGASINIER', 'MECANICIEN'].includes(role)) out.push(b('dtPartsIn', 'Pièces reçues', true));
  return out.join(' ');
}
function dtOverlay(id, title, bodyHtml, okLabel, okFn) {
  const ov = document.createElement('div'); ov.id = 'dt-ov'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,25,45,.55);z-index:90;display:flex;align-items:center;justify-content:center;padding:14px';
  ov.innerHTML = `<div class="panel" style="max-width:460px;width:100%;max-height:92vh;overflow:auto;margin:0"><h3>${title}</h3>${bodyHtml}<div id="dt-ov-msg"></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn gold" style="flex:1;min-height:48px" onclick="${okFn}('${esc(id)}')">${okLabel}</button><button class="btn" style="min-height:48px" onclick="document.getElementById('dt-ov').remove()">Annuler</button></div></div>`;
  document.body.appendChild(ov);
}
function dtQualify(id) {
  dtOverlay(id, 'Qualifier la panne', `<label>Priorité</label><select id="dt-q-prio"><option value="NORMALE">Normale (remise en service sous 3 jours)</option><option value="URGENTE">Urgente (sous 24 h)</option></select>
    <label>Remise en service prévue avant le (facultatif — sinon délai par défaut)</label><input id="dt-q-end" type="date">
    <label>Consigne à l'atelier (facultatif)</label><textarea id="dt-q-note" rows="2" placeholder="Ex. priorité aux freins, véhicule attendu lundi"></textarea>`, 'Qualifier et prévenir l\'atelier', 'dtQualifySend');
}
async function dtQualifySend(id) {
  const m = document.getElementById('dt-ov-msg');
  try {
    const end = document.getElementById('dt-q-end').value, note = document.getElementById('dt-q-note').value.trim();
    await api('/downtimes/' + id + '/qualify', { method: 'POST', body: { priority: document.getElementById('dt-q-prio').value, ...(end ? { expectedEndAt: new Date(end + 'T18:00:00').toISOString() } : {}), ...(note ? { note } : {}) } });
    document.getElementById('dt-ov').remove(); renderView(state.view);
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function dtTake(id) {
  try { await api('/downtimes/' + id + '/take', { method: 'POST', body: {} }); } catch (e) { alert(e.message); }
  renderView(state.view);
}
function dtParts(id) {
  dtOverlay(id, 'Demander des pièces', `<div class="desc">Une ligne par pièce, avec la quantité en premier. Ex. « 2 plaquettes de frein avant ». La demande part aux Achats et le véhicule reste immobilisé jusqu'à réception.</div>
    <label>Pièces nécessaires</label><textarea id="dt-p-lines" rows="4" placeholder="2 plaquettes de frein avant&#10;1 filtre à huile"></textarea>
    <label>Précision (facultatif)</label><input id="dt-p-note" type="text">`, 'Envoyer aux Achats', 'dtPartsSend');
}
async function dtPartsSend(id) {
  const m = document.getElementById('dt-ov-msg');
  try {
    const lines = document.getElementById('dt-p-lines').value.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => {
      const mm = x.match(/^(\d+(?:[.,]\d+)?)\s*[x×]?\s+(.+)$/i);
      return mm ? { quantity: Number(mm[1].replace(',', '.')), designation: mm[2].trim() } : { quantity: 1, designation: x };
    });
    if (!lines.length) throw new Error('Indiquez au moins une pièce.');
    const note = document.getElementById('dt-p-note').value.trim();
    await api('/downtimes/' + id + '/parts', { method: 'POST', body: { lines, ...(note ? { note } : {}) } });
    document.getElementById('dt-ov').remove(); renderView(state.view);
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function dtPartsIn(id) {
  try { await api('/downtimes/' + id + '/parts-received', { method: 'POST', body: {} }); } catch (e) { alert(e.message); }
  renderView(state.view);
}
async function loadDowntimes() {
  const box = document.getElementById('dt-list');
  if (!box) return;
  try {
    const r = await api('/downtimes?siteId=' + state.siteId);
    box.innerHTML = r.items.length ? `<div class="desc">${r.summary.open} en cours • ${fmt(r.summary.totalDays)} jour(s) cumulés • coût : <b>${fmt(r.summary.totalCost)} GNF</b></div>
      <table><thead><tr><th>Véhicule</th><th>Type</th><th>Motif</th><th>Étape</th><th>Depuis</th><th>Jours</th><th>Coût</th><th></th></tr></thead><tbody>${r.items.map(i => `
      <tr><td>${esc(i.vehicle)}</td><td>${esc(i.category)}</td><td>${esc(i.reason)}${dtInfoHtml(i)}</td><td>${dtStageHtml(i)}</td><td>${new Date(i.startedAt).toLocaleDateString('fr-FR')}</td><td class="mono">${i.days}</td><td class="mono">${fmt(i.actualCost ?? i.estimatedCost)}</td>
      <td>${i.endedAt ? '<svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg> Remis en service' : `${dtButtons(i)} <button class="btn small" onclick="resolveDowntime('${esc(i.id)}')">Remettre en service</button>`}</td></tr>`).join('')}</tbody></table>` : '<div class="desc">Aucune immobilisation enregistrée.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function reportDowntime() {
  const msg = document.getElementById('dt-msg');
  try {
    const cost = document.getElementById('dt-cost').value;
    await api('/downtimes', { method: 'POST', body: { vehicleId: document.getElementById('dt-vehicle').value, category: document.getElementById('dt-cat').value, reason: document.getElementById('dt-reason').value.trim(), ...(cost ? { estimatedCost: Number(cost) } : {}) } });
    renderView(state.view);
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function resolveDowntime(id) {
  const note = prompt('Travaux réalisés / observation (facultatif) :');
  if (note === null) return;
  const cost = prompt('Coût réel en GNF (facultatif) :');
  try {
    await api('/downtimes/' + id + '/resolve', { method: 'POST', body: { ...(note ? { resolutionNote: note } : {}), ...(cost ? { actualCost: Number(cost) } : {}) } });
    renderView(state.view);
  } catch (e) { alert(e.message); }
}
function statusBadge(s) {
  const map = { AVAILABLE: ['ok', 'Disponible'], ON_MISSION: ['info', 'En mission'], MAINTENANCE: ['warn', 'Maintenance'], IMMOBILIZED: ['bad', 'Immobilisé'], OUT_OF_SERVICE: ['bad', 'Hors service'] };
  const [cls, label] = map[s] || ['info', esc(s)];
  return `<span class="badge ${cls}">${label}</span>`;
}
async function createVehicle() {
  const msg = document.getElementById('v-msg');
  try {
    const g = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
    const created = await api('/vehicles', { method: 'POST', body: {
      siteId: state.siteId,
      ...(otherVal('v-wheels') && Number(otherVal('v-wheels')) > 0 ? { wheels: Math.round(Number(otherVal('v-wheels'))) } : {}),
      ...(otherVal('v-cap') ? { capacity: capFmt(otherVal('v-cap')) } : {}),
      ...(g('v-ttype') ? { truckType: g('v-ttype') } : {}),
      ...(g('v-driver') ? { assignedDriverId: g('v-driver') } : {}),
      vehicleType: document.getElementById('v-type').value,
      internalNumber: document.getElementById('v-internal').value,
      registrationNumber: document.getElementById('v-plate').value,
      brand: document.getElementById('v-brand').value,
      registrationType: document.getElementById('v-regtype').value,
      ...(document.getElementById('v-regtype').value === 'IT' && document.getElementById('v-itexp').value ? { itExpiryDate: document.getElementById('v-itexp').value } : {}),
    }});
    // L'assurance est enregistrée une seule fois, comme document du véhicule
    if (g('v-insexp') || g('v-insref')) {
      await api('/documents', { method: 'POST', body: { vehicleId: created.id, type: 'ASSURANCE', fileUrl: g('v-insref') || '—', ...(g('v-insexp') ? { expiryDate: g('v-insexp') } : {}) } });
    }
    msg.innerHTML = '<div class="msg ok">Véhicule ajouté.</div>';
    renderVehicles(document.getElementById('v-type') && document.getElementById('v-type').disabled ? document.getElementById('v-type').value : undefined);
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}


/* ---------------- ÉDITEUR GÉNÉRIQUE (corriger une fiche déjà enregistrée) ---------------- */
function openEditor(title, fields, onSave) {
  const old = document.getElementById('editor-overlay'); if (old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'editor-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px;';
  ov.innerHTML = `<div class="panel" style="max-width:520px;width:100%;margin:20px auto;"><h3>${esc(title)}</h3>
    ${fields.map(f => `<label>${esc(f.label)}</label>` + (f.options
      ? `<select data-k="${esc(f.key)}">${f.options.map(o => `<option value="${esc(o[0])}" ${String(f.value ?? '') === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`
      : `<input data-k="${esc(f.key)}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" />`)).join('')}
    <div id="editor-msg"></div>
    <div style="margin-top:12px;"><button class="btn gold" id="editor-save"><svg class="ic" aria-hidden="true"><use href="#i-save"/></svg> Enregistrer</button> <button class="btn" onclick="document.getElementById('editor-overlay').remove()">Annuler</button></div></div>`;
  document.body.appendChild(ov);
  document.getElementById('editor-save').onclick = async () => {
    const data = {};
    ov.querySelectorAll('[data-k]').forEach(el => {
      const f = fields.find(x => x.key === el.dataset.k);
      let v = el.value.trim();
      if (f.type === 'number') v = v === '' ? undefined : Number(v);
      if (f.type === 'date') v = v || undefined;
      if (v === '' ) v = undefined;
      data[f.key] = v;
    });
    try { await onSave(data); ov.remove(); } catch (e) { document.getElementById('editor-msg').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
  };
}
const day10 = (d) => (d ? String(d).slice(0, 10) : '');
function vehInfoCard(v) {
  const kind = v.vehicleType === 'TRUCK' ? 'Camion' : 'Véhicule de service';
  const row = (a, b) => `<div class="drv-row"><span>${a}</span><b>${b == null || b === '' ? '—' : esc(b)}</b></div>`;
  return `<div><h4 style="margin:0 0 6px">${kind} — informations</h4>${row('N° interne', v.internalNumber)}${row('Plaque', v.registrationNumber)}${row('Marque / modèle', [v.brand, v.model].filter(Boolean).join(' '))}
    ${v.vehicleType === 'TRUCK' ? row('Type', v.truckType ? ttLabel(v.truckType) : '') + row('Roues', v.wheels) + row('Capacité', v.capacity) : ''}${row('Kilométrage', fmt(v.currentMileage) + ' km')}</div>`;
}
function vehDriverPanel(vid) {
  const v = (window._vehicles || []).find(x => x.id === vid); if (!v) return;
  const kindLbl = v.vehicleType === 'TRUCK' ? 'chauffeur de camion' : 'chauffeur de véhicule de service';
  const d = v.assignedDriver;
  const ov = document.createElement('div');
  ov.id = 'veh-drv-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px;';
  const left = d ? `<div><h4 style="margin:0 0 6px"><svg class="ic" aria-hidden="true"><use href="#i-user"/></svg> Chauffeur affecté</h4>
      <div class="drv-row"><span>Nom</span><b>${esc(d.firstName + ' ' + d.lastName)}</b></div><div class="drv-row"><span>Téléphone</span><b>${esc(d.phone || '—')}</b></div><div class="drv-row"><span>Permis</span><b>${esc(d.licenseNumber || '—')}</b></div>
      <button class="btn gold" style="margin-top:10px" onclick="vehSendInvite('${esc(d.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-message"/></svg> Envoyer le lien par WhatsApp</button></div>`
    : `<div><h4 style="margin:0 0 6px"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Nouveau ${kindLbl}</h4>
      <label>Prénom</label><input id="nd-first" /><label>Nom</label><input id="nd-last" /><label>Téléphone (WhatsApp)</label><input id="nd-phone" type="tel" placeholder="6xx xx xx xx" />
      <label>N° de permis</label><input id="nd-lic" /><label>Catégorie du permis</label><input id="nd-cat" placeholder="Ex : C, EC" /><label>Expiration du permis</label><input id="nd-exp" type="date" />
      <button class="btn gold" style="margin-top:10px" onclick="vehSaveDriver('${esc(v.id)}')">Enregistrer le chauffeur</button></div>`;
  ov.innerHTML = `<div class="panel" style="max-width:760px;width:100%;margin:20px auto;"><h3><svg class="ic" aria-hidden="true"><use href="#i-user"/></svg> Chauffeur — ${esc(v.internalNumber)}</h3>
    <div class="grid-2">${left}${vehInfoCard(v)}</div><div id="nd-msg" style="margin-top:10px"></div>
    <button class="btn" style="margin-top:10px" onclick="document.getElementById('veh-drv-ov').remove();renderView(state.view)">Fermer</button></div>`;
  document.body.appendChild(ov);
}
async function vehSaveDriver(vid) {
  const m = document.getElementById('nd-msg');
  const v = (window._vehicles || []).find(x => x.id === vid);
  const g = (id) => document.getElementById(id).value.trim();
  if (!g('nd-first') || !g('nd-last')) { m.innerHTML = '<div class="msg err">Prénom et nom obligatoires.</div>'; return; }
  if (g('nd-phone').replace(/\D/g, '').length < 8) { m.innerHTML = '<div class="msg err">Numéro de téléphone obligatoire (le lien est envoyé par WhatsApp).</div>'; return; }
  try {
    const dr = await api('/drivers', { method: 'POST', body: { siteId: state.siteId, firstName: g('nd-first'), lastName: g('nd-last'), phone: g('nd-phone'), activity: v.vehicleType,
      licenseNumber: g('nd-lic') || undefined, licenseCategory: g('nd-cat') || undefined, licenseExpiryDate: g('nd-exp') || undefined } });
    await api('/vehicles/' + vid, { method: 'PATCH', body: { assignedDriverId: dr.id } });
    m.innerHTML = '<div class="msg ok">Chauffeur enregistré et affecté au véhicule.</div>';
    await vehSendInvite(dr.id, true);
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function vehSendInvite(driverId, keep) {
  const m = document.getElementById('nd-msg');
  try {
    const link = location.origin + location.pathname.replace(/index\.html$/, '');
    const r = await api('/driver-admin/invite', { method: 'POST', body: { driverId, appUrl: link } });
    const num = r.phone.length === 9 ? '224' + r.phone : r.phone;
    window._invMsg = r.message;
    m.innerHTML = (keep ? m.innerHTML : '') + `<div class="msg ok">Message prêt pour ${esc(r.driver)} (${esc(num)}).</div>
      <a class="btn gold" style="display:inline-block;margin:6px 6px 6px 0;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${esc(num)}?text=${encodeURIComponent(r.message)}">Envoyer par WhatsApp</a>
      <button class="btn" onclick="navigator.clipboard.writeText(window._invMsg).then(()=>alert('Message copié : collez-le dans WhatsApp.'))">Copier le message</button>
      <div class="desc">WhatsApp s'ouvre avec le message prêt : appuyez sur « Envoyer ». Le chauffeur n'aura qu'à choisir son mot de passe : son nom, son téléphone et son véhicule sont déjà enregistrés.</div>`;
  } catch (e) { m.innerHTML = (keep ? m.innerHTML : '') + `<div class="msg err">${esc(e.message)}</div>`; }
}
async function editVehicle(id) {
  const v = (window._vehicles || []).find(x => x.id === id); if (!v) return;
  let drv = []; try { drv = await api('/drivers?siteId=' + state.siteId); } catch (e) {}
  openEditor('Modifier le véhicule ' + v.internalNumber, [
    { key: 'internalNumber', label: 'N° interne', value: v.internalNumber },
    { key: 'registrationNumber', label: 'Plaque', value: v.registrationNumber },
    { key: 'brand', label: 'Marque', value: v.brand }, { key: 'model', label: 'Modèle', value: v.model },
    { key: 'year', label: 'Année', type: 'number', value: v.year },
    { key: 'truckType', label: 'Type de camion', value: v.truckType || '', options: [['', '—']].concat(TRUCK_TYPES) },
    { key: 'wheels', label: 'Nombre de roues', type: 'number', value: v.wheels }, { key: 'capacity', label: 'Capacité (ex. 45 t)', value: v.capacity },
    { key: 'status', label: 'Statut', value: v.status, options: [['AVAILABLE', 'Disponible'], ['ON_MISSION', 'En mission'], ['MAINTENANCE', 'Maintenance'], ['IMMOBILIZED', 'Immobilisé'], ['OUT_OF_SERVICE', 'Hors service']] },
    { key: 'assignedDriverId', label: 'Chauffeur affecté', value: v.assignedDriverId || '', options: [['', '— inchangé / aucun —']].concat(drv.filter(d => !d.activity || d.activity === v.vehicleType).map(d => [d.id, d.firstName + ' ' + d.lastName])) },
    { key: 'observations', label: 'Observations', value: v.observations },
  ], async (d) => { await api('/vehicles/' + id, { method: 'PATCH', body: d }); renderView(state.view); });
}
function editDriver(id) {
  const d0 = (window._drivers || []).find(x => x.id === id); if (!d0) return;
  openEditor('Modifier le chauffeur ' + d0.firstName + ' ' + d0.lastName, [
    { key: 'firstName', label: 'Prénom', value: d0.firstName }, { key: 'lastName', label: 'Nom', value: d0.lastName },
    { key: 'phone', label: 'Téléphone', value: d0.phone },
    { key: 'activity', label: 'Activité', value: d0.activity || 'TRUCK', options: [['TRUCK', 'Chauffeur de camion'], ['SERVICE_VEHICLE', 'Chauffeur de véhicule de service']] },
    { key: 'licenseNumber', label: 'N° de permis', value: d0.licenseNumber }, { key: 'licenseCategory', label: 'Catégorie du permis', value: d0.licenseCategory },
    { key: 'licenseExpiryDate', label: 'Expiration du permis', type: 'date', value: day10(d0.licenseExpiryDate) },
    { key: 'status', label: 'Statut', value: d0.status, options: [['ACTIVE', 'Actif'], ['SUSPENDED', 'Suspendu'], ['INACTIVE', 'Inactif']] },
  ], async (d) => { await api('/drivers/' + id, { method: 'PATCH', body: d }); renderDrivers(); });
}
function editSupplier(id) {
  const s = (window._suppliers || []).find(x => x.id === id); if (!s) return;
  openEditor('Modifier le fournisseur ' + s.name, [
    { key: 'name', label: 'Nom', value: s.name }, { key: 'contactName', label: 'Contact', value: s.contactName },
    { key: 'phone', label: 'Téléphone', value: s.phone }, { key: 'email', label: 'E-mail', value: s.email },
    { key: 'address', label: 'Adresse', value: s.address }, { key: 'productsSupplied', label: 'Produits fournis', value: s.productsSupplied },
  ], async (d) => { await api('/suppliers/' + id, { method: 'PATCH', body: d }); renderPurchases(); });
}

/* ---------------- DRIVERS ---------------- */
async function editLicense(id, current) {
  const v = prompt('N° de permis du chauffeur :', current);
  if (v === null || !v.trim()) return;
  try { await api('/drivers/' + id, { method: 'PATCH', body: { licenseNumber: v.trim() } }); renderDrivers(); } catch (e) { alert(e.message); }
}
window.DRVF = window.DRVF || 'ALL';
function setDrvFilter(f) { window.DRVF = f; window._drvOpen = null; renderDrivers(); }
function setDrvSub(k) { window.DRVSUB = k; window._drvOpen = null; renderDrivers(); }
async function signupDecide(id, what) {
  try { await api('/driver-signup/' + id + '/' + what, { method: 'POST' }); bellToast(what === 'approve' ? 'Fiche chauffeur créée. Utilisez « Inviter » pour envoyer le QR d\'accès.' : 'Demande refusée.'); renderDrivers(); } catch (e) { alert(e.message); }
}
function openDriverSignup() {
  const old = document.getElementById('su-ov'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = 'su-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(31,58,95,.6);z-index:4000;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto;';
  ov.innerHTML = `<div class="panel" style="max-width:380px;width:100%"><h3><svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Inscription chauffeur</h3><div class="desc">Renseignez vos informations. Votre responsable validera la demande puis vous remettra votre code d'accès personnel.</div>
    <label>Prénom</label><input id="su-f" autocomplete="given-name"><label>Nom</label><input id="su-l" autocomplete="family-name"><label>Téléphone</label><input id="su-p" inputmode="tel" autocomplete="tel">
    <label>Activité</label><select id="su-a"><option value="TRUCK">Chauffeur de camion</option><option value="SERVICE_VEHICLE">Véhicule de service</option></select>
    <div id="su-m"></div><div class="row" style="margin-top:10px"><button class="btn" onclick="sendDriverSignup()">Envoyer ma demande</button><button class="btn ghost" onclick="document.getElementById('su-ov').remove()">Fermer</button></div></div>`;
  document.body.appendChild(ov);
}
async function sendDriverSignup() {
  const m = document.getElementById('su-m'), g = (i) => document.getElementById(i).value.trim();
  try {
    if (!g('su-f') || !g('su-l') || g('su-p').replace(/\D/g, '').length < 8) throw new Error('Renseignez votre prénom, votre nom et un numéro de téléphone valide.');
    const base = (state.apiUrl || DEFAULT_API_URL).replace(/\/$/, '');
    const r = await fetch(base + '/driver-signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: g('su-f'), lastName: g('su-l'), phone: g('su-p'), activity: document.getElementById('su-a').value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(Array.isArray(j.message) ? j.message[0] : j.message || 'Envoi impossible.');
    m.innerHTML = `<div class="msg ok">${esc(j.message)}</div>`;
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(navigator.onLine ? e.message : 'Pas de réseau : réessayez dès que la connexion revient.')}</div>`; }
}
async function renderDrivers() {
  const [all, vehicles] = await Promise.all([api('/drivers?siteId=' + state.siteId), api('/vehicles?siteId=' + state.siteId).catch(() => [])]);
  window._drivers = all;
  // Véhicule ou camion affecté : repris de la fiche du véhicule (une seule source)
  const vehOf = {}; vehicles.forEach(v => { if (v.assignedDriver) (vehOf[v.assignedDriver.id] = vehOf[v.assignedDriver.id] || []).push(v); });
  const cnt = { TRUCK: all.filter(d => d.activity === 'TRUCK').length, SERVICE_VEHICLE: all.filter(d => d.activity === 'SERVICE_VEHICLE').length };
  if (!['TRUCK', 'SERVICE_VEHICLE', 'ADD', 'ARCH'].includes(window.DRVF)) window.DRVF = 'TRUCK';
  window._drvVehOf = vehOf; window._drvAll = all;
  const tab = window.DRVF, isTruck = tab === 'TRUCK';
  const list = all.filter(d => d.activity === tab);
  const permis = (d) => {
    if (!d.licenseExpiryDate) return '—';
    const days = Math.ceil((new Date(d.licenseExpiryDate) - Date.now()) / 86400000), dt = new Date(d.licenseExpiryDate).toLocaleDateString('fr-FR');
    return days < 0 ? `<span class="badge bad">Expiré ${dt}</span>` : days <= 30 ? `<span class="badge warn">${dt} (${days} j)</span>` : dt;
  };
  const veh = (d) => vehOf[d.id] || [];
  const rows = list.map(d => `
    <tr><td><button class="p-name p-link" title="Ouvrir le dossier du chauffeur" onclick="drvRepOpen('${esc(d.id)}')">${personAv(d.firstName, d.lastName, d.photoUrl, 32)}<b>${esc(d.lastName)}</b></button></td><td>${esc(d.firstName)}</td><td>${esc(d.phone || '—')}</td>
    <td>${veh(d).map(v => esc(v.internalNumber || '—')).join('<br>') || '<span class="badge warn">Non attribué</span>'}</td>
    <td>${veh(d).map(v => `<b>${esc(v.registrationNumber || '—')}</b>`).join('<br>') || '—'}</td>
    <td>${esc(d.licenseNumber || '—')}${d.licenseCategory ? ' (' + esc(d.licenseCategory) + ')' : ''} <button class="btn small" aria-label="Modifier le permis" onclick="editLicense('${esc(d.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg></button><div style="font-size:12px">${permis(d)}${d.licensePhotoUrl ? ` <a href="${esc(brandSrc(d.licensePhotoUrl))}" target="_blank" rel="noopener">photo</a>` : ''}</div></td>
    <td>${statusBadge(d.status === 'ACTIVE' ? 'AVAILABLE' : d.status)}</td>
    <td><button class="btn small" onclick="editDriver('${esc(d.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg> Modifier</button></td></tr>`).join('') || `<tr><td colspan="8" class="empty">Aucun chauffeur dans ce dossier.</td></tr>`;

  const signups = await api('/driver-signup').catch(() => []);
  const tabs = syTabs([['TRUCK', `Chauffeurs camion (${cnt.TRUCK})`, 'truck'], ['SERVICE_VEHICLE', `Chauffeurs véhicule de service (${cnt.SERVICE_VEHICLE})`, 'car'], ['ADD', 'Ajouter un chauffeur', 'plus'], ['ARCH', 'Archives', 'archive']], tab, 'setDrvFilter');
  const sub = window.DRVSUB === 'rep' ? 'rep' : 'list';
  const addForm = `<div class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Ajouter un chauffeur</h3>
      <div class="desc">Remplissez l'identité, puis choisissez le type de chauffeur : les champs du permis s'ouvrent ensuite.</div>
      <div class="grid-2">
        <div><label>Nom</label><input id="d-last" /></div>
        <div><label>Prénom</label><input id="d-first" /></div>
        <div><label>Téléphone (WhatsApp)</label><input id="d-phone" type="tel" placeholder="6xx xx xx xx" /></div>
      </div>
      <label style="margin-top:10px">Type de chauffeur</label>
      <input type="hidden" id="d-act" value="" />
      <div class="drv-type" role="radiogroup">
        <button type="button" class="drv-type-b" data-v="TRUCK" role="radio" aria-checked="false" onclick="drvPickType('TRUCK')"><svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg><span>Chauffeur camion</span></button>
        <button type="button" class="drv-type-b" data-v="SERVICE_VEHICLE" role="radio" aria-checked="false" onclick="drvPickType('SERVICE_VEHICLE')"><svg class="ic" aria-hidden="true"><use href="#i-car"/></svg><span>Chauffeur véhicule de service</span></button>
      </div>
      <div id="d-more" style="display:none">
        <div class="grid-2">
          <div><label>N° de permis</label><input id="d-license" /></div>
          <div><label>Catégorie du permis</label><input id="d-cat" placeholder="B, C, D…" /></div>
          <div><label>Expiration du permis</label><input id="d-exp" type="date" /></div>
        </div>
        <button class="btn gold" onclick="createDriver()">Enregistrer</button>
      </div>
      <div id="d-msg"></div>
    </div>`;
  root().innerHTML = `
    ${signups.length ? `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-users"/></svg> Demandes d'inscription (${signups.length})</h3><div class="desc">Chauffeurs qui se sont inscrits eux-mêmes. Approuvez pour créer la fiche, puis utilisez « Inviter » pour leur remettre le QR d'accès.</div>
      <div class="table-wrap"><table><thead><tr><th>Nom</th><th>Téléphone</th><th>Activité</th><th>Date</th><th></th></tr></thead><tbody>${signups.map((s) => `<tr><td><b>${esc(s.lastName)}</b> ${esc(s.firstName)}</td><td>${esc(s.phone)}</td><td>${s.activity === 'TRUCK' ? 'Camion' : s.activity === 'SERVICE_VEHICLE' ? 'Véhicule de service' : '—'}</td><td>${esc(new Date(s.createdAt).toLocaleDateString('fr-FR'))}</td>
        <td><button class="btn small" onclick="signupDecide('${esc(s.id)}','approve')">Approuver</button> <button class="btn small ghost" onclick="signupDecide('${esc(s.id)}','reject')">Refuser</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
    ${tabs}
    ${tab === 'ADD' ? addForm : tab === 'ARCH' ? '<div id="drv-arch"></div>' : syTabs([['list', 'Chauffeurs', 'users'], ['rep', 'Rapports', 'file']], sub, 'setDrvSub') + (sub === 'rep' ? '<div id="drv-rep"></div>' : `<div class="panel">
      <h3>${isTruck ? 'Chauffeurs camion' : 'Chauffeurs véhicule de service'}</h3>
      <div class="table-wrap"><table><thead><tr><th>Nom</th><th>Prénom</th><th>Téléphone</th><th>${isTruck ? 'Camion attribué' : 'Véhicule attribué'}</th><th>N° de plaque</th><th>Permis</th><th>Statut</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`)}`;
  if (tab === 'ARCH') drvArchRender(); else if (tab !== 'ADD' && sub === 'rep') drvRepRender();
}
function drvPickType(v) {
  const h = document.getElementById('d-act'); if (h) h.value = v;
  document.querySelectorAll('.drv-type-b').forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const m = document.getElementById('d-more'); if (m) m.style.display = '';
}
async function createDriver() {
  const msg = document.getElementById('d-msg');
  try {
    if (!document.getElementById('d-act').value) throw new Error('Choisissez le type de chauffeur.');
    const created = await api('/drivers', { method: 'POST', body: {
      siteId: state.siteId,
      firstName: document.getElementById('d-first').value,
      lastName: document.getElementById('d-last').value,
      phone: document.getElementById('d-phone').value,
      activity: document.getElementById('d-act').value,
      licenseNumber: document.getElementById('d-license').value.trim() || undefined,
      licenseCategory: document.getElementById('d-cat').value.trim() || undefined,
      licenseExpiryDate: document.getElementById('d-exp').value || undefined,
    }});
    drvAddedPanel(created || {}, document.getElementById('d-act').value);
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ---------------- FUEL ---------------- */
let fuelKind = 'ALL', fuelPeriod = 'month', fuelDate = new Date().toISOString().slice(0, 10);
const KIND_TABS = (cur, fn) => [['ALL', 'Tous'], ['TRUCK', '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Camions'], ['SERVICE_VEHICLE', '<svg class="ic" aria-hidden="true"><use href="#i-car"/></svg> Véhicules de service']].map(([k, t]) => `<button class="btn ${cur === k ? 'gold' : ''}" style="margin-right:6px" onclick="${fn}('${k}')">${t}</button>`).join('');
function setFuelKind(k) { fuelKind = k; renderFuel(); }
function setFuelPeriod(p, d) { if (p) fuelPeriod = p; if (d) fuelDate = d; renderFuel(); }
function fuelBounds() {
  const d = fuelDate;
  if (fuelPeriod === 'day') return [d, d];
  if (fuelPeriod === 'year') return [d.slice(0, 4) + '-01-01', d.slice(0, 4) + '-12-31'];
  const last = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate();
  return [d.slice(0, 7) + '-01', d.slice(0, 7) + '-' + String(last).padStart(2, '0')];
}
// Synthèse carburant par véhicule : alimentée automatiquement par les pleins déclarés sur les fiches de bord
function fuelSummaryHtml(all) {
  const [from, to] = fuelBounds();
  const list = all.filter((f) => { const d = String(f.transactionDate).slice(0, 10); return d >= from && d <= to && (fuelKind === 'ALL' || f.vehicle.vehicleType === fuelKind); });
  const by = {};
  for (const f of list) {
    const k = f.vehicle.internalNumber; const r = by[k] || (by[k] = { v: f.vehicle, n: 0, l: 0, c: 0, min: Infinity, max: -Infinity });
    r.n++; r.l += Number(f.quantityLiters); r.c += Number(f.totalCost); if (f.mileage) { r.min = Math.min(r.min, f.mileage); r.max = Math.max(r.max, f.mileage); }
  }
  const rows = Object.values(by).sort((a, b) => b.l - a.l);
  const tot = rows.reduce((a, r) => ({ n: a.n + r.n, l: a.l + r.l, c: a.c + r.c }), { n: 0, l: 0, c: 0 });
  const label = fuelPeriod === 'day' ? new Date(fuelDate + 'T12:00:00').toLocaleDateString('fr-FR', { dateStyle: 'full' }) : fuelPeriod === 'year' ? 'Année ' + fuelDate.slice(0, 4) : new Date(fuelDate + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return { list, html: `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-chart"/></svg> Carburant par véhicule</h3>
    <div style="margin:6px 0">${KIND_TABS(fuelKind, 'setFuelKind')}</div>
    <div class="grid-2"><div><label>Période</label><select onchange="setFuelPeriod(this.value)"><option value="day" ${fuelPeriod === 'day' ? 'selected' : ''}>Jour</option><option value="month" ${fuelPeriod === 'month' ? 'selected' : ''}>Mois</option><option value="year" ${fuelPeriod === 'year' ? 'selected' : ''}>Année</option></select></div>
    <div><label>Date de référence</label><input type="date" value="${esc(fuelDate)}" onchange="if(this.value)setFuelPeriod(null,this.value)" /></div></div>
    <div class="desc">${esc(label)} — alimenté automatiquement par les pleins des fiches de bord et des chauffeurs.</div>
    <table><thead><tr><th>Véhicule</th><th>Pleins</th><th>Litres</th><th>Coût (GNF)</th><th>Km (entre pleins)</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.v.internalNumber)} <span style="font-size:12px;color:var(--muted)">${esc(r.v.registrationNumber)}</span></td><td class="mono">${r.n}</td><td class="mono">${fmt(Math.round(r.l * 10) / 10)} L</td><td class="mono">${fmt(r.c)}</td><td class="mono">${r.max > r.min ? fmt(r.max - r.min) : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Aucun plein sur cette période.</td></tr>'}
    ${rows.length ? `<tr><td><b>Total</b></td><td class="mono"><b>${tot.n}</b></td><td class="mono"><b>${fmt(Math.round(tot.l * 10) / 10)} L</b></td><td class="mono"><b>${fmt(tot.c)}</b></td><td></td></tr>` : ''}</tbody></table></div>` };
}
// Carburant en onglets : chaque onglet ne charge que ses propres données
const FUEL_TABS = [['trucks', 'Camions', 'truck'], ['service', 'Véhicules de service', 'car'], ['total', 'Consommation totale', 'chart'], ['new', 'Nouveau ravitaillement', 'plus'], ['history', 'Historique et tarif', 'clock']];
let fuelTab = 'trucks';
function setFuelTab(k) { fuelTab = k; renderFuel(); }
function fuelPeriodHtml() {
  const label = fuelPeriod === 'day' ? new Date(fuelDate + 'T12:00:00').toLocaleDateString('fr-FR', { dateStyle: 'full' }) : fuelPeriod === 'year' ? 'Année ' + fuelDate.slice(0, 4) : new Date(fuelDate + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return `<div class="grid-2"><div><label>Période</label><select onchange="setFuelPeriod(this.value)"><option value="day" ${fuelPeriod === 'day' ? 'selected' : ''}>Jour</option><option value="month" ${fuelPeriod === 'month' ? 'selected' : ''}>Mois</option><option value="year" ${fuelPeriod === 'year' ? 'selected' : ''}>Année</option></select></div>
    <div><label>Date de référence</label><input type="date" value="${esc(fuelDate)}" onchange="if(this.value)setFuelPeriod(null,this.value)" /></div></div><div class="desc">${esc(label)} — alimenté automatiquement par les pleins des fiches de bord et des chauffeurs.</div>`;
}
function fuelRows(all, kind) {
  const [from, to] = fuelBounds();
  const list = all.filter((f) => { const d = String(f.transactionDate).slice(0, 10); return d >= from && d <= to && (kind === 'ALL' || f.vehicle.vehicleType === kind || (kind === 'SERVICE_VEHICLE' && f.vehicle.vehicleType !== 'TRUCK')); });
  const by = {};
  for (const f of list) {
    const k = f.vehicle.internalNumber; const r = by[k] || (by[k] = { v: f.vehicle, n: 0, l: 0, c: 0, min: Infinity, max: -Infinity });
    r.n++; r.l += Number(f.quantityLiters); r.c += Number(f.totalCost); if (f.mileage) { r.min = Math.min(r.min, f.mileage); r.max = Math.max(r.max, f.mileage); }
  }
  const rows = Object.values(by).sort((a, b) => b.l - a.l);
  const tot = rows.reduce((a, r) => ({ n: a.n + r.n, l: a.l + r.l, c: a.c + r.c }), { n: 0, l: 0, c: 0 });
  return { list, rows, tot };
}
function fuelCards(tot, nb, what) {
  const c = (l, v, sub) => `<div class="kpi-card"><div class="kpi-label">${l}</div><div class="kpi-value mono">${v}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
  return `<div class="kpi-grid">${c('Litres consommés', fmt(Math.round(tot.l * 10) / 10), 'L')}${c('Coût du carburant', fmt(tot.c), 'GNF')}${c('Pleins', fmt(tot.n), '')}${c(what + ' concernés', fmt(nb), '')}</div>`;
}
async function renderFuel() {
  const tab = FUEL_TABS.find((t) => t[0] === fuelTab) ? fuelTab : 'trucks';
  const bar = syTabs(FUEL_TABS, tab, 'setFuelTab');
  root().innerHTML = bar + '<div class="empty">Chargement…</div>';
  let body = '';
  if (tab === 'trucks' || tab === 'service') {
    const truck = tab === 'trucks', all = await api('/fuel?siteId=' + state.siteId), { rows, tot } = fuelRows(all, truck ? 'TRUCK' : 'SERVICE_VEHICLE');
    body = `${fuelCards(tot, rows.length, truck ? 'Camions' : 'Véhicules')}<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-${truck ? 'truck' : 'car'}"/></svg> Carburant consommé par ${truck ? 'camion' : 'véhicule de service'}</h3>${fuelPeriodHtml()}
      <div class="table-wrap"><table><thead><tr><th>${truck ? 'Camion' : 'Véhicule'}</th><th>Pleins</th><th>Litres</th><th>Coût (GNF)</th><th>Km (entre pleins)</th><th>L/100 km</th></tr></thead><tbody>${rows.map((r) => { const km = r.max > r.min ? r.max - r.min : 0; return `<tr><td><b>${esc(r.v.internalNumber)}</b> <span style="font-size:12px;color:var(--muted)">${esc(r.v.registrationNumber)}</span></td><td class="mono">${r.n}</td><td class="mono">${fmt(Math.round(r.l * 10) / 10)} L</td><td class="mono">${fmt(r.c)}</td><td class="mono">${km ? fmt(km) : '—'}</td><td class="mono">${km >= 20 ? (Math.round(r.l / km * 1000) / 10) : '—'}</td></tr>`; }).join('') || `<tr><td colspan="6" class="empty">Aucun plein de ${truck ? 'camion' : 'véhicule de service'} sur cette période.</td></tr>`}
      ${rows.length ? `<tr><td><b>Total</b></td><td class="mono"><b>${tot.n}</b></td><td class="mono"><b>${fmt(Math.round(tot.l * 10) / 10)} L</b></td><td class="mono"><b>${fmt(tot.c)}</b></td><td></td><td></td></tr>` : ''}</tbody></table></div></div>`;
  } else if (tab === 'total') {
    const all = await api('/fuel?siteId=' + state.siteId), T = fuelRows(all, 'TRUCK'), S = fuelRows(all, 'SERVICE_VEHICLE'), A = fuelRows(all, 'ALL');
    const line = (l, ic, x) => `<tr><td><svg class="ic" aria-hidden="true"><use href="#i-${ic}"/></svg> ${l}</td><td class="mono">${fmt(x.rows.length)}</td><td class="mono">${x.tot.n}</td><td class="mono">${fmt(Math.round(x.tot.l * 10) / 10)} L</td><td class="mono">${fmt(x.tot.c)}</td><td class="mono">${A.tot.l ? Math.round(x.tot.l / A.tot.l * 100) + ' %' : '—'}</td></tr>`;
    body = `${fuelCards(A.tot, A.rows.length, 'Véhicules')}<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-chart"/></svg> Consommation totale</h3>${fuelPeriodHtml()}
      <div class="table-wrap"><table><thead><tr><th>Catégorie</th><th>Véhicules</th><th>Pleins</th><th>Litres</th><th>Coût (GNF)</th><th>Part</th></tr></thead><tbody>${line('Camions', 'truck', T)}${line('Véhicules de service', 'car', S)}
      <tr><td><b>Total général</b></td><td class="mono"><b>${fmt(A.rows.length)}</b></td><td class="mono"><b>${A.tot.n}</b></td><td class="mono"><b>${fmt(Math.round(A.tot.l * 10) / 10)} L</b></td><td class="mono"><b>${fmt(A.tot.c)}</b></td><td class="mono"><b>100 %</b></td></tr></tbody></table></div></div>`;
  } else if (tab === 'new') {
    const vehicles = await api('/vehicles?siteId=' + state.siteId);
    const grp = (t, l) => { const vs = vehicles.filter((v) => (t === 'TRUCK') === (v.vehicleType === 'TRUCK')); return vs.length ? `<optgroup label="${l}">${vs.map((v) => `<option value="${esc(v.id)}">${esc(v.internalNumber)} — ${esc(v.registrationNumber)}</option>`).join('')}</optgroup>` : ''; };
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-fuel"/></svg> Nouveau ravitaillement</h3>
      <div class="desc">À utiliser pour un plein qui n'a pas été déclaré par le chauffeur dans son application. Le coût est calculé automatiquement avec le tarif en vigueur.</div>
      <div class="grid-2">
        <div><label>Camion ou véhicule</label><select id="f-vehicle">${grp('TRUCK', 'Camions')}${grp('SERVICE', 'Véhicules de service')}</select></div>
        <div><label>Date</label><input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
        <div><label>Kilométrage au compteur</label><input id="f-mileage" type="number" /></div>
        <div><label>Litres</label><input id="f-liters" type="number" step="0.01" /></div>
        <div><label>Station</label><input id="f-station" /></div>
      </div>
      <button class="btn gold" onclick="createFuel()">Enregistrer</button>
      <div id="f-msg"></div></div>`;
  } else {
    const [all, tariff] = await Promise.all([api('/fuel?siteId=' + state.siteId), api('/settings/fuel-price')]);
    const canEditPrice = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role), { list } = fuelRows(all, 'ALL');
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg> Tarif du carburant</h3>
      <div class="desc">Tarif actuel : <b class="mono">${fmt(tariff.pricePerLiter)} GNF/L</b> — appliqué automatiquement à tous les nouveaux calculs.</div>
      ${canEditPrice ? `<div class="grid-2"><div><label>Nouveau prix / litre (GNF)</label><input id="fp-price" type="number" min="1" value="${esc(String(tariff.pricePerLiter))}" /></div>
        <div><label>Motif (obligatoire)</label><input id="fp-reason" placeholder="Ex : hausse à la pompe" /></div></div>
      <button class="btn gold" onclick="saveFuelPrice()">Modifier le tarif</button>` : ''}<div id="fp-msg"></div></div>
      <div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> Historique des pleins</h3>${fuelPeriodHtml()}
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Véhicule</th><th>Type</th><th>Litres</th><th>Prix/L</th><th>Coût total</th></tr></thead><tbody>${list.map((f) => `<tr><td>${new Date(f.transactionDate).toLocaleDateString('fr-FR')}</td><td>${esc(f.vehicle.internalNumber)}</td><td>${f.vehicle.vehicleType === 'TRUCK' ? 'Camion' : 'Véhicule de service'}</td><td class="mono">${fmt(f.quantityLiters)} L</td><td class="mono">${fmt(f.pricePerLiter)} GNF/L</td><td class="mono">${fmt(f.totalCost)} GNF</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aucun plein sur cette période.</td></tr>'}</tbody></table></div></div>`;
  }
  if (state.view !== 'fuel') return;
  root().innerHTML = bar + body;
}
