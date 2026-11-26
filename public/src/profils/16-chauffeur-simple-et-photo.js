/* =====================================================================
   CHAUFFEUR : même design que les responsables, sans graphiques.
   - Accueil simple : bandeau (photo, nom, date, état), prochaine action,
     gros boutons, « Ma journée » en 4 étapes, fiche, rubriques,
     notifications, bandeau de valeurs.
   - Fiche de bord guidée : l'étape suivante est toujours indiquée,
     y compris dans chaque formulaire.
   - Fiche classée : sommaire avec le nombre de saisies par rubrique.
   PHOTO DE PROFIL : demandée à la première ouverture, visible chez la
   personne et chez son responsable, à côté de son nom.
   ===================================================================== */

/* ---------- Étapes de la journée du chauffeur ---------- */
function drvDayState(me, sh) {
  const v = me && me.vehicle, act = me && me.activeTrip, tid = act ? esc(act.id) : '';
  const trips = (sh && sh.trips) || [], fuel = (sh && sh.fuel) || [], exps = (sh && sh.expenses) || [];
  const missing = fuel.filter((f) => f.source === 'STATION' && f.cost > 0 && !f.receiptUrl).length + exps.filter((e) => !e.receiptUrl).length;
  const started = !!act || trips.length > 0, arrived = trips.length > 0 && !act, sent = !!sh && sh.status === 'SENT';
  const S = [
    { t: 'Départ', d: 'Kilométrage et état du véhicule', done: started, go: v && !v.immobilized && !act ? "drvStartForm('')" : '' },
    { t: 'Pleins et dépenses', d: missing ? missing + ' reçu(s) manquant(s) : ajoutez la photo dans la fiche' : (fuel.length + exps.length) + ' saisie(s) — photo du reçu', done: started && !missing && (fuel.length + exps.length) > 0, opt: !missing, warn: !!missing, go: missing ? "drvTab('sheet')" : v ? `drvFuelForm('${tid}')` : '' },
    { t: v && v.type === 'TRUCK' ? 'Arrêt de la journée' : 'Arrivée', d: 'Kilométrage d\'arrivée', done: arrived, go: act ? `drvArriveForm('${tid}')` : '' },
    { t: 'Envoyer ma fiche', d: sent ? 'Fiche transmise à la hiérarchie' : 'Relire puis envoyer', done: sent, go: "drvTab('sheet')" },
  ];
  // étape en cours : l'étape 2 (pleins, dépenses) ne bloque que s'il manque un reçu
  const cur = !started ? 0 : missing ? 1 : !arrived ? 2 : !sent ? 3 : 4;
  return { S, cur };
}
function drvDaySteps(me, sh, title) {
  const { S, cur } = drvDayState(me, sh), n = S[cur];
  return `<div class="drv-card drv-day"><h4>${PROF_IC('compass')} ${esc(title || 'Ma journée')}</h4>
    <ol>${S.map((s, i) => `<li class="${s.done ? 'done' : i === cur ? 'now' : ''}${s.warn ? ' warn' : ''}"><span class="n">${s.done ? PROF_IC('check') : i + 1}</span><div><b>${esc(s.t)}${s.opt && !s.done && i !== cur ? ' <small>(si besoin)</small>' : ''}</b><small>${esc(s.d)}</small></div></li>`).join('')}</ol>
    ${n ? `<button class="drv-btn gold" ${n.go ? `onclick="${n.go}"` : 'disabled'}>${PROF_IC('chevron-right')} Étape suivante : ${esc(n.t)}</button>` : `<div class="drv-ok">${PROF_IC('check-circle')} Journée terminée : votre fiche est envoyée.</div>`}</div>`;
}

/* ---------- Accueil chauffeur : même design, sans graphique ---------- */
{
  const _h = drvHomeHtml;
  drvHomeHtml = function (me) {
    let h = _h.apply(this, arguments);
    const v = me.vehicle, act = me.activeTrip;
    const day = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const etat = act ? 'En mission' : (v && v.immobilized ? 'Véhicule immobilisé' : 'En service');
    const hero = `<div class="db-hero drv-hero"><div class="db-hero-txt"><div class="drv-hero-id"><span class="drv-av" data-avatar="58">${avatarHtml(58)}</span><div><h2>${esc(me.driver.name || '')}</h2><p>Chauffeur${v ? ' — ' + esc(v.number || v.plate) : ''}</p></div></div></div>
      <div class="db-hero-date">${PROF_IC('clipboard')} <b>${esc(day.charAt(0).toUpperCase() + day.slice(1))}</b><span class="db-on${v && v.immobilized ? ' off' : ''}">${PROF_IC(v && v.immobilized ? 'alert' : 'check-circle')} ${esc(etat)}</span></div></div>`;
    h = h.replace(/<div class="drv-hello">[\s\S]*?<\/h2><div>[^<]*<\/div><\/div>/, hero);
    // « Ma journée » juste avant la fiche du jour
    h = h.replace('<div class="drv-card" id="drv-fiche">', `<div id="drv-steps">${drvDaySteps(me, DRV.lastSheet && DRV.lastSheet.date === new Date().toISOString().slice(0, 10) ? DRV.lastSheet : null)}</div><div class="drv-card" id="drv-fiche">`);
    // notifications simples + valeurs, avant la ligne de synchronisation
    const N = [];
    if (!v) N.push(['bad', 'Aucun véhicule affecté', 'Contactez votre responsable logistique.']);
    if (v && v.immobilized) N.push(['bad', 'Véhicule immobilisé', v.downtimeReason || 'Attendez la remise en service.']);
    const L = me.driver && me.driver.license;
    if (L && L.expiry) { const dl = Math.ceil((new Date(L.expiry) - Date.now()) / 864e5); if (dl <= 30) N.push([dl < 0 ? 'bad' : 'warn', dl < 0 ? 'Permis expiré' : 'Permis à renouveler', dl < 0 ? 'Expiré depuis ' + -dl + ' jour(s).' : 'Expire dans ' + dl + ' jour(s).']); }
    const pend = drvQueue().filter((o) => !o.rejected).length;
    if (pend) N.push(['warn', pend + ' saisie(s) en attente', 'Elles partiront dès que le réseau revient.']);
    const notes = `<div class="drv-card"><h4>${PROF_IC('bell')} Notifications</h4>${N.length ? N.map((n) => `<div class="db-note ${n[0]}">${PROF_IC(n[0] === 'bad' ? 'alert' : 'info')}<div><b>${esc(n[1])}</b><small>${esc(n[2])}</small></div></div>`).join('') : `<div class="db-note ok">${PROF_IC('check-circle')}<div><b>Aucune alerte</b><small>Tout est à jour.</small></div></div>`}</div>`;
    const vals = `<div class="db-values"><span>${PROF_IC('shield')} Sécurité avant tout</span><span>${PROF_IC('users')} Ensemble plus loin</span><span>${PROF_IC('truck')} Transport responsable</span></div>`;
    return h.replace('<div class="drv-sync">', notes + vals + '<div class="drv-sync">');
  };
  const _f = drvHomeFill;
  drvHomeFill = async function () {
    const r = await _f.apply(this, arguments);
    const box = drvEl('drv-steps'), me = drvView(); if (box && me && DRV.tab === 'missions') box.innerHTML = drvDaySteps(me, DRV.lastSheet);
    return r;
  };
}

/* ---------- Fiche de bord : étapes + sommaire classé ---------- */
{
  const _s = drvSheetHtml;
  drvSheetHtml = function (sh, offline) {
    let h = _s.apply(this, arguments);
    const me = drvView(), M = sh.maintenance || [];
    const sec = [['sh-mis', 'Missions et destinations', 'map-pin', (sh.trips || []).length], ['sh-fuel', 'Carburant', 'fuel', (sh.fuel || []).length], ['sh-ent', 'Entretien', 'wrench', M.filter((m) => m.nature !== 'ANOMALIE').length],
      ['sh-pan', 'Pannes et anomalies', 'alert', M.filter((m) => m.nature === 'ANOMALIE').length + (sh.breakdowns || []).length], ['sh-dep', 'Dépenses diverses', 'receipt', (sh.expenses || []).length]];
    sec.forEach(([id, t, ic, n]) => { h = h.replace(`<div class="drv-card"><h4>${t}</h4>`, `<div class="drv-card" id="${id}"><h4>${PROF_IC(ic)} ${t} <span class="drv-cnt">${n}</span></h4>`); });
    h = h.replace(/<div class="drv-card"><h4>Pièces jointes \((\d+)\)<\/h4>/, (m, n) => `<div class="drv-card" id="sh-pj"><h4>${PROF_IC('camera')} Pièces jointes <span class="drv-cnt">${n}</span></h4>`);
    const nav = `<div class="drv-card drv-sum"><h4>${PROF_IC('archive')} Sommaire de ma fiche</h4><div class="drv-sum-g">${sec.concat([['sh-pj', 'Photos des reçus', 'camera', null]]).map(([id, t, ic, n]) => `<button onclick="var e=document.getElementById('${id}');if(e)e.scrollIntoView({behavior:'smooth',block:'start'})">${PROF_IC(ic)}<span>${t}</span>${n != null ? `<b>${n}</b>` : ''}</button>`).join('')}</div></div>`;
    const steps = me && sh.date === new Date().toISOString().slice(0, 10) ? drvDaySteps(me, sh, 'Où en est ma journée') : '';
    return steps + h.replace(/(<\/div>)(\s*<div class="drv-card" id="sh-mis">)/, '$1' + nav + '$2');
  };
}

/* ---------- Dans chaque formulaire : ce qui vient ensuite ---------- */
function drvNextHint(title) {
  const t = String(title || '');
  if (/Départ/.test(t)) return 'Ensuite : pendant la mission, enregistrez chaque plein et chaque dépense avec la photo du reçu. À la fin, appuyez sur « Arrivée ».';
  if (/Arrivée|retour/.test(t)) return 'Ensuite : ouvrez « Ma fiche », relisez votre journée et envoyez-la.';
  if (/Plein|dépense/i.test(t)) return 'Ensuite : continuez votre mission. À la fin, appuyez sur « Arrivée ».';
  if (/Maintenance|vidange/.test(t)) return 'Ensuite : terminez la mission, puis envoyez votre fiche.';
  if (/panne/i.test(t)) return 'Ensuite : l\'atelier est prévenu. Mettez-vous en sécurité et attendez ses instructions.';
  if (/incident/i.test(t)) return 'Ensuite : votre responsable est prévenu. Restez en sécurité.';
  if (/Pause/.test(t)) return 'Ensuite : reprenez la route, puis appuyez sur « Arrivée » à la fin.';
  return '';
}
{
  const _ds = drvSheet;
  drvSheet = function (title, html, onSubmit, submitLabel) {
    const hint = drvNextHint(title);
    const wrapped = async function () {
      const r = await onSubmit.apply(this, arguments);
      if (hint) setTimeout(() => drvDoneToast(hint), 50);
      return r;
    };
    return _ds.call(this, title, (hint ? `<div class="drv-hint">${PROF_IC('compass')}<span>${esc(hint)}</span></div>` : '') + html, wrapped, submitLabel);
  };
}
function drvDoneToast(hint) {
  const o = document.getElementById('drv-done'); if (o) o.remove();
  const d = document.createElement('div'); d.id = 'drv-done';
  d.innerHTML = `${PROF_IC('check-circle')}<div><b>Enregistré</b><span>${esc(hint)}</span></div><button onclick="this.parentNode.remove()" aria-label="Fermer">${PROF_IC('x')}</button>`;
  document.body.appendChild(d); setTimeout(() => { if (d.parentNode) d.remove(); }, 9000);
}

/* ---------- Photo de profil ---------- */
function personAv(first, last, photo, size) {
  size = size || 32; const ini = (((first || '?')[0] || '?') + ((last || '?')[0] || '?')).toUpperCase();
  return photo ? `<img class="p-av" src="${esc(photo)}" alt="" style="width:${size}px;height:${size}px">` : `<span class="p-av ini" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(ini)}</span>`;
}
function photoAskShow() {
  const u = state.user; if (!u || u.photoUrl || document.getElementById('photo-ask')) return;
  let later = 0; try { later = +localStorage.getItem('syl_photo_later_' + u.id) || 0; } catch (e) {}
  if (later && Date.now() - later < 3 * 864e5) return; // redemander après 3 jours
  const d = document.createElement('div'); d.id = 'photo-ask';
  d.innerHTML = `<div class="photo-ask-box"><span class="photo-ask-av">${PROF_IC('camera')}</span><h3>Ajoutez votre photo</h3>
    <p>Choisissez une photo dans votre galerie. Elle s'affichera sur votre téléphone et chez votre responsable, à côté de votre nom.</p>
    <button class="btn gold" onclick="document.getElementById('photo-ask').remove();openPhotoEditor()">${PROF_IC('image')} Choisir ma photo</button>
    <button class="btn ghost" onclick="try{localStorage.setItem('syl_photo_later_${esc(u.id)}',Date.now())}catch(e){};document.getElementById('photo-ask').remove()">Plus tard</button></div>`;
  document.body.appendChild(d);
}
{
  const _lp = loadMyPhoto;
  loadMyPhoto = async function () {
    const r = await _lp.apply(this, arguments);
    if (state.user && !state.demo && state.accessToken) setTimeout(photoAskShow, 1200);
    return r;
  };
}
