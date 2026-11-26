/* ---------------- RAPPORTS PAR CATÉGORIE (camions / véhicules de service) ---------------- */
async function renderKindReports(kind) {
  dailyKind = kind; window._krKind = kind;
  const today = window._krDate || new Date().toISOString().slice(0, 10);
  const canEdit = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role);
  try { const all = await api('/settings'); dailyEmails = (all.find(s => s.key === 'REPORT_EMAIL_RECIPIENTS') || {}).value || ''; dailyAccEmails = (all.find(s => s.key === 'REPORT_ACCOUNTING_EMAILS') || {}).value || ''; } catch (e) {}
  root().innerHTML = `
    <div class="panel"><h3>${kind === 'TRUCK' ? '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Rapports camions' : '<svg class="ic" aria-hidden="true"><use href="#i-car"/></svg> Rapports véhicules de service'}</h3>
      <div class="desc">Les chauffeurs ${kind === 'TRUCK' ? 'de camions' : 'de véhicules de service'} uniquement. Touchez un bouton pour ouvrir le détail d'un chauffeur.</div>
      <label>Jour</label><input id="d-date" type="date" value="${esc(today)}" onchange="window._krDate=this.value;loadDaily();krLoad()" style="max-width:220px">
      <div id="kr-sum" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"></div></div>
    <div id="kr-list"><div class="empty">Chargement…</div></div>
    <div class="panel" id="fr-panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-chart"/></svg> Kilométrage &amp; carburant — récapitulatif automatique</h3>
      <div class="desc">Calculé à partir des missions terminées et des ravitaillements enregistrés. Les relevés incohérents sont exclus du total et signalés.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0"><select id="fr-per" onchange="frLoad()" style="max-width:240px"><option value="4">4 dernières semaines</option><option value="8" selected>8 dernières semaines</option><option value="12">12 dernières semaines</option><option value="m">Mois en cours</option></select><button class="btn small" style="margin:0" onclick="frCsv()"><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg> Exporter (Excel/CSV)</button></div>
      <div id="fr-body"><div class="empty">Chargement…</div></div></div>
    <div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg> Rapport global du jour</h3><div id="d-body"><div class="empty">Chargement…</div></div></div>`;
  loadDaily(); krLoad(); frLoad();
}
/* Récapitulatif kilométrage + carburant (étape 2) */
async function frLoad() {
  const box = document.getElementById('fr-body'); if (!box) return;
  const per = (document.getElementById('fr-per') || {}).value || '8', now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  let from;
  if (per === 'm') from = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  else { const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7) - 7 * (Number(per) - 1)); from = iso(m); }
  try {
    const r = await api('/reports/fleet-recap?kind=' + (window._krKind || 'TRUCK') + '&from=' + from + '&to=' + iso(now) + '&siteId=' + state.siteId);
    window._frData = r;
    const wl = (w) => 'S ' + w.slice(8, 10) + '/' + w.slice(5, 7);
    const q = r.quality || {};
    const warn = (q.inconsistentTrips || q.tripsWithoutKm) ? `<div class="msg" style="margin:6px 0;background:#FFF6E0;color:#8A5A00"><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> Contrôle nécessaire : ${q.inconsistentTrips || 0} mission(s) avec distance incohérente (exclues) et ${q.tripsWithoutKm || 0} sans kilométrage.</div>` : '';
    const rowH = (x, tot) => `<tr${tot ? ' style="font-weight:700;background:#F0F4FA"' : ''}><td>${tot ? 'TOTAL FLOTTE' : esc(x.number) + (x.registration ? '<br><small>' + esc(x.registration) + '</small>' : '')}</td>${r.weeks.map((w) => `<td style="text-align:right">${fmt(x.weeks[w])}</td>`).join('')}<td style="text-align:right"><b>${fmt(x.totalKm)}</b></td><td style="text-align:right">${fmt(x.liters)}</td><td style="text-align:right">${fmt(x.cost)}</td><td style="text-align:right">${x.l100 == null ? '—' : x.l100}</td><td style="text-align:right">${tot ? '' : fmt(x.odometer)}</td></tr>`;
    box.innerHTML = r.vehicles.length ? warn + `<div style="overflow:auto"><table><tr><th>Véhicule</th>${r.weeks.map((w) => `<th style="text-align:right">${wl(w)}</th>`).join('')}<th style="text-align:right">Total km</th><th style="text-align:right">Litres</th><th style="text-align:right">Coût (GNF)</th><th style="text-align:right">L/100 km</th><th style="text-align:right">Compteur</th></tr>${r.vehicles.map((x) => rowH(x, false)).join('')}${rowH(r.total, true)}</table></div><div class="desc" style="margin-top:6px">Semaines du lundi au dimanche · du ${esc(r.from)} au ${esc(r.to)} · « — » = données insuffisantes pour calculer.</div>` : '<div class="empty">Aucun véhicule dans cette catégorie.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function frCsv() {
  const r = window._frData; if (!r) return;
  const head = ['Véhicule', 'Immatriculation', ...r.weeks, 'Total km', 'Litres', 'Coût GNF', 'L/100 km', 'Compteur'];
  const line = (x, t) => [t ? 'TOTAL FLOTTE' : x.number, t ? '' : x.registration || '', ...r.weeks.map((w) => x.weeks[w]), x.totalKm, x.liters, x.cost, x.l100 == null ? '' : x.l100, t ? '' : x.odometer];
  const csv = [head, ...r.vehicles.map((x) => line(x, false)), line(r.total, true)].map((a) => a.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); a.download = 'recap-km-carburant-' + r.kind.toLowerCase() + '-' + r.to + '.csv'; a.click();
}
/* Récapitulatif maintenance (étape 3) */
const MR_LV = { OVERDUE: ['En retard', '#A8403D'], SOON: ['Bientôt', '#C77D0A'], OK: ['À jour', '#3F8F6B'] };
async function mrLoad() {
  const box = document.getElementById('mr-body'); if (!box) return;
  const kind = document.getElementById('mr-kind').value, per = document.getElementById('mr-per').value; window._mrKind = kind;
  try {
    const r = await api('/maintenance/recap?kind=' + kind + '&months=' + per + '&siteId=' + state.siteId);
    window._mrData = r;
    const t = r.total, dueTxt = (d) => { if (!d) return '<span style="color:var(--muted)">Aucune échéance enregistrée</span>'; const lv = MR_LV[d.level], parts = []; if (d.nextDate) parts.push(new Date(d.nextDate).toLocaleDateString('fr-FR') + (d.daysLeft != null ? ' (' + (d.daysLeft < 0 ? 'dépassée de ' + (-d.daysLeft) + ' j' : 'dans ' + d.daysLeft + ' j') + ')' : '')); if (d.nextMileage != null) parts.push(fmt(d.nextMileage) + ' km' + (d.kmLeft != null ? ' (' + (d.kmLeft < 0 ? 'dépassé de ' + fmt(-d.kmLeft) : 'reste ' + fmt(d.kmLeft)) + ' km)' : '')); return `<b style="color:${lv[1]}">${lv[0]}</b> · ${esc(d.type)}<br><small>${parts.join(' · ')}</small>`; };
    const tile = (n, l, c) => `<div style="flex:1;min-width:110px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px;text-align:center"><div style="font-size:20px;font-weight:700;color:${c}">${n}</div><div style="font-size:12px;color:var(--muted)">${l}</div></div>`;
    const max = Math.max(1, ...r.byMonth.map((m) => m.cost));
    box.innerHTML = r.vehicles.length ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">${tile(fmt(t.periodCost), 'Coût sur la période (GNF)', 'var(--navy)')}${tile(t.count, 'Interventions', 'var(--navy)')}${tile(t.overdue, 'Entretiens en retard', t.overdue ? '#A8403D' : '#3F8F6B')}${tile(t.soon, 'À prévoir bientôt', t.soon ? '#C77D0A' : '#3F8F6B')}${tile(fmt(t.cumulCost), 'Coût cumulé (GNF)', 'var(--navy)')}</div>
      <div style="overflow:auto"><table><tr><th>Véhicule</th><th style="text-align:right">Interv.</th><th style="text-align:right">Coût période</th><th style="text-align:right">dont préventif</th><th style="text-align:right">dont correctif</th><th style="text-align:right">Coût cumulé</th><th>Dernier entretien</th><th>Prochaine échéance</th></tr>${r.vehicles.map((v) => `<tr><td><b>${esc(v.number)}</b>${v.registration ? '<br><small>' + esc(v.registration) + '</small>' : ''}</td><td style="text-align:right">${v.count}</td><td style="text-align:right"><b>${fmt(v.periodCost)}</b></td><td style="text-align:right">${fmt(v.preventive)}</td><td style="text-align:right">${fmt(v.corrective)}</td><td style="text-align:right">${fmt(v.cumulCost)}</td><td>${v.lastDate ? new Date(v.lastDate).toLocaleDateString('fr-FR') : '—'}</td><td>${dueTxt(v.nextDue)}</td></tr>`).join('')}</table></div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px"><div style="flex:1;min-width:240px"><b style="font-size:14px">Par type d'intervention</b>${r.byType.length ? r.byType.map((x) => `<div class="drv-row"><span>${esc(x.label)} <small>(${x.count})</small></span><b>${fmt(x.cost)}</b></div>`).join('') : '<div class="desc">Aucune intervention sur la période.</div>'}</div>
      <div style="flex:1;min-width:240px"><b style="font-size:14px">Par mois (GNF)</b>${r.byMonth.map((m) => `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:5px"><span style="width:56px">${esc(m.month)}</span><div style="flex:1;background:#E9EEF6;border-radius:4px;height:12px"><div style="width:${Math.round((m.cost / max) * 100)}%;background:var(--navy);height:12px;border-radius:4px"></div></div><span style="min-width:78px;text-align:right">${fmt(m.cost)}</span></div>`).join('')}</div></div>` : '<div class="empty">Aucun véhicule dans cette catégorie.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function mrCsv() {
  const r = window._mrData; if (!r) return;
  const head = ['Véhicule', 'Immatriculation', 'Interventions', 'Coût période GNF', 'Préventif', 'Correctif', 'Coût cumulé GNF', 'Dernier entretien', 'Prochaine échéance'];
  const rows = r.vehicles.map((v) => [v.number, v.registration || '', v.count, v.periodCost, v.preventive, v.corrective, v.cumulCost, v.lastDate ? String(v.lastDate).slice(0, 10) : '', v.nextDue ? v.nextDue.type + ' ' + (v.nextDue.nextDate ? String(v.nextDue.nextDate).slice(0, 10) : '') + ' ' + (v.nextDue.nextMileage != null ? v.nextDue.nextMileage + ' km' : '') : '']);
  const csv = [head, ...rows].map((a) => a.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); a.download = 'recap-maintenance-' + r.kind.toLowerCase() + '.csv'; a.click();
}
{ const _rm = renderMaintenance; renderMaintenance = async function () { const r = await _rm(); mrLoad(); mpLoad(); return r; }; }
const KR_TABS = [['trips', 'Trajets'], ['fuel', 'Carburant'], ['maint', 'Maintenance'], ['pannes', 'Pannes']];
async function krLoad() {
  const box = document.getElementById('kr-list'); if (!box) return;
  const kind = window._krKind, d = document.getElementById('d-date').value;
  try {
    const [bd, sheets] = await Promise.all([api('/driver-admin/board?date=' + d + '&siteId=' + state.siteId), api('/driver-admin/sheets?date=' + d + '&siteId=' + state.siteId)]);
    window._krSheets = {}; sheets.forEach((sh) => { window._krSheets[sh.driver.id] = sh; });
    const list = bd.drivers.filter((x) => x.kind === kind);
    const cnt = (st) => list.filter((x) => x.status === st).length;
    const tile = (n, l, c) => `<div style="flex:1;min-width:110px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px;text-align:center"><div style="font-size:20px;font-weight:700;color:${c}">${n}</div><div style="font-size:12px;color:var(--muted)">${l}</div></div>`;
    document.getElementById('kr-sum').innerHTML = tile(list.length, 'Chauffeurs', 'var(--navy)') + tile(cnt('ENVOYEE'), 'Rapports envoyés', '#3F8F6B') + tile(cnt('A_ENVOYER'), 'À envoyer', '#C77D0A') + tile(cnt('RIEN'), 'Rien de saisi', '#A8403D');
    box.innerHTML = list.map((x) => {
      const st = BOARD_ST[x.status], sh = window._krSheets[x.id];
      const num = String(x.phone || '').replace(/\D/g, ''), full = num.length === 9 ? '224' + num : num;
      const relance = x.phone && (x.status === 'A_ENVOYER' || x.status === 'RIEN') ? `<a class="btn small" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${esc(full)}?text=${encodeURIComponent('Bonjour ' + x.name + ', merci de compléter et d\'envoyer votre fiche de bord du jour dans l\'application.')}">Relancer</a>` : '';
      return `<div class="panel" id="kr-${esc(x.id)}"><h3 style="margin-bottom:4px">${esc(x.name)} <span class="badge ${st[2]}">${st[0]} ${st[1]}</span>${sh && sh.processedAt ? ' <span class="badge ok"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Traitée</span>' : ''}</h3>
        <div class="desc">${esc(x.vehicle || 'Aucun véhicule')} · ${esc(x.phone || '—')} · <b>${fmt(x.km)} km</b> · ${x.liters} L · ${x.tripsCount} trajet(s)</div>
        ${x.alerts.map((a) => `<div style="font-size:12px;color:#9A6A0C"><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> ${esc(a)}</div>`).join('')}
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${sh ? KR_TABS.map(([k, t]) => `<button class="btn small" style="margin:0" onclick="krToggle('${esc(x.id)}','${k}')">${t}</button>`).join('') + (sh.status === 'SENT' && !sh.processedAt ? `<button class="btn small gold" style="margin:0" onclick="krProcess('${esc(x.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Marquer traitée</button>` : '') : '<span class="desc" style="margin:0">Aucune saisie ce jour.</span>'}${relance}</div>
        <div id="kr-d-${esc(x.id)}" style="margin-top:8px"></div></div>`;
    }).join('') || '<div class="panel"><div class="empty">Aucun chauffeur dans cette catégorie.</div></div>';
  } catch (e) { box.innerHTML = `<div class="panel"><div class="msg err">${esc(e.message)}</div></div>`; }
}
function krToggle(id, tab) {
  const box = document.getElementById('kr-d-' + id), sh = (window._krSheets || {})[id]; if (!box || !sh) return;
  if (box.dataset.tab === tab) { box.innerHTML = ''; box.dataset.tab = ''; return; }
  box.dataset.tab = tab;
  const hh = (x) => (x ? new Date(x).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '…');
  const empty = '<div class="desc">Rien à signaler.</div>';
  let html = '';
  if (tab === 'trips') html = sh.trips.length ? `<div style="overflow:auto"><table><tr><th>Véhicule</th><th>Destination / motif</th><th>Horaires</th><th>Km</th><th>Distance</th></tr>${sh.trips.map((t) => `<tr><td>${esc(t.plate)}</td><td>${esc(t.destination || (t.regions || []).join(', ') || '—')}</td><td>${hh(t.startTime)} → ${hh(t.endTime)}</td><td class="mono">${fmt(t.startMileage)} → ${t.endMileage != null ? fmt(t.endMileage) : '…'}</td><td class="mono"><b>${fmt(t.km)} km</b></td></tr>`).join('')}</table></div>` : empty;
  else if (tab === 'fuel') html = sh.fuel.length ? `<div style="overflow:auto"><table><tr><th>Heure</th><th>Source</th><th>Km</th><th>Litres</th><th>Coût (GNF)</th></tr>${sh.fuel.map((f) => `<tr><td>${hh(f.time)}</td><td>${esc(drvSrc(f))}</td><td class="mono">${fmt(f.mileage)}</td><td class="mono">${fmt(f.liters)}</td><td class="mono">${fmt(f.cost)}</td></tr>`).join('')}</table></div>` : empty;
  else if (tab === 'maint') { const m = sh.maintenance.filter((x) => x.nature !== 'ANOMALIE'); html = m.length ? `<div style="overflow:auto"><table><tr><th>Nature</th><th>Détail</th><th>Km</th><th>Prochaine vidange</th><th>Coût (GNF)</th></tr>${m.map((x) => `<tr><td>${esc(DRV_NAT[x.nature] || x.nature)}</td><td>${esc(x.detail || '')}</td><td class="mono">${fmt(x.mileage)}</td><td class="mono">${x.nextServiceKm ? fmt(x.nextServiceKm) : '—'}</td><td class="mono">${fmt(x.cost)}</td></tr>`).join('')}</table></div>` : empty; }
  else if (tab === 'pannes') {
    const a = sh.maintenance.filter((x) => x.nature === 'ANOMALIE');
    const t = sh.trips.filter((x) => x.preCondition === 'ANOMALIE' || x.maintenanceNeeded);
    html = a.length || t.length ? `${a.map((x) => `<div class="drv-row"><span>${esc(x.detail || 'Anomalie')}</span><b>${x.severity ? esc(x.severity) : ''}</b></div>`).join('')}${t.map((x) => `<div class="drv-row"><span>${esc(x.plate)} — ${esc(x.preAnomalies || x.maintenanceReason || '')}</span><b>${x.maintenanceNeeded ? 'Maintenance à prévoir' : 'Anomalie'}</b></div>`).join('')}` : empty;
  }
  box.innerHTML = html;
}
async function krProcess(id) {
  const d = document.getElementById('d-date').value;
  const note = prompt('Note pour le chauffeur (facultatif) :', ''); if (note === null) return;
  try { await api('/driver-admin/sheets/process', { method: 'POST', body: { driverId: id, date: d, note: note || undefined } }); krLoad(); } catch (e) { alert(e.message); }
}
/* ---------------- PERSONNEL : agents HSE et magasiniers (enregistrement, lien WhatsApp, rapports) ---------------- */
const STAFF_CFG = {
  'staff-hse': { role: 'AGENT_HSE', one: 'agent HSE', title: 'Agents HSE', rep: 'Rapports HSE' },
  'staff-store': { role: 'MAGASINIER', one: 'gestionnaire de stock', title: '‍ Gestionnaires de stock', rep: 'Rapports Entrepôt' },
  'staff-mech': { role: 'MECANICIEN', one: 'mécanicien', title: 'Mécaniciens', rep: 'Rapports Atelier' },
  'staff-pointer': { role: 'POINTEUR', one: 'pointeur', title: 'Pointeurs', rep: 'Rapports de pointage' },
};
async function renderStaff(view, reportsOnly) {
  const c = STAFF_CFG[view]; window._stView = view; window._stRo = !!reportsOnly;
  const today = window._stDate || new Date().toISOString().slice(0, 10);
  const office = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role) && !reportsOnly;
  root().innerHTML = `
    <div class="panel"><h3>${c.rep}</h3>
      <div class="desc">${reportsOnly ? `Rapport d'activité envoyé chaque jour par les ${c.one}s. L'enregistrement et l'envoi du lien se font dans Logistique › Équipes terrain › Enrôlement.` : `Chaque ${c.one} est enregistré, reçoit son lien par WhatsApp, puis envoie chaque jour son rapport d'activité : vous le recevez ici.`}</div>
      <label>Jour</label><input id="st-date" type="date" value="${esc(today)}" onchange="window._stDate=this.value;stLoad()" style="max-width:220px">
      <div id="st-sum" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"></div></div>
    <div id="st-reports"><div class="empty">Chargement…</div></div>
    ${office ? `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Nouveau ${c.one}</h3>
      <div class="grid-2"><div><label>Prénom</label><input id="st-first"></div><div><label>Nom</label><input id="st-last"></div><div><label>Téléphone (WhatsApp)</label><input id="st-phone" type="tel" placeholder="6xx xx xx xx"></div></div>
      <button class="btn gold" onclick="stSave()">Enregistrer</button><div id="st-msg"></div></div>` : ''}
    ${reportsOnly ? '' : '<div class="panel"><h3>Équipe</h3><div id="st-team"><div class="empty">Chargement…</div></div><div id="st-inv"></div></div>'}`;
  stLoad();
}
async function stLoad() {
  const c = STAFF_CFG[window._stView]; if (!c) return;
  const d = document.getElementById('st-date').value;
  const office = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role) && !window._stRo;
  const canReceive = !['LECTEUR', 'DIRECTEUR_GENERAL'].includes(state.user.role);
  try {
    const [team, reps] = await Promise.all([api('/staff?role=' + c.role + '&siteId=' + state.siteId), api('/staff/reports?role=' + c.role + '&date=' + d + '&siteId=' + state.siteId)]);
    const active = team.filter((u) => u.status === 'ACTIVE');
    const byName = {}; reps.forEach((r) => { byName[r.name] = r; });
    const missing = active.filter((u) => !byName[u.firstName + ' ' + u.lastName]);
    const tile = (n, l, col) => `<div style="flex:1;min-width:110px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px;text-align:center"><div style="font-size:20px;font-weight:700;color:${col}">${n}</div><div style="font-size:12px;color:var(--muted)">${l}</div></div>`;
    document.getElementById('st-sum').innerHTML = tile(active.length, 'Personnes', 'var(--navy)') + tile(reps.length, 'Rapports envoyés', '#3F8F6B') + tile(reps.filter((r) => r.receivedAt).length, 'Reçus', '#3F8F6B') + tile(missing.length, 'Non envoyés', '#A8403D');
    const wa = (u) => { const n = String(u.phone || '').replace(/\D/g, ''), f = n.length === 9 ? '224' + n : n; return u.phone ? `<a class="btn small" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${esc(f)}?text=${encodeURIComponent('Bonjour ' + u.firstName + ', merci d\'envoyer votre rapport du jour dans l\'application.')}">Relancer</a>` : ''; };
    document.getElementById('st-reports').innerHTML = reps.map((r) => `<div class="panel"><h3 style="margin-bottom:4px">${esc(r.name)} ${stepBadge(staffStep(r))} <span style="font-size:12px;font-weight:400;color:var(--muted)">${drvDt(r.sentAt)}</span></h3>
        <div class="desc">${esc(r.phone || '')}</div>
        <h4 style="margin:8px 0 2px">Activités</h4><div style="white-space:pre-wrap">${esc(r.activities)}</div>
        ${r.observations ? `<h4 style="margin:8px 0 2px">Observations</h4><div style="white-space:pre-wrap">${esc(r.observations)}</div>` : ''}
        ${r.rejectNote ? `<div class="msg err">Rejeté : ${esc(r.rejectNote)}</div>` : ''}
        ${!r.receivedAt && !r.rejectedAt && canReceive ? `<button class="btn small gold" style="margin-top:8px" onclick="stReceive('${esc(r.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Vérifier et transmettre</button> <button class="btn small" style="margin-top:8px" onclick="stReject('${esc(r.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-chevron-left"/></svg> Rejeter</button>` : ''}</div>`).join('')
      + (missing.length ? `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> Rapport non envoyé</h3>${missing.map((u) => `<div class="drv-row"><span>${esc(u.firstName + ' ' + u.lastName)}</span><span>${wa(u)}</span></div>`).join('')}</div>` : '')
      || '<div class="panel"><div class="empty">Aucune personne enregistrée.</div></div>';
    const tmEl = document.getElementById('st-team'); if (tmEl) tmEl.innerHTML = team.length ? `<div style="overflow:auto"><table><tr><th>Nom</th><th>Téléphone</th><th>Application</th><th>Dernier rapport</th><th></th></tr>${team.map((u) => `<tr><td><b>${esc(u.lastName)}</b> ${esc(u.firstName)}</td><td>${esc(u.phone || '—')}</td>
      <td>${u.neverConnected ? '<span class="badge warn">Pas encore connecté</span>' : '<span class="badge ok">Connecté</span>'}</td><td>${esc(u.lastReport || '—')}</td>
      <td>${office ? `<button class="btn small gold" onclick="stInvite('${esc(u.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-message"/></svg> Envoyer le lien</button>` : ''}</td></tr>`).join('')}</table></div>` : '<div class="empty">Aucune personne enregistrée.</div>';
  } catch (e) { document.getElementById('st-reports').innerHTML = `<div class="panel"><div class="msg err">${esc(e.message)}</div></div>`; }
}
async function stSave() {
  const c = STAFF_CFG[window._stView], m = document.getElementById('st-msg'), g = (id) => document.getElementById(id).value.trim();
  if (!g('st-first') || !g('st-last')) { m.innerHTML = '<div class="msg err">Prénom et nom obligatoires.</div>'; return; }
  if (g('st-phone').replace(/\D/g, '').length < 8) { m.innerHTML = '<div class="msg err">Numéro de téléphone obligatoire (le lien est envoyé par WhatsApp).</div>'; return; }
  try {
    const r = await api('/staff', { method: 'POST', body: { firstName: g('st-first'), lastName: g('st-last'), phone: g('st-phone'), role: c.role, siteId: state.siteId } });
    m.innerHTML = '<div class="msg ok">Enregistré.</div>';
    await stInvite(r.id); stLoad();
    ['st-first', 'st-last', 'st-phone'].forEach((id) => { document.getElementById(id).value = ''; });
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function stInvite(userId) {
  const box = document.getElementById('st-inv');
  try {
    const link = location.origin + location.pathname.replace(/index\.html$/, '');
    const r = await api('/staff/invite', { method: 'POST', body: { userId, appUrl: link } });
    const num = r.phone.length === 9 ? '224' + r.phone : r.phone; window._invMsg = r.message;
    box.innerHTML = `<div class="msg ok" style="margin-top:10px">Message prêt pour ${esc(r.name)} (${esc(num)}).</div>
      <a class="btn gold" style="display:inline-block;margin:6px 6px 6px 0;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${esc(num)}?text=${encodeURIComponent(r.message)}">Envoyer par WhatsApp</a>
      <button class="btn" onclick="navigator.clipboard.writeText(window._invMsg).then(()=>alert('Message copié : collez-le dans WhatsApp.'))">Copier le message</button>
      <div class="desc">WhatsApp s'ouvre avec le message prêt : appuyez sur « Envoyer ».</div>`;
    box.scrollIntoView({ behavior: 'smooth' });
  } catch (e) { box.innerHTML = `<div class="msg err" style="margin-top:10px">${esc(e.message)}</div>`; }
}




/* ---------------- ÉTAPE 3 : onglets de département, Rapports (menu unique), Enrôlement WhatsApp ---------------- */
const LOGI_ROLES = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'LECTEUR'];
const OFFICE_ROLES = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'];
const LOGI_TABS = [
  { t: 'Flotte', go: 'trucks', views: ['trucks', 'service-vehicles', 'vehicles'], subs: [['trucks', 'Camions'], ['service-vehicles', 'Véhicules de service']] },
  { t: 'Équipes terrain', go: 'drivers', views: ['drivers', 'pointage', 'enrol', 'driver-board', 'driver-devices'], subs: [['drivers', 'Chauffeurs'], ['pointage', 'Pointage'], ['enrol', 'Enrôlement WhatsApp', 1], ['driver-board', 'Suivi du jour'], ['driver-devices', 'Appareils']] },
  { t: 'Fiches de bord', go: 'driver-sheets', views: ['driver-sheets', 'driver-missions'], subs: [['driver-sheets', 'Du jour'], ['driver-missions', 'Historique']] },
  { t: 'Carburant & Maintenance', go: 'fuel', views: ['fuel', 'maintenance'], subs: [['fuel', 'Carburant'], ['maintenance', 'Maintenance']] },
  { t: 'Dépenses', go: 'driver-expenses', views: ['driver-expenses'], subs: null },
];
const REPORT_TABS = [
  { t: 'Camions', go: 'reports-truck', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'LECTEUR'] },
  { t: 'Véhicules de service', go: 'reports-service', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'LECTEUR'] },
  { t: 'Chauffeurs & pointages', go: 'reports-drivers', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'LECTEUR'] },
  { t: 'Stock', go: 'reports-stock', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'LECTEUR', 'MAGASINIER'] },
  { t: 'HSE', go: 'reports-hse', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'LECTEUR', 'GESTIONNAIRE_HSE'] },
  { t: 'Synthèse DG', go: 'reports-dg', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'LECTEUR'] },
];
function reportsHome(role) { return role === 'GESTIONNAIRE_HSE' ? 'reports-hse' : role === 'MAGASINIER' ? 'reports-stock' : 'reports-truck'; }
function navKey(view) {
  const r = state.user && state.user.role;
  if (String(view).startsWith('reports-')) return 'reports-truck';
  if (r && LOGI_ROLES.includes(r)) { const t = LOGI_TABS.find((x) => x.views.includes(view)); if (t) return t.go; }
  return view;
}
function deptBarHtml(view) {
  const r = state.user && state.user.role; if (!r) return '';
  const btn = (label, v, on) => `<button class="${on ? 'on' : ''}" onclick="go('${v}')">${label}</button>`;
  if (String(view).startsWith('reports-')) {
    const tabs = REPORT_TABS.filter((x) => x.roles.includes(r)); if (tabs.length < 2) return '';
    return `<div class="dp-tabs" id="dp-bar">${tabs.map((x) => btn(x.t, x.go, x.go === view)).join('')}</div>`;
  }
  if (r === 'RESPONSABLE_OPERATIONS' && ['ops-validation', 'driver-expenses'].includes(view)) {
    return `<div class="dp-tabs" id="dp-bar">${btn('<svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg> Fiches à valider', 'ops-validation', view === 'ops-validation')}${btn('<svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg> Dépenses & reçus', 'driver-expenses', view === 'driver-expenses')}</div>`;
  }
  if (LOGI_ROLES.includes(r)) {
    const cur = LOGI_TABS.find((x) => x.views.includes(view)); if (!cur) return '';
    const subs = (cur.subs || []).filter((x) => !x[2] || OFFICE_ROLES.includes(r));
    return `<div class="dp-tabs" id="dp-bar">${LOGI_TABS.map((x) => btn(x.t, x.go, x === cur)).join('')}</div>` + (subs.length > 1 ? `<div class="dp-sub">${subs.map((x) => btn(x[1], x[0], x[0] === view)).join('')}</div>` : '');
  }
  return '';
}
{ const _rv3 = renderView; renderView = async function (view) { const r = await _rv3(view); try { const h = deptBarHtml(view); if (h && state.view === view) root().insertAdjacentHTML('afterbegin', h); } catch (e) {} return r; }; }

/* Rapports › Chauffeurs & pointages (lecture seule : le pointage se saisit dans Équipes terrain) */
async function renderReportDrivers() {
  const date = window._rdDate || new Date().toISOString().slice(0, 10);
  const q = 'siteId=' + encodeURIComponent(state.siteId || '');
  const [drivers, att, bd] = await Promise.all([api('/drivers?' + q), api('/drivers/attendance/day?' + q + '&date=' + date), api('/driver-admin/board?date=' + date + '&' + q)]);
  const by = {}; att.forEach((a) => { by[a.driverId] = a; });
  const bo = {}; bd.drivers.forEach((x) => { bo[x.id] = x; });
  const list = drivers.filter((d) => d.status === 'ACTIVE' || !d.status);
  const pres = list.filter((d) => by[d.id] && by[d.id].status === 'PRESENT').length, abs = list.filter((d) => by[d.id] && by[d.id].status === 'ABSENT').length, none = list.filter((d) => !by[d.id]).length;
  const tile = (n, l, c) => `<div style="flex:1;min-width:110px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px;text-align:center"><div style="font-size:20px;font-weight:700;color:${c}">${n}</div><div style="font-size:12px;color:var(--muted)">${l}</div></div>`;
  const rows = list.map((d) => {
    const a = by[d.id], cur = a && ATT_ST.find((x) => x[0] === a.status), x = bo[d.id], st = x && BOARD_ST[x.status];
    return `<tr><td><b>${esc(d.lastName)}</b> ${esc(d.firstName)}</td><td>${d.activity === 'TRUCK' ? '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Camion' : d.activity === 'SERVICE_VEHICLE' ? '<svg class="ic" aria-hidden="true"><use href="#i-car"/></svg> Véhicule de service' : '—'}</td>
      <td>${cur ? `<span class="badge ${cur[2]}">${cur[1]}</span>${a.absenceReason ? `<div style="font-size:12px;color:var(--muted)">${esc(a.absenceReason)}</div>` : ''}` : '<span class="badge warn">Non pointé</span>'}</td>
      <td class="mono">${x ? fmt(x.km) + ' km' : '—'}</td><td>${st ? `<span class="badge ${st[2]}">${st[0]} ${st[1]}</span>` : '—'}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">Aucun chauffeur.</td></tr>';
  root().innerHTML = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-users"/></svg> Chauffeurs & pointages</h3><div class="desc">Présence et fiches de bord du jour. Lecture seule.</div>
    <label>Jour</label><input type="date" value="${esc(date)}" max="${new Date().toISOString().slice(0, 10)}" style="max-width:220px" onchange="window._rdDate=this.value;renderReportDrivers().then(()=>{const h=deptBarHtml('reports-drivers');if(h)root().insertAdjacentHTML('afterbegin',h)})">
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">${tile(list.length, 'Chauffeurs actifs', 'var(--navy)')}${tile(pres, 'Présents', '#3F8F6B')}${tile(abs, 'Absents', '#A8403D')}${tile(none, 'Non pointés', '#C77D0A')}</div></div>
    <div class="panel"><div style="overflow:auto"><table><tr><th>Chauffeur</th><th>Activité</th><th>Pointage</th><th>Km du jour</th><th>Fiche de bord</th></tr>${rows}</table></div></div>`;
}

/* Enrôlement WhatsApp : 4 catégories, un seul endroit pour enregistrer et envoyer le lien */
const ENROL_TABS = [['TRUCK', 'Chauffeurs camions'], ['SERVICE_VEHICLE', 'Chauffeurs véhicules de service'], ['HSE', 'Agents HSE'], ['POINTER', 'Pointeurs']];
const ENROL_ONE = { TRUCK: 'chauffeur de camion', SERVICE_VEHICLE: 'chauffeur de véhicule de service', HSE: 'agent HSE', POINTER: 'pointeur' };
const ENROL_ST = { NON_ENVOYE: ['Non envoyé', 'info'], ENVOYE: ['Envoyé', 'warn'], OUVERT: ['Ouvert', 'warn'], ACTIVE: ['Activé', 'ok'], EXPIRE: ['Expiré', 'bad'] };
function enrolLink() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
async function renderEnrol(kind) {
  const role = state.user.role, tabs = role === 'GESTIONNAIRE_HSE' ? ENROL_TABS.filter((t) => t[0] === 'HSE') : ENROL_TABS;
  const can = [...OFFICE_ROLES, 'GESTIONNAIRE_HSE'].includes(role);
  if (!can) { root().innerHTML = '<div class="panel"><div class="msg err">Accès réservé.</div></div>'; return; }
  kind = kind || window._enKind; if (!tabs.some((t) => t[0] === kind)) kind = tabs[0][0]; window._enKind = kind;
  const drv = kind === 'TRUCK' || kind === 'SERVICE_VEHICLE';
  root().innerHTML = `${tabs.length > 1 ? `<div class="dp-sub">${tabs.map((t) => `<button class="${t[0] === kind ? 'on' : ''}" onclick="renderEnrol('${t[0]}').then(()=>{const h=deptBarHtml('enrol');if(h)root().insertAdjacentHTML('afterbegin',h)})">${t[1]}</button>`).join('')}</div>` : ''}
    <div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Nouveau ${ENROL_ONE[kind]}</h3>
      <div class="desc">Enregistrez la personne : le lien de l'application s'ouvre dans WhatsApp, avec son identifiant (son numéro) et son mot de passe provisoire.</div>
      <div class="grid-2"><div><label>Nom</label><input id="en-last" autocomplete="off"></div><div><label>Prénom</label><input id="en-first" autocomplete="off"></div>
        <div><label>N° WhatsApp</label><input id="en-phone" type="tel" inputmode="tel" placeholder="6xx xx xx xx"></div>
        <div>${drv ? '<label>N° de permis</label><input id="en-lic" autocomplete="off">' : `<label>Activité</label><input value="${kind === 'HSE' ? 'Agent HSE' : 'Pointeur'}" disabled>`}</div></div>
      <button class="btn gold" style="margin-top:10px" onclick="enrolSave()"><svg class="ic" aria-hidden="true"><use href="#i-message"/></svg> Envoyer le lien par WhatsApp</button><div id="en-msg"></div><div id="en-send"></div></div>
    <div class="panel"><h3>${tabs.find((t) => t[0] === kind)[1]}</h3><div id="en-sum" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"></div><div id="en-list"><div class="empty">Chargement…</div></div>
      <div class="desc" style="margin-top:10px"><b>Envoyé</b> : lien envoyé, pas encore utilisé · <b>Ouvert</b> : la personne s'est connectée, installation à terminer · <b>Activé</b> : application prête · <b>Expiré</b> : sans suite après 24 h, à renvoyer.</div></div>`;
  enrolLoad();
}
async function enrolLoad() {
  const kind = window._enKind, box = document.getElementById('en-list'); if (!box) return;
  try {
    const rows = await api('/staff/enrolment?kind=' + kind + '&siteId=' + encodeURIComponent(state.siteId || ''));
    const n = (st) => rows.filter((r) => r.state === st).length;
    const tile = (v, l, c) => `<div style="flex:1;min-width:90px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px;text-align:center"><div style="font-size:20px;font-weight:700;color:${c}">${v}</div><div style="font-size:12px;color:var(--muted)">${l}</div></div>`;
    document.getElementById('en-sum').innerHTML = tile(n('NON_ENVOYE'), 'Non envoyé', 'var(--navy)') + tile(n('ENVOYE') + n('OUVERT'), 'En cours', '#C77D0A') + tile(n('ACTIVE'), 'Activés', '#3F8F6B') + tile(n('EXPIRE'), 'Expirés', '#A8403D');
    box.innerHTML = rows.length ? rows.map((r) => {
      const st = ENROL_ST[r.state] || ENROL_ST.NON_ENVOYE;
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 0;border-top:1px solid var(--line)">
        <div style="min-width:170px;flex:1"><b>${esc(r.lastName)}</b> ${esc(r.firstName)}<div style="font-size:12px;color:var(--muted)">${esc(r.phone || 'pas de numéro')}${r.detail ? ' · ' + esc(r.detail) : ''}</div></div>
        <div style="text-align:right"><span class="badge ${st[1]}">${st[0]}</span>${r.invitedAt ? `<div style="font-size:12px;color:var(--muted)">envoi ${drvDt(r.invitedAt)}</div>` : ''}</div>
        ${r.state === 'ACTIVE' || !r.phone ? '' : `<button class="btn small gold" onclick="enrolResend('${r.kind}','${esc(r.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-message"/></svg> ${r.state === 'NON_ENVOYE' ? 'Envoyer le lien' : 'Renvoyer le lien'}</button>`}</div>`;
    }).join('') : '<div class="empty">Aucune personne enregistrée dans cette catégorie.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function enrolSend(type, id) {
  const box = document.getElementById('en-send');
  const r = type === 'DRIVER' ? await api('/driver-admin/invite', { method: 'POST', body: { driverId: id, appUrl: enrolLink() } }) : await api('/staff/invite', { method: 'POST', body: { userId: id, appUrl: enrolLink() } });
  const num = r.phone.length === 9 ? '224' + r.phone : r.phone; window._invMsg = r.message;
  box.innerHTML = `<div class="msg ok" style="margin-top:10px">Message prêt pour ${esc(r.driver || r.name)} (${esc(num)}).</div>
    <a class="btn gold" style="display:inline-block;margin:6px 6px 6px 0;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${esc(num)}?text=${encodeURIComponent(r.message)}">Ouvrir WhatsApp</a>
    <button class="btn" onclick="navigator.clipboard.writeText(window._invMsg).then(()=>alert('Message copié : collez-le dans WhatsApp.'))">Copier le message</button>
    <div class="desc">WhatsApp s'ouvre avec le message prêt : appuyez sur « Envoyer ».</div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  enrolLoad();
}
async function enrolResend(type, id) { try { await enrolSend(type, id); } catch (e) { alert(e.message); } }
async function enrolSave() {
  const kind = window._enKind, drv = kind === 'TRUCK' || kind === 'SERVICE_VEHICLE', m = document.getElementById('en-msg'), g = (id) => (document.getElementById(id) ? document.getElementById(id).value.trim() : '');
  if (!g('en-first') || !g('en-last')) { m.innerHTML = '<div class="msg err">Nom et prénom obligatoires.</div>'; return; }
  if (g('en-phone').replace(/\D/g, '').length < 8) { m.innerHTML = '<div class="msg err">Numéro WhatsApp obligatoire.</div>'; return; }
  m.innerHTML = '';
  try {
    let id;
    if (drv) id = (await api('/drivers', { method: 'POST', body: { firstName: g('en-first'), lastName: g('en-last'), phone: g('en-phone'), licenseNumber: g('en-lic') || undefined, activity: kind, siteId: state.siteId } })).id;
    else id = (await api('/staff', { method: 'POST', body: { firstName: g('en-first'), lastName: g('en-last'), phone: g('en-phone'), role: kind === 'HSE' ? 'AGENT_HSE' : 'POINTEUR', siteId: state.siteId } })).id;
    ['en-first', 'en-last', 'en-phone', 'en-lic'].forEach((x) => { const el = document.getElementById(x); if (el) el.value = ''; });
    await enrolSend(drv ? 'DRIVER' : 'STAFF', id);
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ---------------- ACCUEIL : uniquement les cartes des départements ---------------- */
const HOME_CARDS = [
  { ico: '<svg class="ic" aria-hidden="true"><use href="#i-target"/></svg>', t: 'Direction', d: 'Tableau de bord, alertes et synthèse', v: 'pilotage', roles: ['SUPER_ADMIN', 'DIRECTEUR_GENERAL'] },
  { ico: '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg>', t: 'Logistique & Flotte', d: 'Camions, véhicules, chauffeurs, fiches de bord', v: 'espace-logi', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'LECTEUR'], over: { LECTEUR: 'dash-fleet' } },
  { ico: '<svg class="ic" aria-hidden="true"><use href="#i-hard-hat"/></svg>', t: 'HSE', d: 'Incidents, audits, équipements de protection', v: 'dash-hse', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_HSE', 'LECTEUR'], over: { GESTIONNAIRE_HSE: 'espace' } },
  { ico: '<svg class="ic" aria-hidden="true"><use href="#i-package"/></svg>', t: 'Stock', d: 'Entrées, sorties, inventaires, alertes', v: 'dash-stock', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'MAGASINIER', 'LECTEUR'], over: { MAGASINIER: 'espace' } },
  { ico: '<svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg>', t: 'Opérations', d: 'Fiches vérifiées à valider, reçus papier', v: 'ops-validation', roles: ['SUPER_ADMIN', 'RESPONSABLE_OPERATIONS'] },
  { ico: '<svg class="ic" aria-hidden="true"><use href="#i-receipt"/></svg>', t: 'Comptabilité', d: 'Dépenses à valider, rapprochements, facturation', v: 'compta', roles: ['SUPER_ADMIN', 'COMPTABLE'] },
  { ico: '<svg class="ic" aria-hidden="true"><use href="#i-chart"/></svg>', t: 'Rapports', d: 'Camions, véhicules, chauffeurs, stock, HSE', v: 'reports-truck', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_HSE', 'MAGASINIER', 'LECTEUR'], over: { GESTIONNAIRE_HSE: 'reports-hse', MAGASINIER: 'reports-stock' } },
  { ico: '<svg class="ic" aria-hidden="true"><use href="#i-building"/></svg>', t: 'Administration', d: 'Responsables, licences, accès', v: 'staff-managers', roles: ['SUPER_ADMIN'] },
];
function homeCardsFor(role) { return HOME_CARDS.filter((c) => c.roles.includes(role)).map((c) => ({ ...c, view: (c.over && c.over[role]) || c.v })); }
function renderHome() {
  const u = state.user, cards = homeCardsFor(u.role);
  root().innerHTML = `${spaceHome() ? '<div style="margin-bottom:14px">' + spaceHome() + '</div>' : ''}<div style="margin-bottom:16px"><h2 style="margin:0;color:var(--navy)">${esc(u.firstName)} ${esc(u.lastName)}</h2><div class="desc" style="margin:4px 0 0">Choisissez votre département.</div></div>
    <div class="hm-grid">${cards.map((c) => `<button class="hm-card" onclick="go('${c.view}')"><div class="hm-ico">${c.ico}</div><div><b>${esc(c.t)}</b><span class="d">${esc(c.d)}</span></div></button>`).join('')}</div>`;
}

/* ---------------- BARRE DU BAS (mobile) et indicateur hors-ligne ---------------- */
function bottomEntries(role) {
  const terrain = { AGENT_HSE: 1, MECANICIEN: 1, POINTEUR: 1 };
  if (terrain[role]) return [['🏠', 'Mon espace', 'espace'], ['📝', 'Mon rapport', 'my-report'], ...(role === 'POINTEUR' ? [['🕒', 'Pointage', 'pointage']] : []), ['👤', 'Profil', '#profil']];
  if (role === 'DIRECTEUR_GENERAL') return [['🏠', 'Accueil', 'home'], ['📈', 'Tableau de bord', 'dashboard'], ['🔔', 'Alertes', '#alertes'], ['👤', 'Profil', '#profil']];
  const main = { SUPER_ADMIN: ['🎯', 'Direction', 'dashboard'], ADMIN_LOGISTIQUE: ['🚚', 'Logistique', 'espace-logi'], GESTIONNAIRE_HSE: ['🦺', 'HSE', 'espace'], MAGASINIER: ['📦', 'Stock', 'espace'], COMPTABLE: ['🧾', 'Compta', 'compta'], RESPONSABLE_COMMERCIAL: ['🛒', 'Ventes', 'ventes'], CAISSIER: ['💵', 'Caisse', 'caisse'], RESPONSABLE_OPERATIONS: ['✅', 'Validation', 'ops-validation'], LECTEUR: ['🚚', 'Logistique', 'dash-fleet'] }[role];
  const hasRep = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_HSE', 'MAGASINIER', 'LECTEUR'].includes(role);
  return [['🏠', 'Accueil', 'home'], ...(main ? [main] : []), ...(hasRep ? [['📊', 'Rapports', reportsHome(role)]] : []), ['👤', 'Profil', '#profil']];
}
function buildBottomNav() {
  const nav = document.getElementById('bottom-nav'); if (!nav || !state.user || state.user.role === 'CHAUFFEUR') return;
  nav.innerHTML = bottomEntries(state.user.role).map(([i, l, v]) => `<button data-v="${v}" onclick="bottomGo('${v}')"><span>${emoIc(i)}</span>${l}</button>`).join('');
  nav.classList.add('on');
}
function bottomGo(v) {
  if (v === '#profil') return toggleUserMenu({ stopPropagation() {} });
  if (v === '#alertes') { dgAlertsGo(); return; }
  go(v);
}
function updateBottomNav(view) { document.querySelectorAll('#bottom-nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === view)); }
{ const _g = go; go = function (v) { const r = _g.apply(this, arguments); try { updateBottomNav(navKey(v)); } catch (e) {} return r; }; }
function offlineBar() { const b = document.getElementById('offline-bar'); if (b) b.style.display = navigator.onLine ? 'none' : 'block'; }
window.addEventListener('online', offlineBar); window.addEventListener('offline', offlineBar); offlineBar();

/* ---------------- PHOTO DE PROFIL (recadrage rond + compression automatique) ---------------- */
function avatarHtml(size) {
  const u = state.user || {};
  const ini = ((u.firstName || '?')[0] + (u.lastName || '?')[0]).toUpperCase();
  return u.photoUrl ? `<img class="av-img" src="${esc(u.photoUrl)}" alt="" style="width:${size}px;height:${size}px">`
    : `<span class="av-ini" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(ini)}</span>`;
}
function refreshAvatars() { document.querySelectorAll('[data-avatar]').forEach((el) => { el.innerHTML = avatarHtml(+el.dataset.avatar); }); }
async function loadMyPhoto() {
  try { const r = await api('/auth/photo'); state.user.photoUrl = r.photoUrl || null; try { localStorage.setItem('syllo_user', JSON.stringify(state.user)); } catch (e) {} refreshAvatars(); } catch (e) {}
}
function toggleUserMenu(ev) { if (ev) ev.stopPropagation(); const m = document.getElementById('user-menu'); m.style.display = m.style.display === 'block' ? 'none' : 'block'; }
document.addEventListener('click', () => { const m = document.getElementById('user-menu'); if (m) m.style.display = 'none'; });

let PH = null;
function openPhotoEditor() {
  closePhotoEditor();
  const ov = document.createElement('div'); ov.id = 'ph-ov';
  ov.innerHTML = `<div class="ph-card"><h3>Ma photo de profil</h3><div class="desc" style="margin-bottom:0">Faites glisser pour cadrer, utilisez le curseur pour zoomer.</div>
    <canvas id="ph-cv" width="260" height="260"></canvas>
    <input type="range" id="ph-zoom" min="1" max="3" step="0.01" value="1" style="padding:0" oninput="phZoom(this.value)">
    <div class="row"><label class="btn small"><svg class="ic" aria-hidden="true"><use href="#i-camera"/></svg> Prendre une photo<input type="file" accept="image/*" capture="user" hidden onchange="phLoad(this.files[0])"></label>
    <label class="btn small ghost" style="background:#fff;color:var(--navy);border:1px solid var(--line)"><svg class="ic" aria-hidden="true"><use href="#i-image"/></svg> Galerie<input type="file" accept="image/*" hidden onchange="phLoad(this.files[0])"></label></div>
    <div class="row"><button class="btn small" id="ph-save" onclick="phSave()">Enregistrer</button><button class="btn small danger" onclick="phRemove()">Supprimer</button><button class="btn small ghost" onclick="closePhotoEditor()">Annuler</button></div>
    <div id="ph-msg"></div></div>`;
  document.body.appendChild(ov);
  PH = { img: null, zoom: 1, ox: 0, oy: 0, changed: false };
  const cv = document.getElementById('ph-cv');
  let drag = null;
  cv.onpointerdown = (e) => { if (!PH.img) return; drag = { x: e.clientX, y: e.clientY, ox: PH.ox, oy: PH.oy }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; };
  cv.onpointermove = (e) => { if (!drag) return; const k = 260 / cv.getBoundingClientRect().width; PH.ox = drag.ox + (e.clientX - drag.x) * k / 260; PH.oy = drag.oy + (e.clientY - drag.y) * k / 260; phDraw(); };
  cv.onpointerup = cv.onpointercancel = () => { drag = null; cv.style.cursor = 'grab'; };
  if (state.user && state.user.photoUrl) { const im = new Image(); im.onload = () => { PH.img = im; phDraw(); }; im.src = state.user.photoUrl; } else phDraw();
}
function closePhotoEditor() { const o = document.getElementById('ph-ov'); if (o) o.remove(); PH = null; }
function phLoad(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { document.getElementById('ph-msg').innerHTML = '<div class="msg err">Choisissez une image.</div>'; return; }
  const rd = new FileReader();
  rd.onload = () => { const im = new Image(); im.onload = () => { PH.img = im; PH.zoom = 1; PH.ox = 0; PH.oy = 0; PH.changed = true; document.getElementById('ph-zoom').value = 1; phDraw(); }; im.onerror = () => { document.getElementById('ph-msg').innerHTML = '<div class="msg err">Image illisible.</div>'; }; im.src = rd.result; };
  rd.readAsDataURL(file);
}
function phZoom(v) { PH.zoom = +v; PH.changed = true; phDraw(); }
function phRender(ctx, S) {
  const im = PH.img; ctx.clearRect(0, 0, S, S); ctx.fillStyle = '#E6ECF5'; ctx.fillRect(0, 0, S, S);
  if (!im) return;
  const base = Math.max(S / im.width, S / im.height) * PH.zoom, w = im.width * base, h = im.height * base;
  const mx = Math.max(0, (w - S) / 2) / S, my = Math.max(0, (h - S) / 2) / S;
  PH.ox = Math.max(-mx, Math.min(mx, PH.ox)); PH.oy = Math.max(-my, Math.min(my, PH.oy));
  ctx.drawImage(im, S / 2 - w / 2 + PH.ox * S, S / 2 - h / 2 + PH.oy * S, w, h);
}
function phDraw() {
  const cv = document.getElementById('ph-cv'); if (!cv) return; const ctx = cv.getContext('2d'), S = 260;
  phRender(ctx, S);
  if (!PH.img) { ctx.fillStyle = '#6B7A8F'; ctx.font = '600 15px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Prenez ou choisissez une photo', S / 2, S / 2); }
  ctx.save(); ctx.fillStyle = 'rgba(10,31,71,.55)'; ctx.beginPath(); ctx.rect(0, 0, S, S); ctx.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2, true); ctx.fill('evenodd'); ctx.restore();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2); ctx.stroke();
}
async function phSave() {
  const msg = document.getElementById('ph-msg');
  if (!PH || !PH.img || !PH.changed) { msg.innerHTML = '<div class="msg err">Choisissez d’abord une nouvelle photo.</div>'; return; }
  // Image finale ronde 192 px, JPEG léger (adapté aux connexions lentes) ; on réduit jusqu'à tenir sous ~60 Ko
  let out = null;
  for (const [size, q] of [[192, 0.72], [192, 0.55], [144, 0.6], [112, 0.55]]) {
    const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
    const keep = { ox: PH.ox, oy: PH.oy }; phRender(x, size); PH.ox = keep.ox; PH.oy = keep.oy;
    out = c.toDataURL('image/jpeg', q); if (out.length < 60000) break;
  }
  try {
    document.getElementById('ph-save').disabled = true;
    await api('/auth/photo', { method: 'PUT', body: { photo: out } });
    state.user.photoUrl = out; try { localStorage.setItem('syllo_user', JSON.stringify(state.user)); } catch (e) {}
    refreshAvatars(); closePhotoEditor();
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; document.getElementById('ph-save').disabled = false; }
}
async function phRemove() {
  if (!state.user.photoUrl) { closePhotoEditor(); return; }
  if (!confirm('Supprimer votre photo de profil ?')) return;
  try { await api('/auth/photo', { method: 'DELETE' }); state.user.photoUrl = null; try { localStorage.setItem('syllo_user', JSON.stringify(state.user)); } catch (e) {} refreshAvatars(); closePhotoEditor(); }
  catch (e) { document.getElementById('ph-msg').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ---------------- PILOTAGE : espace Directeur Général et espace Responsable logistique ---------------- */
function execStyle() {
  if (document.getElementById('exec-style')) return;
  const st = document.createElement('style'); st.id = 'exec-style';
  st.textContent = `.ex-hero{border-radius:8px;padding:20px 22px;color:#fff;background:var(--navy);margin-bottom:14px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
  .ex-hero h2{margin:0 0 4px;font-size:20px}.ex-hero p{margin:0;opacity:.9;font-size:14px}.ex-hero .ex-date{font-size:12px;opacity:.8}
  .ex-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:14px}
  .ex-kpi{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px;display:flex;gap:12px;align-items:center;box-shadow:var(--shadow)}
  .ex-ico{width:46px;height:46px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
  .ex-kpi b{display:block;font-size:20px;line-height:1.1;color:var(--navy)}.ex-kpi span{font-size:12px;color:var(--muted)}.ex-kpi small{display:block;font-size:12px;margin-top:2px}
  .ex-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-bottom:14px}
  .ex-card{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px;box-shadow:var(--shadow)}
  .ex-card h3{margin:0 0 10px;font-size:14px;color:var(--navy);display:flex;justify-content:space-between;align-items:center}
  .ex-bars{display:flex;align-items:flex-end;gap:10px;height:150px;padding-top:6px;border-bottom:1px solid var(--line)}
  .ex-bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
  .ex-bar div.pair{display:flex;gap:3px;align-items:flex-end;height:calc(100% - 18px);width:100%;justify-content:center}
  .ex-bar i{display:block;width:42%;max-width:22px;border-radius:5px 5px 0 0;min-height:2px}
  .ex-bar em{font-style:normal;font-size:12px;color:var(--muted);margin-top:4px}
  .ex-ring{width:120px;height:120px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:4px auto}
  .ex-ring div{width:88px;height:88px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:var(--navy)}
  .ex-al{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:14px}.ex-al:last-child{border:0}
  .ex-dot{width:10px;height:10px;border-radius:50%;margin-top:5px;flex-shrink:0}
  .ex-act{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}
  .ex-act button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:12px 6px;cursor:pointer;font-size:12px;color:var(--navy);display:flex;flex-direction:column;align-items:center;gap:6px}
  .ex-act button span{font-size:20px}.ex-act button:hover{background:#F4F8FC}
  .ex-row{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:14px}.ex-row:last-child{border:0}`;
  document.head.appendChild(st);
}
