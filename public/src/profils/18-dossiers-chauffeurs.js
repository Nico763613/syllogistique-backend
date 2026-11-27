/* =====================================================================
   Dossiers chauffeurs : sous-dossiers « Chauffeurs / Rapports »,
   dossier de chaque chauffeur (rapports journaliers), message d'accès
   après l'ajout, et dossier « Archives » (télécharger, imprimer, envoyer).
   ===================================================================== */

/* ---------- Outils d'archivage communs ---------- */
function arcFileName(base) { return String(base).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + new Date().toISOString().slice(0, 10); }
function arcCsvBlob(head, rows) {
  const csv = [head, ...rows].map((a) => a.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\n');
  return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
}
// Télécharger : fichier tableur (s'ouvre dans Excel ou Google Sheets), sur le téléphone ou l'ordinateur
function arcDownload(title, head, rows) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(arcCsvBlob(head, rows)); a.download = arcFileName(title) + '.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
// Imprimer : page propre avec en-tête ; « Enregistrer en PDF » est proposé par l'impression du téléphone ou de l'ordinateur
function arcPrint(title, sub, head, rows) {
  const w = window.open('', '_blank');
  if (!w) return bellToast ? bellToast("Autorisez l'ouverture de fenêtres pour imprimer.") : null;
  const co = (state.branding && state.branding.companyName) || 'SYL Logistique & Transport';
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font-family:Arial,sans-serif;color:#1B2A3D;margin:24px}h1{font-size:18px;color:#243B64;margin:0 0 4px}.s{color:#5F6B7A;font-size:12px;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;font-size:12px}th{background:#243B64;color:#fff;text-align:left;padding:6px}td{border-bottom:1px solid #E9EDF2;padding:6px}
    .f{margin-top:18px;font-size:11px;color:#5F6B7A}@media print{button{display:none}}</style></head><body>
    <div class="s">${esc(co)}</div><h1>${esc(title)}</h1><div class="s">${esc(sub || '')} — édité le ${new Date().toLocaleString('fr-FR')}</div>
    <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c == null ? '' : c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}">Aucune donnée.</td></tr>`}</tbody></table>
    <div class="f">${rows.length} ligne(s).</div><button onclick="print()" style="margin-top:14px;padding:10px 16px">Imprimer / Enregistrer en PDF</button></body></html>`);
  w.document.close(); setTimeout(() => { try { w.print(); } catch (e) {} }, 400);
}
// Envoyer : partage du fichier (WhatsApp, e-mail…) si le téléphone le permet, sinon résumé dans WhatsApp
async function arcSend(title, head, rows, summary) {
  const file = new File([arcCsvBlob(head, rows)], arcFileName(title) + '.csv', { type: 'text/csv' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], title, text: title });
  } catch (e) { if (e && e.name === 'AbortError') return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(title + '\n' + (summary || rows.length + ' ligne(s)')), '_blank', 'noopener');
}
function arcBar(fn) { // fn : nom d'une fonction qui reçoit 'dl' | 'print' | 'send'
  return `<div class="arc-bar"><button class="btn small" onclick="${fn}('dl')"><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg> Télécharger</button><button class="btn small" onclick="${fn}('print')"><svg class="ic" aria-hidden="true"><use href="#i-printer"/></svg> Imprimer / PDF</button><button class="btn small gold" onclick="${fn}('send')"><svg class="ic" aria-hidden="true"><use href="#i-message"/></svg> Envoyer</button></div>`;
}
function arcDo(how, title, sub, head, rows, summary) {
  if (how === 'dl') return arcDownload(title, head, rows);
  if (how === 'print') return arcPrint(title, sub, head, rows);
  return arcSend(title, head, rows, summary);
}

/* ---------- Libellés ---------- */
const DRV_REP_ST = { SENT: ['Envoyé', 'info'], RECEIVED: ['Reçu', 'info'], CHECKED: ['Vérifié', 'ok'], VALIDATED: ['Validé', 'ok'], REJECTED: ['Rejeté', 'bad'] };
function drvRepBadge(r) { if (!r) return '<span class="badge warn">Non envoyé</span>'; const s = DRV_REP_ST[r.status] || [r.status, 'info']; return `<span class="badge ${s[1]}">${s[0]}</span>`; }
function drvRepTxt(r) { return r ? (DRV_REP_ST[r.status] || [r.status])[0] : 'Non envoyé'; }
function drvKindLbl(a) { return a === 'TRUCK' ? 'Chauffeur camion' : a === 'SERVICE_VEHICLE' ? 'Chauffeur véhicule de service' : 'À préciser'; }
function drvVeh(d) { return (window._drvVehOf || {})[d.id] || []; }
function drvFr(dt) { return new Date(dt + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }); }

/* ---------- Sous-dossier « Rapports » : un dossier par chauffeur ---------- */
function drvRepRender() {
  const box = document.getElementById('drv-rep'); if (!box) return;
  if (window._drvOpen) return drvRepLoad(window._drvOpen);
  const list = (window._drvAll || []).filter((d) => d.activity === window.DRVF);
  box.innerHTML = `<div class="panel"><h3>Rapports — ${window.DRVF === 'TRUCK' ? 'chauffeurs camion' : 'chauffeurs véhicule de service'}</h3>
    <div class="desc">Ouvrez le dossier d'un chauffeur pour voir ses rapports journaliers.</div>
    <div class="drv-folders">${list.map((d) => `<button class="drv-folder" onclick="drvRepOpen('${esc(d.id)}')">${personAv(d.firstName, d.lastName, d.photoUrl, 40)}<span><b>${esc(d.lastName)} ${esc(d.firstName)}</b><small>${drvVeh(d).map((v) => esc(v.registrationNumber || v.internalNumber)).join(', ') || 'Aucun véhicule attribué'}</small></span><svg class="ic" aria-hidden="true"><use href="#i-chevron-right"/></svg></button>`).join('') || '<div class="empty">Aucun chauffeur dans ce dossier.</div>'}</div></div>`;
}
function drvRepOpen(id) {
  const d = (window._drvAll || []).find((x) => x.id === id);
  window._drvOpen = id; window.DRVSUB = 'rep';
  if (d && d.activity && d.activity !== window.DRVF && ['TRUCK', 'SERVICE_VEHICLE'].includes(d.activity)) window.DRVF = d.activity;
  if (!document.getElementById('drv-rep')) return renderDrivers();
  drvRepLoad(id);
}
function drvRepBack() { window._drvOpen = null; drvRepRender(); }
async function drvRepLoad(id) {
  const box = document.getElementById('drv-rep'); if (!box) return;
  const d = (window._drvAll || []).find((x) => x.id === id) || { firstName: '', lastName: '' };
  const to = window._drvRepTo || new Date().toISOString().slice(0, 10);
  const from = window._drvRepFrom || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  box.innerHTML = `<div class="panel"><button class="btn small ghost" onclick="drvRepBack()"><svg class="ic" aria-hidden="true"><use href="#i-chevron-left"/></svg> Tous les chauffeurs</button>
    <div class="drv-id">${personAv(d.firstName, d.lastName, d.photoUrl, 52)}<div><h3 style="margin:0">${esc(d.lastName)} ${esc(d.firstName)}</h3>
      <div class="desc" style="margin:2px 0 0">${drvKindLbl(d.activity)} · ${esc(d.phone || 'pas de téléphone')} · ${drvVeh(d).map((v) => esc((v.internalNumber || '') + ' ' + (v.registrationNumber || ''))).join(', ') || 'aucun véhicule'} · permis ${esc(d.licenseNumber || '—')}</div></div></div>
    <div class="arc-period"><div><label>Du</label><input id="dr-from" type="date" value="${esc(from)}"></div><div><label>Au</label><input id="dr-to" type="date" value="${esc(to)}"></div>
      <button class="btn small" onclick="window._drvRepFrom=document.getElementById('dr-from').value;window._drvRepTo=document.getElementById('dr-to').value;drvRepLoad('${esc(id)}')">Afficher</button></div>
    ${arcBar('drvRepArc')}
    <div id="dr-body"><div class="empty">Chargement…</div></div></div>`;
  try {
    const rows = await api('/driver-admin/drivers/' + id + '/reports?from=' + from + '&to=' + to);
    window._drvRepData = { d, from, to, rows };
    const tot = rows.reduce((s, r) => ({ m: s.m + r.missions, km: s.km + r.km, l: s.l + r.liters, e: s.e + r.expenses, sent: s.sent + (r.report ? 1 : 0) }), { m: 0, km: 0, l: 0, e: 0, sent: 0 });
    document.getElementById('dr-body').innerHTML = rows.length ? `<div class="arc-kpis">${[[tot.sent + ' / ' + rows.length, 'Rapports envoyés'], [tot.m, 'Missions'], [fmt(tot.km) + ' km', 'Distance'], [fmt(Math.round(tot.l)) + ' L', 'Carburant'], [fmt(tot.e) + ' GNF', 'Dépenses']].map((x) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>
      <div class="table-wrap"><table><thead><tr><th>Jour</th><th>Rapport</th><th>Missions</th><th>Km</th><th>Litres</th><th>Dépenses</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td><b>${esc(drvFr(r.date))}</b></td><td>${drvRepBadge(r.report)}${r.report && r.report.note ? `<div style="font-size:12px;color:var(--muted)">${esc(r.report.note)}</div>` : ''}</td><td>${r.missions}</td><td>${fmt(r.km)}</td><td>${r.liters}</td><td>${fmt(r.expenses)}</td>
        <td><button class="btn small" onclick="drvSheetView('${esc(id)}','${esc(r.date)}')"><svg class="ic" aria-hidden="true"><use href="#i-eye"/></svg> Voir la fiche</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">Aucune activité ni rapport sur cette période.</div>';
  } catch (e) { document.getElementById('dr-body').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function drvRepArc(how) {
  const x = window._drvRepData; if (!x) return;
  const name = x.d.lastName + ' ' + x.d.firstName;
  const head = ['Jour', 'Rapport', 'Missions', 'Km', 'Litres', 'Dépenses GNF', 'Observation'];
  const rows = x.rows.map((r) => [r.date, drvRepTxt(r.report), r.missions, r.km, r.liters, r.expenses, r.report && r.report.note || '']);
  arcDo(how, 'Rapports journaliers — ' + name, drvKindLbl(x.d.activity) + ' · du ' + x.from + ' au ' + x.to, head, rows, rows.length + ' jour(s), du ' + x.from + ' au ' + x.to);
}

/* ---------- Fiche journalière complète (lecture) ---------- */
async function drvSheetView(id, date) {
  const ov = document.createElement('div'); ov.className = 'drv-sheet-ov';
  ov.innerHTML = '<div class="panel drv-sheet-box"><div class="empty">Chargement…</div></div>';
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
  const box = ov.firstChild;
  try {
    const s = await api('/driver-admin/drivers/' + id + '/sheet?date=' + date);
    window._drvSheet = s;
    const t = s.totals || {};
    const sec = (title, items, row) => `<h4>${title} (${items.length})</h4>${items.length ? items.map(row).join('') : '<div class="desc">Rien de déclaré.</div>'}`;
    const hm = (v) => (v ? new Date(v).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—');
    box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><h3 style="margin:0">Fiche du ${esc(drvFr(s.date))}</h3><div class="desc">${esc(s.driver.name)} · ${drvRepBadge(s.status === 'SENT' ? { status: s.rejectedAt ? 'REJECTED' : s.opsAt ? 'VALIDATED' : s.processedAt ? 'CHECKED' : s.receivedAt ? 'RECEIVED' : 'SENT' } : null)}</div></div>
      <button class="btn small ghost" aria-label="Fermer" onclick="this.closest('.drv-sheet-ov').remove()"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg></button></div>
      <div class="arc-kpis">${[[(s.trips || []).length, 'Missions'], [fmt(t.km || 0) + ' km', 'Distance'], [(t.liters || 0) + ' L', 'Carburant'], [fmt(t.expenses || 0) + ' GNF', 'Dépenses']].map((x) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>
      ${sec('Missions', s.trips || [], (m) => `<div class="drv-row"><span><b>${esc(m.reference || '')}</b> ${esc(m.plate || '')} → ${esc(m.destination || '—')}</span><span>${hm(m.startTime)} – ${hm(m.endTime)} · ${fmt(m.km)} km</span></div>`)}
      ${sec('Carburant', s.fuel || [], (f) => `<div class="drv-row"><span>${hm(f.time)} · ${esc(f.plate || '')} · ${esc(f.station || '')}</span><span>${f.liters} L · ${fmt(f.cost)} GNF</span></div>`)}
      ${sec('Dépenses', s.expenses || [], (e) => `<div class="drv-row"><span>${esc(e.category)} ${e.description ? '· ' + esc(e.description) : ''}</span><span>${fmt(e.amount)} GNF</span></div>`)}
      ${sec('Entretien et anomalies', s.maintenance || [], (m) => `<div class="drv-row"><span>${esc(m.nature || '')} · ${esc(m.detail || '')}</span><span>${m.cost ? fmt(m.cost) + ' GNF' : ''}</span></div>`)}
      ${sec('Pannes', s.breakdowns || [], (b) => `<div class="drv-row"><span>${hm(b.time)} · ${esc(b.reason || '')}</span><span>${esc(b.severity || '')}</span></div>`)}
      ${s.rejectNote ? `<div class="msg err">Rejet : ${esc(s.rejectNote)}</div>` : ''}
      ${arcBar('drvSheetArc')}`;
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div><button class="btn" onclick="this.closest('.drv-sheet-ov').remove()">Fermer</button>`; }
}
function drvSheetArc(how) {
  const s = window._drvSheet; if (!s) return;
  const hm = (v) => (v ? new Date(v).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');
  const rows = [
    ...(s.trips || []).map((m) => ['Mission', hm(m.startTime) + ' – ' + hm(m.endTime), (m.reference || '') + ' ' + (m.plate || '') + ' → ' + (m.destination || ''), m.km + ' km']),
    ...(s.fuel || []).map((f) => ['Carburant', hm(f.time), (f.plate || '') + ' ' + (f.station || ''), f.liters + ' L / ' + f.cost + ' GNF']),
    ...(s.expenses || []).map((e) => ['Dépense', hm(e.time), e.category + ' ' + (e.description || ''), e.amount + ' GNF']),
    ...(s.maintenance || []).map((m) => ['Entretien', '', (m.nature || '') + ' ' + (m.detail || ''), m.cost ? m.cost + ' GNF' : '']),
    ...(s.breakdowns || []).map((b) => ['Panne', hm(b.time), b.reason || '', b.severity || '']),
  ];
  arcDo(how, 'Fiche journalière — ' + s.driver.name + ' — ' + s.date, drvKindLbl(s.driver.activity), ['Rubrique', 'Heure', 'Détail', 'Valeur'], rows, rows.length + ' élément(s) déclaré(s)');
}

/* ---------- Après l'ajout : envoyer le message d'accès ---------- */
function drvAddedPanel(d, act) {
  const m = document.getElementById('d-msg'); if (!m) return;
  window.DRVF = act;
  const name = ((d.firstName || '') + ' ' + (d.lastName || '')).trim() || 'Le chauffeur';
  m.innerHTML = `<div class="msg ok">${esc(name)} est enregistré dans le dossier « ${act === 'TRUCK' ? 'Chauffeurs camion' : 'Chauffeurs véhicule de service'} ».</div>
    <div class="desc">Étape suivante : envoyez-lui le message WhatsApp avec le lien de l'application et son code d'accès.</div>
    ${d.id ? `<button class="btn gold" onclick="drvInviteSend('${esc(d.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-message"/></svg> Envoyer le message d'accès</button>` : ''}
    <button class="btn" onclick="window.DRVF='${act === 'TRUCK' ? 'TRUCK' : 'SERVICE_VEHICLE'}';window.DRVSUB='list';go('drivers')">Voir le dossier chauffeurs</button>
    <div id="inv-msg"></div>`;
  document.getElementById('d-more').style.display = 'none';
}

/* ---------- Dossier « Archives » ---------- */
function drvArchRender() {
  const box = document.getElementById('drv-arch'); if (!box) return;
  const all = window._drvAll || [];
  const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  box.innerHTML = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-archive"/></svg> Archives</h3>
      <div class="desc">Chaque document peut être téléchargé (téléphone ou ordinateur, s'ouvre dans Excel), imprimé ou enregistré en PDF, ou envoyé (WhatsApp, e-mail).</div></div>
    <div class="panel"><h3>1. Liste des chauffeurs</h3>
      <div class="desc">Nom, prénom, téléphone, type, véhicule attribué, plaque et permis.</div>
      <label>Dossier</label><select id="ar-kind" style="max-width:320px"><option value="ALL">Tous les chauffeurs (${all.length})</option><option value="TRUCK">Chauffeurs camion</option><option value="SERVICE_VEHICLE">Chauffeurs véhicule de service</option></select>
      ${arcBar('drvArcList')}</div>
    <div class="panel"><h3>2. Rapports d'un chauffeur</h3>
      <div class="desc">Historique des rapports journaliers sur la période choisie.</div>
      <div class="arc-period"><div><label>Chauffeur</label><select id="ar-drv">${all.map((d) => `<option value="${esc(d.id)}">${esc(d.lastName + ' ' + d.firstName)} — ${d.activity === 'TRUCK' ? 'camion' : 'service'}</option>`).join('')}</select></div>
        <div><label>Du</label><input id="ar-from" type="date" value="${from}"></div><div><label>Au</label><input id="ar-to" type="date" value="${to}"></div></div>
      ${all.length ? arcBar('drvArcRep') : '<div class="empty">Aucun chauffeur.</div>'}<div id="ar-msg"></div></div>`;
}
function drvArcList(how) {
  const k = document.getElementById('ar-kind').value;
  const list = (window._drvAll || []).filter((d) => k === 'ALL' || d.activity === k);
  const head = ['Nom', 'Prénom', 'Téléphone', 'Type', 'Véhicule attribué', 'N° de plaque', 'N° de permis', 'Catégorie', 'Expiration du permis'];
  const rows = list.map((d) => [d.lastName, d.firstName, d.phone || '', drvKindLbl(d.activity), drvVeh(d).map((v) => v.internalNumber).join(', '), drvVeh(d).map((v) => v.registrationNumber).join(', '), d.licenseNumber || '', d.licenseCategory || '', d.licenseExpiryDate ? String(d.licenseExpiryDate).slice(0, 10) : '']);
  const title = k === 'TRUCK' ? 'Chauffeurs camion' : k === 'SERVICE_VEHICLE' ? 'Chauffeurs véhicule de service' : 'Liste des chauffeurs';
  arcDo(how, title, rows.length + ' chauffeur(s)', head, rows, rows.length + ' chauffeur(s)');
}
async function drvArcRep(how) {
  const id = document.getElementById('ar-drv').value, from = document.getElementById('ar-from').value, to = document.getElementById('ar-to').value, m = document.getElementById('ar-msg');
  const d = (window._drvAll || []).find((x) => x.id === id); if (!d) return;
  // Le navigateur exige un geste direct pour ouvrir une fenêtre : on prépare la fenêtre d'impression avant l'appel réseau
  const pre = how === 'print' ? window.open('', '_blank') : null;
  try {
    const rows = await api('/driver-admin/drivers/' + id + '/reports?from=' + from + '&to=' + to);
    window._drvRepData = { d, from, to, rows };
    if (pre) { const _o = window.open; window.open = () => pre; try { drvRepArc('print'); } finally { window.open = _o; } } else drvRepArc(how);
    m.innerHTML = '';
  } catch (e) { if (pre) pre.close(); m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ---------- Rapports journaliers : un dossier par catégorie ---------- */
const DAILY_TABS = [['TRUCK', 'Camions', 'truck'], ['SERVICE_VEHICLE', 'Véhicules de service', 'car'], ['D_TRUCK', 'Chauffeurs camion', 'users'], ['D_SERVICE', 'Chauffeurs véhicule de service', 'user'], ['AGENT_HSE', 'HSE', 'hard-hat'], ['MECANICIEN', 'Atelier', 'wrench'], ['MAGASINIER', 'Stock', 'package'], ['POINTEUR', 'Pointage', 'clock']];
function dailyTab() { return window._dailyTab || dailyKind; }
function setDailyTab(k) { window._dailyTab = k; if (k === 'TRUCK' || k === 'SERVICE_VEHICLE') dailyKind = k; renderDaily(); }
async function dailyOther() {
  const body = document.getElementById('d-body'); if (!body) return;
  const t = dailyTab(), date = document.getElementById('d-date').value;
  body.innerHTML = '<div class="empty">Chargement…</div>';
  try {
    if (t === 'D_TRUCK' || t === 'D_SERVICE') {
      const rows = await api('/driver-admin/reports/day?date=' + date + '&kind=' + (t === 'D_TRUCK' ? 'TRUCK' : 'SERVICE_VEHICLE') + '&siteId=' + state.siteId);
      window._dailyArc = { title: 'Fiches de bord — ' + (t === 'D_TRUCK' ? 'chauffeurs camion' : 'chauffeurs véhicule de service') + ' — ' + date, head: ['Chauffeur', 'Véhicule', 'Rapport', 'Missions', 'Km', 'Litres', 'Dépenses GNF'], rows: rows.map((r) => [r.name, r.vehicle || '', drvRepTxt(r.report), r.missions, r.km, r.liters, r.expenses]) };
      const sent = rows.filter((r) => r.report).length;
      body.innerHTML = `<div class="arc-kpis">${[[sent + ' / ' + rows.length, 'Fiches envoyées'], [rows.length - sent, 'Non envoyées'], [rows.reduce((a, r) => a + r.missions, 0), 'Missions'], [fmt(rows.reduce((a, r) => a + r.km, 0)) + ' km', 'Distance']].map((x) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>
        ${arcBar('dailyArc')}
        <div class="table-wrap"><table><thead><tr><th>Chauffeur</th><th>Véhicule</th><th>Rapport</th><th>Missions</th><th>Km</th><th>Litres</th><th>Dépenses</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.vehicle || '—')}</td><td>${drvRepBadge(r.report)}</td><td>${r.missions}</td><td>${fmt(r.km)}</td><td>${r.liters}</td><td>${fmt(r.expenses)}</td>
          <td><button class="btn small" onclick="drvSheetView('${esc(r.id)}','${esc(date)}')"><svg class="ic" aria-hidden="true"><use href="#i-eye"/></svg> Voir la fiche</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Aucun chauffeur.</td></tr>'}</tbody></table></div>`;
      return;
    }
    const reps = await api('/staff/reports?role=' + t + '&date=' + date + '&siteId=' + state.siteId);
    const lbl = { AGENT_HSE: 'HSE', MECANICIEN: 'Atelier', MAGASINIER: 'Stock', POINTEUR: 'Pointage' }[t];
    window._dailyArc = { title: 'Rapports ' + lbl + ' — ' + date, head: ['Nom', 'Envoyé à', 'Activités', 'Observations', 'État'], rows: reps.map((r) => [r.name, r.sentAt ? new Date(r.sentAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '', r.activities || '', r.observations || '', r.rejectedAt ? 'Rejeté' : r.receivedAt ? 'Reçu' : 'Envoyé']) };
    body.innerHTML = `<div class="arc-kpis"><div><b>${reps.length}</b><span>Rapports reçus ce jour</span></div><div><b>${reps.filter((r) => r.receivedAt).length}</b><span>Vérifiés</span></div></div>
      ${arcBar('dailyArc')}
      ${reps.map((r) => `<div class="daily-rep"><div class="daily-rep-h"><b>${esc(r.name)}</b><span>${r.rejectedAt ? '<span class="badge bad">Rejeté</span>' : r.receivedAt ? '<span class="badge ok">Reçu</span>' : '<span class="badge info">Envoyé</span>'} ${r.sentAt ? new Date(r.sentAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>
        <div style="white-space:pre-wrap">${esc(r.activities || '')}</div>${r.observations ? `<div class="desc" style="white-space:pre-wrap;margin-top:4px">${esc(r.observations)}</div>` : ''}</div>`).join('') || '<div class="empty">Aucun rapport envoyé pour ce jour.</div>'}`;
  } catch (e) { body.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function dailyArc(how) { const x = window._dailyArc; if (x) arcDo(how, x.title, '', x.head, x.rows, x.rows.length + ' ligne(s)'); }
