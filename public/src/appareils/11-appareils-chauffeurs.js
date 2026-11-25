/* ============ GESTION DES APPAREILS CHAUFFEURS (gestionnaire de flotte) ============ */
async function renderDriverDevices() {
  const list = await api('/driver-admin/overview?siteId=' + state.siteId);
  window._drvOv = list;
  const badge = (d) => ({ ACTIVE: '<span class="badge ok">Actif</span>', PENDING: (d.expiresAt && new Date(d.expiresAt) < new Date() ? '<span class="badge bad">QR expiré</span>' : '<span class="badge warn">QR en attente</span>'), BLOCKED: '<span class="badge bad">Bloqué</span>' }[d.status] || esc(d.status));
  const rows = list.map((d) => {
    const dev = d.devices.find((x) => x.status === 'ACTIVE') || d.devices.find((x) => x.status === 'BLOCKED') || d.devices.find((x) => x.status === 'PENDING');
    return `<tr><td><b>${esc(d.name)}</b></td><td>${d.linked ? esc(d.userEmail) : '<span class="badge bad">Non lié</span>'}</td>
      <td>${dev ? badge(dev) + (dev.model ? ' ' + esc(dev.model) : '') : '—'}${dev && dev.lastSeenAt ? `<div style="font-size:12px;color:var(--muted)">vu ${new Date(dev.lastSeenAt).toLocaleString('fr-FR')}</div>` : ''}${dev && dev.blockedReason ? `<div style="font-size:12px;color:var(--danger)">${esc(dev.blockedReason)}</div>` : ''}</td>
      <td style="white-space:nowrap">
        ${d.linked ? '' : `<button class="btn small" onclick="drvLinkForm('${esc(d.id)}')">Lier un compte</button> `}
        ${d.linked ? `<button class="btn small gold" onclick="drvProvision('${esc(d.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-key"/></svg> Code / QR</button> ` : ''}
        ${dev && dev.status === 'ACTIVE' ? `<button class="btn small" onclick="drvTransfer('${esc(dev.id)}','${esc(d.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg> Transférer</button> <button class="btn small" onclick="drvBlock('${esc(dev.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-ban"/></svg> Bloquer</button> ` : ''}
        ${dev && dev.status === 'BLOCKED' ? `<button class="btn small" onclick="drvUnblock('${esc(dev.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg> Débloquer</button> ` : ''}
        ${dev && dev.status === 'PENDING' ? `<button class="btn small" onclick="drvCancelQr('${esc(dev.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg> Annuler le QR</button> ` : ''}
        <button class="btn small" onclick="drvHistory('driver','${esc(d.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Historique</button></td></tr>`;
  }).join('') || '<tr><td colspan="4" class="empty">Aucun chauffeur.</td></tr>';
  const allDev = list.flatMap((d) => d.devices), nowT = Date.now();
  const kp = [['Appareils actifs', allDev.filter((x) => x.status === 'ACTIVE').length], ['QR en attente', allDev.filter((x) => x.status === 'PENDING' && !(x.expiresAt && new Date(x.expiresAt) < nowT)).length], ['QR expirés', allDev.filter((x) => x.status === 'PENDING' && x.expiresAt && new Date(x.expiresAt) < nowT).length], ['Bloqués', allDev.filter((x) => x.status === 'BLOCKED').length], ['Sans compte lié', list.filter((d) => !d.linked).length]];
  const kpiRow = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:12px">${kp.map((k) => `<div class="panel" style="margin:0;padding:10px 12px"><div style="font-size:22px;font-weight:800;color:var(--navy)">${k[1]}</div><div class="desc" style="margin:0">${k[0]}</div></div>`).join('')}</div>`;
  root().innerHTML = `${kpiRow}<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-phone"/></svg> Application chauffeur — appareils autorisés</h3>
    <div class="desc">Un chauffeur = un compte personnel = un seul appareil actif. Générez un code (QR + 6 chiffres, valable 24 h) ; l'ancien appareil est automatiquement révoqué à l'activation du nouveau.</div>
    <button class="btn gold" onclick="drvPlanTrip()">Planifier une mission</button> <button class="btn" onclick="drvCreateAccount()"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Créer un compte chauffeur</button> <button class="btn gold" onclick="drvInvitePanel()"><svg class="ic" aria-hidden="true"><use href="#i-phone"/></svg> Envoyer l'application aux chauffeurs</button>
    <div style="overflow:auto;margin-top:12px"><table><tr><th>Chauffeur</th><th>Compte</th><th>Appareil</th><th>Actions</th></tr>${rows}</table></div></div>
    <div id="drv-hist"></div>`;
}
function drvInvitePanel() {
  const list = window._drvOv || [];
  const act = (a) => (a === 'TRUCK' ? '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Camion' : a === 'SERVICE_VEHICLE' ? '<svg class="ic" aria-hidden="true"><use href="#i-car"/></svg> Véhicule de service' : '<span class="badge warn">Activité à préciser</span>');
  const link = location.origin + location.pathname.replace(/index\.html$/, '');
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px;';
  ov.innerHTML = `<div class="panel" style="max-width:640px;width:100%;margin:20px auto;"><h3><svg class="ic" aria-hidden="true"><use href="#i-phone"/></svg> Envoyer l'application aux chauffeurs</h3>
    <div class="desc">Même lien pour tous : <b>${esc(link)}</b>. Pour chaque chauffeur, le message WhatsApp contient le lien, la marche à suivre, son mot de passe provisoire (premier envoi) et son code d'activation personnel.</div>
    ${[['TRUCK', '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Chauffeurs de camions'], ['SERVICE_VEHICLE', '<svg class="ic" aria-hidden="true"><use href="#i-car"/></svg> Chauffeurs de véhicules de service'], ['', 'Activité à préciser']].map(([k, t]) => { const g = list.filter((d) => (d.activity || '') === k); return g.length ? `<h4 style="margin:14px 0 4px">${t} (${g.length})</h4><table>${g.map((d) => `<tr><td><b>${esc(d.name)}</b><div style="font-size:12px">${esc(d.phone || 'pas de numéro')}</div></td><td>${act(d.activity)}</td>
      <td><button class="btn small gold" ${d.phone ? '' : 'disabled'} onclick="drvInviteSend('${esc(d.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-message"/></svg> WhatsApp</button></td></tr>`).join('')}</table>` : ''; }).join('') || '<div class="empty">Aucun chauffeur.</div>'}
    <div id="inv-msg"></div><button class="btn" style="margin-top:10px" onclick="this.closest('div[style*=fixed]').remove();renderDriverDevices()">Fermer</button></div>`;
  document.body.appendChild(ov);
}
async function drvInviteSend(driverId) {
  const m = document.getElementById('inv-msg');
  try {
    const link = location.origin + location.pathname.replace(/index\.html$/, '');
    const r = await api('/driver-admin/invite', { method: 'POST', body: { driverId, appUrl: link } });
    const num = r.phone.length === 9 ? '224' + r.phone : r.phone;
    window._invMsg = r.message;
    // Lien à toucher (les navigateurs bloquent l'ouverture automatique après un appel réseau) + copie du message
    m.innerHTML = `<div class="msg ok">Message prêt pour ${esc(r.driver)} (${esc(num)})${r.newAccount ? ' — compte créé' : ''}.</div>
      <a class="btn gold" style="display:inline-block;margin:6px 6px 6px 0;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${esc(num)}?text=${encodeURIComponent(r.message)}">Ouvrir WhatsApp</a>
      <button class="btn" onclick="navigator.clipboard.writeText(window._invMsg).then(()=>alert('Message copié : collez-le dans WhatsApp.'))">Copier le message</button>
      <pre class="mono" style="white-space:pre-wrap;margin-top:8px">${esc(r.message)}</pre>
      <div class="desc">WhatsApp s'ouvre avec le message déjà écrit : appuyez sur « Envoyer ». Le système n'envoie pas le message tout seul.</div>`;
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function drvCreateAccount() {
  const drivers = (await api('/drivers?siteId=' + state.siteId)).filter((d) => !(window._drvOv || []).some((o) => o.id === d.id && o.linked));
  if (!drivers.length) return alert('Tous les chauffeurs ont déjà un compte (ou aucune fiche chauffeur : créez-la dans Chauffeurs).');
  openEditor('Créer un compte chauffeur', [
    { key: 'driverId', label: 'Fiche chauffeur', options: drivers.map((d) => [d.id, d.firstName + ' ' + d.lastName]) },
    { key: 'email', label: 'E-mail (facultatif — sinon le chauffeur se connecte avec son numéro de téléphone)' },
    { key: 'password', label: 'Mot de passe provisoire (8 caractères minimum, avec une lettre et un chiffre)' },
  ], async (d) => {
    const drv = drivers.find((x) => x.id === d.driverId);
    const digits = (drv.phone || '').replace(/\D/g, '');
    if (!d.email && digits.length < 8) throw new Error("Sans e-mail, la fiche du chauffeur doit avoir un numéro de téléphone (menu Chauffeurs ).");
    if (!d.password) throw new Error('Mot de passe obligatoire.');
    d.email = d.email || (digits + '@chauffeur.local');
    await api('/users', { method: 'POST', body: { firstName: drv.firstName, lastName: drv.lastName, email: d.email, password: d.password, phone: drv.phone || undefined, role: 'CHAUFFEUR', siteId: state.siteId } });
    await api('/driver-admin/link', { method: 'POST', body: { driverId: d.driverId, email: d.email } });
    alert('Compte créé et lié. Le chauffeur se connecte avec ' + (d.email.endsWith('@chauffeur.local') ? 'son numéro de téléphone' : d.email) + '. Cliquez sur « Code / QR » pour activer son téléphone.');
    renderDriverDevices();
  });
}
function drvLinkForm(driverId) {
  openEditor('Lier un compte utilisateur', [{ key: 'email', label: 'E-mail du compte (rôle Chauffeur, créé dans Utilisateurs)' }], async (d) => {
    await api('/driver-admin/link', { method: 'POST', body: { driverId, email: d.email } }); renderDriverDevices();
  });
}
async function drvProvision(driverId) {
  try {
    const r = await api('/driver-admin/provision', { method: 'POST', body: { driverId } });
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
    ov.innerHTML = `<div class="panel" style="max-width:360px;text-align:center"><h3>Code d'activation — ${esc(r.driver)}</h3>
      <img src="${r.qrImage}" alt="QR" style="width:240px;height:240px"><div class="desc">ou saisir ce code :</div>
      <div style="font-size:20px;font-weight:800;font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums;color:var(--navy)">${esc(r.otp)}</div>
      <div class="desc" style="margin-top:8px">Valable jusqu'au ${new Date(r.expiresAt).toLocaleString('fr-FR')}. Le chauffeur se connecte avec son compte puis active l'appareil.</div>
      <button class="btn gold" onclick="this.closest('div[style*=fixed]').remove();renderDriverDevices()">Fermer</button></div>`;
    document.body.appendChild(ov);
  } catch (e) { alert(e.message); }
}
async function drvCancelQr(id) {
  if (!confirm("Annuler ce QR d'activation ? Il ne pourra plus être utilisé ; vous pourrez en générer un nouveau.")) return;
  try { await api('/driver-admin/devices/' + id + '/revoke', { method: 'POST', body: { reason: 'QR annulé par le gestionnaire' } }); renderDriverDevices(); } catch (e) { alert(e.message); }
}
function drvTransfer(devId, fromId) {
  const others = (window._drvOv || []).filter((x) => x.id !== fromId && x.linked);
  if (!others.length) return alert("Aucun autre chauffeur n'a de compte lié. Créez d'abord son compte.");
  openEditor('Transférer le téléphone à un remplaçant', [
    { key: 'driverId', label: 'Chauffeur remplaçant', options: others.map((x) => [x.id, x.name]) },
    { key: 'reason', label: 'Motif', options: [['MALADIE', 'Maladie'], ['CONGE', 'Congé'], ['AUTRE', 'Autre']] },
  ], async (d) => { await api('/driver-admin/devices/' + devId + '/transfer', { method: 'POST', body: d }); alert("Transfert effectué : le remplaçant se connecte sur ce téléphone avec son numéro et son mot de passe. Le véhicule et les missions planifiées lui sont affectés."); renderDriverDevices(); });
}
function drvBlock(id) {
  openEditor('Bloquer l\'appareil', [{ key: 'reason', label: 'Motif (obligatoire)' }], async (d) => {
    await api('/driver-admin/devices/' + id + '/block', { method: 'POST', body: { reason: d.reason || '' } }); renderDriverDevices();
  });
}
async function drvUnblock(id) { try { await api('/driver-admin/devices/' + id + '/unblock', { method: 'POST' }); renderDriverDevices(); } catch (e) { alert(e.message); } }
async function drvPlanTrip() {
  const [drivers, vehicles, custs] = await Promise.all([api('/drivers?siteId=' + state.siteId), api('/vehicles?siteId=' + state.siteId), api('/customers')]);
  const usable = vehicles.filter((v) => !['IMMOBILIZED', 'MAINTENANCE', 'OUT_OF_SERVICE'].includes(v.status));
  openEditor('Planifier une mission', [
    { key: 'driverId', label: 'Chauffeur', options: drivers.map((d) => [d.id, d.firstName + ' ' + d.lastName]) },
    { key: 'vehicleId', label: 'Véhicule disponible', options: usable.map((v) => [v.id, v.internalNumber + ' — ' + v.registrationNumber]) },
    { key: 'customerId', label: 'Client (pour la facturation)', options: [['', '— À préciser plus tard —'], ...custs.map((c) => [c.id, c.name])] },
    { key: 'destination', label: 'Destination' }, { key: 'purpose', label: 'Instructions' }, { key: 'passengerName', label: 'Contact sur place' },
    { key: 'startTime', label: 'Départ prévu', type: 'datetime-local' }, { key: 'scheduledArrival', label: 'Arrivée prévue', type: 'datetime-local' },
  ], async (d) => {
    if (!d.startTime) throw new Error('Indiquez le départ prévu.');
    const iso = (s) => new Date(s).toISOString();
    await api('/trips', { method: 'POST', body: { planned: true, siteId: state.siteId, driverId: d.driverId, vehicleId: d.vehicleId, destination: d.destination, customerId: d.customerId || undefined, purpose: d.purpose, passengerName: d.passengerName, tripDate: iso(d.startTime), startTime: iso(d.startTime), scheduledArrival: d.scheduledArrival ? iso(d.scheduledArrival) : undefined } });
    alert('Mission planifiée : elle apparaît sur le téléphone du chauffeur.');
  });
}
async function drvHistory(kind, id) {
  const h = await api('/driver-admin/history/' + kind + '/' + id);
  const s = h.summary;
  drvEl('drv-hist').innerHTML = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Historique — ${esc(h.driver || h.vehicle)}</h3>
    <div class="desc">${s.missions} missions · ${fmt(s.km)} km · ${s.liters} L (${fmt(s.cost)} GNF) · conso ${s.consumption ?? '—'} L/100 km${s.gapPct !== null ? ` (écart ${s.gapPct > 0 ? '+' : ''}${s.gapPct} % vs référence)` : ''} · ${s.breakdowns} pannes · ${s.incidents} incidents · ${s.late} retards</div>
    <table><tr><th>Date</th><th>Mission</th><th>Statut</th><th>Km</th><th>Retard</th></tr>${h.trips.slice(0, 30).map((t) => `<tr><td>${drvDt(t.startTime)}</td><td>${esc(t.destination || '—')} <span style="color:var(--muted)">${esc(t.who)}</span></td><td>${esc(t.status)}${t.signed ? ' (signé)' : ''}</td><td>${t.distance ?? '—'}</td><td>${esc(t.delayReason || '')}</td></tr>`).join('')}</table></div>`;
  drvEl('drv-hist').scrollIntoView({ behavior: 'smooth' });
}

