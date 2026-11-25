/* ============ PERSONNALISATION (nom, logo, couleur de l'entreprise) ============ */
const BRAND = (() => { try { return JSON.parse(localStorage.getItem('syllo_brand') || 'null') || { name: 'SYL LOGISTIQUE' }; } catch (e) { return { name: 'SYL LOGISTIQUE' }; } })();
const brandSrc = (u) => (u && u.startsWith('/') ? (state.apiUrl || localStorage.getItem('syllo_api_url') || '').replace(/\/$/, '') + u : (/^https?:\/\//i.test(u || '') ? u : ''));
function brandApply() {
  const n = BRAND.name || 'SYL LOGISTIQUE';
  document.title = n + ' — Gestion Logistique & Flotte';
  if (BRAND.brandColor) document.documentElement.style.setProperty('--navy', BRAND.brandColor);
  const logo = BRAND.logoUrl ? `<img src="${esc(brandSrc(BRAND.logoUrl))}" alt="" style="height:44px;max-width:120px;object-fit:contain;vertical-align:middle">` : '';
  const lb = document.querySelector('.login-brand .brand'); if (lb) lb.textContent = n;
  const isDefault = !BRAND.logoUrl && (!BRAND.name || ['SYLLOGISTIQUE', 'SYL LOGISTIQUE'].includes(BRAND.name));
  if (isDefault) {
    const ml = document.querySelector('.lg-mobile-logo'); if (ml) ml.innerHTML = '<img src="logo-syl.png" alt="SYL LOGISTIQUE" style="height:84px;max-width:100%;display:block;margin:0 auto">';
    const sl = document.querySelector('.lg-logo'); if (sl) sl.innerHTML = '<span style="display:inline-block;background:#fff;border-radius:8px;padding:8px 14px"><img src="logo-syl.png" alt="SYL LOGISTIQUE" style="height:84px;display:block"></span>';
  }
  const lt = document.querySelector('.login-truck'); if (lt) lt.innerHTML = logo || (isDefault ? '<span style="display:inline-block;background:#fff;border-radius:8px;padding:8px 14px"><img src="logo-syl.png" alt="SYL LOGISTIQUE" style="height:96px;max-width:100%;display:block"></span>' : '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg>');
  const custom = !!(BRAND.logoUrl || (BRAND.name && !['SYLLOGISTIQUE','SYL LOGISTIQUE'].includes(BRAND.name)));
  const sb = document.querySelector('.brand-block .brand'); if (sb) sb.textContent = custom ? n : 'SYL LOGISTIQUE';
  if (custom) { const lg = document.querySelector('.brand-block svg'); if (lg && logo) lg.outerHTML = logo.replace('height:44px', 'height:38px'); const ll = document.querySelector('.lg-logo b'); if (ll) ll.textContent = n; }
  const ds = document.getElementById('drv-sub'); if (ds && !ds.dataset.k) ds.textContent = isDefault ? 'SYL DRIVER' : n;
  if (!custom) { const lg = document.querySelector('.brand-block svg'); if (lg) lg.outerHTML = '<span style="background:#fff;border-radius:8px;padding:4px 8px;display:inline-flex;flex:none"><img src="logo-syl.png" alt="SYL LOGISTIQUE" style="height:34px;display:block"></span>'; }
  spaceApply();
}

// Espace affiché à côté du logo (le logo ne change jamais, seule la mention varie)
function spaceName() {
  const r = state.user && state.user.role, v = state.view || '';
  if (r === 'CHAUFFEUR') return 'SYL DRIVER';
  if (r === 'DIRECTEUR_GENERAL' || v === 'dashboard' || /^dash-/.test(v)) return 'SYL DASHBOARD';
  if (r === 'GESTIONNAIRE_FLOTTE' || ['vehicles', 'trucks', 'service-vehicles', 'fleet-trucks', 'fleet-service', 'drivers', 'fuel', 'maintenance', 'atelier', 'driver-devices', 'driver-sheets', 'driver-board', 'driver-missions'].includes(v)) return 'SYL FLEET';
  return 'SYL LOGISTIQUE';
}
/* ---- Identité visuelle par espace (logos par département) : s'affiche seulement pour les rôles qui ont un espace dédié ---- */
const SPACES = {
  chauffeurs: { n: 'Espace Chauffeurs', s: 'Mes missions, en toute sécurité' },
  logistique: { n: 'Responsable Logistique', s: 'Planifier • Organiser • Suivre' },
  operations: { n: 'Responsable des Opérations', s: 'Optimiser • Coordonner • Performer' },
  hse: { n: 'Responsable HSE', s: 'Prévenir • Protéger • Agir' },
  stock: { n: 'Gestionnaire de Stock', s: 'Gérer • Contrôler • Optimiser' },
  atelier: { n: 'Mécanicien', s: 'Diagnostiquer • Réparer • Remettre en service' },
  dg: { n: 'Direction Générale', s: 'Diriger • Décider • Développer' },
  comptabilite: { n: 'Espace Comptabilité', s: 'Enregistrer • Contrôler • Rapporter' },
};
const ROLE_SPACE = { CHAUFFEUR: 'chauffeurs', ADMIN_LOGISTIQUE: 'logistique', GESTIONNAIRE_FLOTTE: 'logistique', RESPONSABLE_OPERATIONS: 'operations', GESTIONNAIRE_HSE: 'hse', AGENT_HSE: 'hse', MAGASINIER: 'stock', MECANICIEN: 'atelier', DIRECTEUR_GENERAL: 'dg', COMPTABLE: 'comptabilite' };
// Les six identités visuelles (Chauffeur, DG, Responsable logistique, Responsable des opérations, Stock, Mécanicien) s'affichent selon le rôle enregistré ; elles cèdent la place au logo de l'entreprise cliente si celle-ci en a défini un. Pour ajouter un département : ajouter son entrée dans SPACES, ROLE_SPACE, SPACE_VISIBLE et ICON_SPACES, ses images dans logos/ et icons/ et son manifest-<espace>.json.
const SPACE_VISIBLE = { chauffeurs: true, dg: true, logistique: true, operations: true, stock: true, atelier: true };
// Icône d'installation (écran d'accueil du téléphone) = logo du département, choisi avant même la connexion.
const ICON_ROLE = Object.assign({}, ROLE_SPACE, { RESPONSABLE_COMMERCIAL: 'commercial', CAISSIER: 'caisse', MECANICIEN: 'atelier', POINTEUR: 'pointage' });
const ICON_SPACES = ['chauffeurs', 'logistique', 'operations', 'hse', 'stock', 'dg', 'comptabilite', 'commercial', 'caisse', 'atelier', 'pointage', 'achats'];
function applySpaceIcon(k) {
  try {
    if (!k || ICON_SPACES.indexOf(k) < 0) return;
    const set = (sel, attr, v) => { const el = document.querySelector(sel); if (el) el.setAttribute(attr, v); };
    set('link[rel="manifest"]', 'href', 'manifest-' + k + '.json');
    set('link[rel="apple-touch-icon"]', 'href', 'icons/' + k + '-180.png');
    document.querySelectorAll('link[rel="icon"]').forEach((el) => el.setAttribute('href', 'icons/' + k + '-192.png'));
    localStorage.setItem('syllo_icon_space', k);
  } catch (e) {}
}
(function () {
  try {
    const q = new URLSearchParams(location.search).get('espace');
    const k = q || localStorage.getItem('syllo_icon_space');
    applySpaceIcon(k);
  } catch (e) {}
})();
function mySpace() { const k = state.user && ROLE_SPACE[state.user.role]; return k && SPACE_VISIBLE[k] ? Object.assign({ k }, SPACES[k]) : null; }
function spaceBrandOn() { return !BRAND.logoUrl && (!BRAND.name || ['SYLLOGISTIQUE', 'SYL LOGISTIQUE'].includes(BRAND.name)); }
function spaceHome() {
  const sp = spaceBrandOn() && mySpace(); if (!sp) return '';
  return `<div class="home-space"><img src="logos/${sp.k}-sm.webp" alt="${esc(sp.n)}"><div><b style="color:var(--navy);font-size:15px">${esc(sp.n)}</b><div class="desc" style="margin:2px 0 0">${esc(sp.s)}</div></div></div>`;
}
function spaceLoginApply() {
  let k = null; try { k = (state.user && ROLE_SPACE[state.user.role]) || localStorage.getItem('syllo_last_space') || localStorage.getItem('syllo_icon_space'); } catch (e) {}
  if (k && !SPACE_VISIBLE[k]) k = null;
  const sp = spaceBrandOn() && k && SPACES[k]; const on = !!sp;
  const lg = document.querySelector('.lg-logo'); const ml = document.querySelector('.lg-mobile-logo');
  const put = (host, cls, after) => { if (!host) return; let el = host.parentNode.querySelector('.' + cls); if (!on) { if (el) el.remove(); return; } if (!el) { el = document.createElement('div'); el.className = cls + (cls === 'lg-mobile-space' ? ' on' : ''); host.insertAdjacentElement('afterend', el); } el.innerHTML = `<img src="logos/${k}-sm.webp" alt=""><span>${esc(sp.n)}</span>`; };
  put(lg, 'lg-space'); put(ml, 'lg-mobile-space');
}
function spaceApply() {
  try {
    const sp = spaceBrandOn() && mySpace();
    if (state.user && !state.demo) { if (sp) localStorage.setItem('syllo_last_space', sp.k); applySpaceIcon(ICON_ROLE[state.user.role]); }
    const ico = document.getElementById('space-ico'); if (ico) { if (sp) { ico.src = 'logos/' + sp.k + '-sm.webp'; ico.alt = sp.n; ico.title = sp.n; ico.style.display = 'block'; } else ico.style.display = 'none'; }
    const card = document.getElementById('space-card'); if (card) { card.classList.toggle('on', !!sp); if (sp) { document.getElementById('space-card-img').src = 'logos/' + sp.k + '-sm.webp'; document.getElementById('space-card-name').textContent = sp.n; document.getElementById('space-card-slogan').textContent = sp.s; } }
    const dv = document.getElementById('drv-space'); if (dv) { if (sp && state.user && state.user.role === 'CHAUFFEUR') { dv.src = 'logos/chauffeurs-sm.webp'; dv.alt = sp.n; dv.style.display = 'block'; } else dv.style.display = 'none'; }
    spaceLoginApply();
  } catch (e) {}
  spaceApplyLabel();
}
function spaceApplyLabel() {
  const isDef = !BRAND.logoUrl && (!BRAND.name || ['SYLLOGISTIQUE', 'SYL LOGISTIQUE'].includes(BRAND.name));
  const src = BRAND.logoUrl ? brandSrc(BRAND.logoUrl) : 'logo-syl.png';
  ['top-logo', 'drv-logo'].forEach((id) => { const el = document.getElementById(id); if (el && el.getAttribute('src') !== src) el.setAttribute('src', src); });
  const el = document.getElementById('space-label');
  if (el) { const nme = spaceName(); el.textContent = nme; el.style.display = isDef && nme !== 'SYL LOGISTIQUE' ? 'inline-block' : 'none'; }
}
async function brandLoad() {
  brandApply();
  try {
    const base = (document.getElementById('api-url') ? document.getElementById('api-url').value : '') || localStorage.getItem('syllo_api_url') || '';
    if (!base) return;
    const r = await fetch(base.replace(/\/$/, '') + '/branding');
    if (!r.ok) return;
    Object.assign(BRAND, await r.json());
    localStorage.setItem('syllo_brand', JSON.stringify(BRAND));
    brandApply();
  } catch (e) {}
}
function brandPanel() {
  if (!['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role)) return;
  const p = document.createElement('div'); p.className = 'panel';
  p.innerHTML = `<h3><svg class="ic" aria-hidden="true"><use href="#i-settings"/></svg> Personnalisation de l'application</h3>
    <div class="desc">Le nom, le logo et la couleur de votre entreprise apparaissent sur l'écran de connexion et dans l'espace de chaque utilisateur.</div>
    <label>Nom de l'entreprise</label><input id="b-name" value="${esc(BRAND.name || '')}">
    <label>Couleur principale</label><input id="b-color" type="color" value="${esc(BRAND.brandColor || '#1F3A5F')}" style="height:44px;padding:2px">
    <label>Logo (PNG ou JPG)</label>${window.LIC_PAID === false ? '<div class="msg">Disponible après confirmation du paiement de votre licence. Vous pouvez aussi demander à SYL LOGISTIQUE de l\'ajouter pour vous.</div>' : '<input id="b-logo" type="file" accept="image/png,image/jpeg">'}
    ${BRAND.logoUrl ? `<div style="margin:8px 0"><img src="${esc(brandSrc(BRAND.logoUrl))}" style="height:56px"> <a href="#" onclick="brandSave(true);return false;">retirer le logo</a></div>` : ''}
    <button class="btn gold" onclick="brandSave()">Enregistrer</button><div id="b-msg"></div>`;
  root().appendChild(p);
}
// Logo réduit puis enregistré dans la base de l'entreprise (durable, ne dépend d'aucun fichier du serveur)
function brandLogoData(file) {
  return new Promise((ok, ko) => {
    const r = new FileReader(); r.onerror = () => ko(new Error('Fichier illisible.'));
    r.onload = () => {
      const im = new Image(); im.onerror = () => ko(new Error('Image non reconnue (PNG ou JPG).'));
      im.onload = () => {
        const k = Math.min(1, 360 / im.width), w = Math.round(im.width * k), h = Math.round(im.height * k);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, w, h);
        let out = cv.toDataURL('image/png');
        if (out.length > 90000) { cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(im, 0, 0, w, h); out = cv.toDataURL('image/jpeg', 0.8); }
        out.length > 90000 ? ko(new Error('Logo trop lourd : choisissez une image plus simple.')) : ok(out);
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
async function brandSave(removeLogo) {
  const m = document.getElementById('b-msg');
  try {
    const body = { name: document.getElementById('b-name').value.trim(), brandColor: document.getElementById('b-color').value };
    const lf = document.getElementById('b-logo'), f = lf && lf.files[0];
    if (removeLogo) body.logoUrl = '';
    else if (f) body.logoUrl = await brandLogoData(f);
    const r = await api('/branding', { method: 'PATCH', body });
    Object.assign(BRAND, r); localStorage.setItem('syllo_brand', JSON.stringify(BRAND)); brandApply();
    m.innerHTML = '<div class="msg ok">Personnalisation enregistrée.</div>';
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ============ PREMIÈRE CONNEXION : le chauffeur crée son propre mot de passe ============ */
function forcePasswordScreen() {
  const old = document.getElementById('force-pw'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = 'force-pw';
  ov.style.cssText = 'position:fixed;inset:0;background:var(--navy);z-index:3000;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto;';
  const known = !!state._pw;
  ov.innerHTML = `<div class="panel" style="max-width:380px;width:100%"><h3><svg class="ic" aria-hidden="true"><use href="#i-key"/></svg> Créez votre mot de passe</h3>
    <div class="desc">Pour votre sécurité, choisissez un mot de passe personnel que vous seul connaissez. Vous l'utiliserez pour vous connecter.</div>
    ${known ? '' : '<label>Mot de passe provisoire reçu</label><input id="fp-old" type="password">'}
    <label>Nouveau mot de passe (8 caractères minimum, avec une lettre et un chiffre)</label><input id="fp-new" type="password" autocomplete="new-password">
    <label>Confirmer le mot de passe</label><input id="fp-new2" type="password" autocomplete="new-password">
    <div id="fp-msg"></div><button class="btn gold" style="width:100%;margin-top:10px" onclick="forcePasswordSave()">Enregistrer et continuer</button></div>`;
  document.body.appendChild(ov);
}
async function forcePasswordSave() {
  const m = document.getElementById('fp-msg'), v = (i) => (document.getElementById(i) ? document.getElementById(i).value : '');
  try {
    if (v('fp-new').length < 8 || !/[A-Za-z]/.test(v('fp-new')) || !/\d/.test(v('fp-new'))) throw new Error('Le mot de passe doit avoir au moins 8 caractères, avec une lettre et un chiffre.');
    if (v('fp-new') !== v('fp-new2')) throw new Error('La confirmation ne correspond pas.');
    if (v('fp-new') === (state._pw || v('fp-old'))) throw new Error('Choisissez un mot de passe différent du provisoire.');
    await api('/auth/change-password', { method: 'POST', body: { currentPassword: state._pw || v('fp-old'), newPassword: v('fp-new') } });
    state._pw = null; state.user.mustChangePassword = false;
    localStorage.setItem('syllo_user', JSON.stringify(state.user));
    document.getElementById('force-pw').remove();
    enterApp();
    try { bellToast('Vous êtes le seul à détenir votre mot de passe.'); } catch (e) {}
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ---------- Maintenance effectuée ---------- */
const DRV_PARTS = ['Huile moteur', 'Filtre à huile', 'Filtre à air', 'Filtre à gasoil', 'Pneumatiques', 'Huile de vérin', 'Huile de boîte', 'Huile de pont', 'Liquide de frein', 'Plaquettes / freins', 'Croix de transmission (cardan)', 'Batterie', 'Courroie', 'Amortisseurs', 'Ampoules / feux', 'Autres'];
function drvMaintForm(tripId) {
  const me = drvView();
  const parts = DRV_PARTS.map((x) => `<label style="display:flex;gap:10px;align-items:center;margin:6px 0;font-size:14px;color:var(--text)"><input type="checkbox" class="m-part" value="${esc(x)}" style="width:22px;height:22px"> ${esc(x)}</label>`).join('');
  drvSheet('4 · Maintenance / vidange (facultatif)', `
    <label>Pièces changées ou entretien effectué — cochez une ou plusieurs</label>${parts}
    <label>Précisions (facultatif ; obligatoire si « Autres » est coché)</label><input id="m-det">
    <label>Kilométrage lors de la maintenance (km)</label><input id="m-km" type="number" inputmode="numeric" value="${esc(me.vehicle ? me.vehicle.mileage : '')}">
    <label>Coût total (GNF)</label><input id="m-cost" type="number" inputmode="numeric">
    <label>Rappel — prochaine vidange à (km)</label><input id="m-next" type="number" inputmode="numeric" placeholder="Ex. ${me.vehicle ? Number(me.vehicle.mileage || 0) + 10000 : '120000'}">
    ${drvPhotoField('Photo de la facture ou du reçu — obligatoire si un coût est indiqué', false)}`, async () => {
    const picked = [...document.querySelectorAll('.m-part:checked')].map((x) => x.value), det = drvFix(drvEl('m-det').value);
    if (!picked.length) throw new Error('Cochez au moins une pièce ou un entretien.');
    if (picked.includes('Autres') && !det) throw new Error('Précisez ce que vous avez changé (champ « Précisions »).');
    const detail = picked.join(', ') + (det ? ' — ' + det : '');
    if (drvNum('m-cost') > 0 && !DRV_PHOTOS.length) throw new Error('La photo de la facture ou du reçu est obligatoire quand un coût est indiqué.');
    const g = await drvGeo();
    drvEnqueue({ type: 'maintenance', tripId: tripId || undefined, photos: DRV_PHOTOS.slice(), payload: { nature: 'PIECES', detail, mileage: drvNum('m-km'), cost: drvNum('m-cost'), nextServiceKm: drvNum('m-next'), occurredAt: new Date().toISOString(), offline: !navigator.onLine, ...g } });
  }, 'Enregistrer la maintenance');
}
const DRV_FAULTS = ['Plaquettes de frein', 'Freins', 'Pare-chocs', 'Pneumatiques / crevaison', 'Moteur / mécanique', 'Boîte de vitesses / transmission', 'Suspension / amortisseurs', 'Batterie / électricité', 'Phares / feux', 'Pare-brise / vitres', 'Rétroviseur', 'Fuite d\'huile ou de liquide', 'Climatisation', 'Accident', 'Autres'];
const DRV_EXP = { PEAGE: 'Péages et taxes routières', AMENDE: 'Contravention / amende (police)', DEPANNAGE: "Dépannage d'urgence", LAVAGE: 'Lavage du véhicule', AUTRE: 'Autre', REPARATION: "Réparation d'urgence", REPAS: 'Repas', HEBERGEMENT: 'Hébergement', PARKING: 'Parking' };
const DRV_EXP_FORM = ['PEAGE', 'AMENDE', 'DEPANNAGE', 'LAVAGE', 'AUTRE'];
const DRV_EXP_ST = { PENDING: ['warn', 'En attente'], APPROVED: ['ok', 'Validée'], REJECTED: ['bad', 'Refusée'] };
function drvExpenseForm(tripId) {
  drvSheet('Déclarer une dépense', `
    <label>Nature de la dépense</label><select id="e-cat" onchange="drvEl('e-ins-box').style.display=this.value==='DEPANNAGE'?'block':'none'">${DRV_EXP_FORM.map((k) => `<option value="${k}">${esc(DRV_EXP[k])}</option>`).join('')}</select>
    <div id="e-ins-box" style="display:none"><label>Dépannage couvert par la police d'assurance ?</label><select id="e-ins"><option value="">— Choisir —</option><option value="yes">Oui, couvert par l'assurance</option><option value="no">Non, à la charge de l'entreprise</option></select></div>
    <label>Montant (GNF)</label><input id="e-amount" type="number" inputmode="numeric">
    <label>Précisions (obligatoire si « Autre »)</label><input id="e-desc" placeholder="Ex. péage Coyah, amende excès de vitesse, remorquage à Kindia…">
    ${drvPhotoField('Photo du reçu ou de la facture — obligatoire', false)}`, async () => {
    const amount = drvNum('e-amount'), cat = drvEl('e-cat').value, desc = drvFix(drvEl('e-desc').value);
    if (!amount || amount <= 0) throw new Error('Saisissez le montant de la dépense.');
    if (cat === 'AUTRE' && !desc) throw new Error('Précisez la nature de la dépense.');
    if (cat === 'DEPANNAGE' && !drvEl('e-ins').value) throw new Error("Indiquez si le dépannage est couvert par l'assurance.");
    if (!DRV_PHOTOS.length) throw new Error('La photo du reçu ou de la facture est obligatoire.');
    const g = await drvGeo();
    drvEnqueue({ type: 'expense', tripId: tripId || undefined, photos: DRV_PHOTOS.slice(), payload: { category: cat, amount, description: desc || undefined, insured: cat === 'DEPANNAGE' ? drvEl('e-ins').value === 'yes' : undefined, occurredAt: new Date().toISOString(), offline: !navigator.onLine, ...g } });
  }, 'Enregistrer la dépense');
}
const DRV_SYMPTOMS = ['Voyant allumé', 'Bruit anormal', 'Fuite (huile, eau, carburant)', 'Fumée', 'Vibrations', 'Perte de puissance'];
const DRV_ORGANS = ['Plaquettes de frein', 'Freins', 'Pneumatiques / crevaison', 'Moteur', 'Boîte de vitesses / transmission', 'Suspension / amortisseurs', 'Batterie / électricité', 'Phares / feux', 'Pare-brise / vitres', 'Pare-chocs / carrosserie', 'Rétroviseur', 'Climatisation', 'Accident', 'Autres'];
function drvFaultForm(tripId) {
  const chk = (c, x) => `<label style="display:flex;gap:10px;align-items:center;margin:6px 0;font-size:14px;color:var(--text)"><input type="checkbox" class="${c}" value="${esc(x)}" style="width:22px;height:22px"> ${esc(x)}</label>`;
  drvSheet('Signaler une panne ou une anomalie', `
    <label>Niveau de gravité</label><select id="x-sev"><option value="LEGERE">Légère — je peux rouler</option><option value="MOYENNE">Moyenne — je peux rouler avec prudence</option><option value="GRAVE">Grave — véhicule immobilisé</option></select>
    <label>Ce que je constate (cochez)</label>${DRV_SYMPTOMS.map((x) => chk('x-sym', x)).join('')}
    <label>Élément concerné (cochez)</label>${DRV_ORGANS.map((x) => chk('x-fault', x)).join('')}
    <label>Description / précisions (obligatoire si « Autres »)</label><textarea id="x-desc" rows="3" placeholder="Où, quand, depuis combien de temps…"></textarea>
    ${drvPhotoField('Photos justificatives (jusqu’à 4) — obligatoires si gravité moyenne ou grave', true)}
    <div class="desc" style="font-size:12px;color:var(--muted);margin-top:8px">Votre position GPS est transmise immédiatement au gestionnaire de flotte.</div>`, async () => {
    const sev = drvEl('x-sev').value, sym = [...document.querySelectorAll('.x-sym:checked')].map((x) => x.value), picked = [...document.querySelectorAll('.x-fault:checked')].map((x) => x.value), desc = drvFix(drvEl('x-desc').value, true);
    if (!sym.length && !picked.length) throw new Error('Cochez au moins un symptôme ou un élément concerné.');
    if (picked.includes('Autres') && !desc) throw new Error('Précisez la panne ou l\'anomalie (champ « Description »).');
    if (sev !== 'LEGERE' && !DRV_PHOTOS.length) throw new Error('Ajoutez au moins une photo pour une panne moyenne ou grave.');
    const g = await drvGeo(), base = { occurredAt: new Date().toISOString(), offline: !navigator.onLine, ...g };
    const full = [...sym, ...picked].join(', ') + (desc ? ' — ' + desc : '');
    const gl = { LEGERE: 'légère', MOYENNE: 'moyenne', GRAVE: 'grave' }[sev];
    if (picked.includes('Accident')) drvEnqueue({ type: 'incident', tripId: tripId || undefined, photos: DRV_PHOTOS.slice(), payload: { kind: 'ACCIDENT', severity: sev === 'GRAVE' ? 'HIGH' : 'MEDIUM', description: `Gravité ${gl} — ${full}`, ...base } });
    else if (sev === 'GRAVE') drvEnqueue({ type: 'breakdown', tripId: tripId || undefined, photos: DRV_PHOTOS.slice(), payload: { severity: 'HIGH', description: full, ...base } });
    else drvEnqueue({ type: 'maintenance', tripId: tripId || undefined, photos: DRV_PHOTOS.slice(), payload: { nature: 'ANOMALIE', detail: full, severity: sev, ...base } });
  }, 'Envoyer le signalement');
}
/* ---------- Correction automatique (orthographe / majuscules) des saisies ---------- */
const DRV_FIXES = { usee: 'usée', usees: 'usées', cassee: 'cassée', cassees: 'cassées', verin: 'vérin', verins: 'vérins', plaquete: 'plaquette', plaquetes: 'plaquettes', plaquet: 'plaquette', pnue: 'pneu', pneue: 'pneu', pneux: 'pneus', pneumatique: 'pneumatique', parchoc: 'pare-chocs', parechoc: 'pare-chocs', parechocs: 'pare-chocs', 'pare-choc': 'pare-chocs', parbrise: 'pare-brise', parebrise: 'pare-brise', vidanje: 'vidange', vidanges: 'vidanges', baterie: 'batterie', batrie: 'batterie', batteri: 'batterie', acident: 'accident', accidant: 'accident', moteure: 'moteur', mottur: 'moteur', echappement: 'échappement', electrique: 'électrique', electricite: 'électricité', mecanique: 'mécanique', mecanicien: 'mécanicien', reparation: 'réparation', reparer: 'réparer', kilometrage: 'kilométrage', creve: 'crevé', crevaison: 'crevaison', creuvaison: 'crevaison', suspention: 'suspension', amortisseur: 'amortisseur', amortiseur: 'amortisseur', radiateur: 'radiateur', radiatteur: 'radiateur', carburent: 'carburant', carburan: 'carburant', gazoil: 'gasoil', gazole: 'gasoil', demarrage: 'démarrage', demarrer: 'démarrer', demarre: 'démarre', probleme: 'problème', problem: 'problème', vehicule: 'véhicule', vehicul: 'véhicule', degat: 'dégât', degats: 'dégâts', fuite: 'fuite', liquid: 'liquide', embrayage: 'embrayage', embrayaje: 'embrayage', boite: 'boîte', cardant: 'cardan', cardant_: 'cardan', rétroviseur: 'rétroviseur', retroviseur: 'rétroviseur', phar: 'phare', 'a cause': 'à cause', apre: 'après', aprés: 'après', deja: 'déjà', tres: 'très', pres: 'près', recu: 'reçu', mission: 'mission', livraision: 'livraison', livraisson: 'livraison', chargment: 'chargement', chargemant: 'chargement' };
const DRV_FIXRE = new RegExp('(^|[^A-Za-zÀ-ÿ_\\-])(' + Object.keys(DRV_FIXES).filter((k) => !k.includes('_')).sort((a, b) => b.length - a.length).map((k) => k.replace(/[-.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![A-Za-zÀ-ÿ\\-])', 'gi');
// long = zone de description : ajoute le point final
function drvFix(txt, long) {
  let t = String(txt || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  t = t.replace(DRV_FIXRE, (m, pre, w) => { const r = DRV_FIXES[w.toLowerCase()]; return pre + (w[0] === w[0].toUpperCase() && w.length > 1 && w === w.toUpperCase() ? r.toUpperCase() : r); });
  t = t.replace(/\s+([,.;:!?])/g, '$1').replace(/([,;:!?])(?=[^\s\d])/g, '$1 ');
  t = t.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (m, a, c) => a + c.toUpperCase());
  if (long && t.length > 15 && !/[.!?…]$/.test(t)) t += '.';
  return t;
}
document.addEventListener('focusout', (e) => {
  const el = e.target;
  if (!el || !el.closest || !el.closest('#drv-sheet')) return;
  const ok = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (!el.type || el.type === 'text'));
  if (ok && el.value) el.value = drvFix(el.value, el.tagName === 'TEXTAREA');
});
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (el && el.closest && el.closest('#drv-sheet') && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (!el.type || el.type === 'text')))) { el.setAttribute('spellcheck', 'true'); el.setAttribute('lang', 'fr'); el.setAttribute('autocapitalize', 'sentences'); el.setAttribute('autocorrect', 'on'); }
});

/* ---------- Modules du jour : Carburant, Maintenance & pannes, Dépenses ---------- */
async function drvDayData() {
  const d = new Date().toISOString().slice(0, 10);
  let sh = null;
  try { await drvFlush(); sh = await api('/driver/sheet?date=' + d); dset('sheet_' + d, sh); } catch (e) { sh = dget('sheet_' + d); }
  DRV.lastSheet = sh;
  return sh;
}
const drvPendingRows = (types, txt) => drvQueue().filter((o) => types.includes(o.type) && !o.rejected).map((o) => `<div class="drv-row"><span>${esc(txt(o))}</span><b><span class="badge warn"><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> À envoyer</span></b></div>`).join('');
async function drvModuleLoad(kind, banner) {
  const tabAtStart = DRV.tab;
  const sh = await drvDayData();
  if (DRV.tab !== tabAtStart) return;
  const root = drvEl('drv-root'), me = drvView(), act = me.activeTrip, tid = act ? esc(act.id) : '';
  const hh = (d) => (d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '…');
  const sent = sh && sh.status === 'SENT';
  const lock = sent ? '<div style="font-size:12px;color:var(--muted);margin-top:6px"><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg> La fiche du jour est envoyée : nouvelles saisies impossibles aujourd\'hui.</div>' : '';
  const T = (sh && sh.totals) || { liters: 0, fuelCost: 0, expenses: 0, maintenanceCost: 0 };
  if (kind === 'fuel') {
    const rows = ((sh && sh.fuel) || []).map((f) => `<div class="drv-row"><span>${hh(f.time)} · km ${fmt(f.mileage)} · ${esc(drvSrc(f))}</span><b>${f.liters} L · ${fmt(f.cost)} GNF</b></div>`).join('') + drvPendingRows(['fuel'], (o) => `Plein de ${o.payload.liters} L`);
    root.innerHTML = banner + `<div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-fuel"/></svg> Carburant du jour</h4><div class="drv-row"><span>Total</span><b>${T.liters} L · ${fmt(T.fuelCost)} GNF</b></div>${rows || '<div style="font-size:14px;color:var(--muted)">Aucun plein aujourd\'hui.</div>'}
      ${sent ? '' : `<button class="drv-btn gold" onclick="drvFuelForm('${tid}')"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Enregistrer un plein</button>`}${lock}</div>`;
  } else if (kind === 'maint') {
    const m = ((sh && sh.maintenance) || []).filter((x) => x.nature !== 'ANOMALIE'), an = ((sh && sh.maintenance) || []).filter((x) => x.nature === 'ANOMALIE'), bd = (sh && sh.breakdowns) || [];
    const r1 = m.map((x) => `<div class="drv-row"><span>${esc(DRV_NAT[x.nature] || x.nature)}${x.detail ? ' — ' + esc(x.detail) : ''}<br><small>${hh(x.date)} · km ${x.mileage != null ? fmt(x.mileage) : '—'}${x.nextServiceKm ? ' · prochaine vidange : ' + fmt(x.nextServiceKm) + ' km' : ''}</small></span><b>${x.cost != null ? fmt(x.cost) + ' GNF' : '—'}</b></div>`).join('') + drvPendingRows(['maintenance'], () => 'Maintenance / anomalie');
    const r2 = an.map((x) => `<div class="drv-warn">${hh(x.date)} · ${x.severity ? '[' + (x.severity === 'MOYENNE' ? 'Moyenne' : 'Légère') + '] ' : ''}${esc(x.detail || '')}</div>`).join('') + bd.map((x) => `<div class="drv-warn"><svg class="ic ic-bad" aria-hidden="true"><use href="#i-dot"/></svg> ${hh(x.time)} · Panne grave : ${esc(x.reason || '')}</div>`).join('');
    root.innerHTML = banner + `<div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg> Entretien et vidange</h4>${r1 || '<div style="font-size:14px;color:var(--muted)">Aucun entretien aujourd\'hui.</div>'}
      ${sent ? '' : `<button class="drv-btn gold" onclick="drvMaintForm('${tid}')"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Enregistrer un entretien</button>`}</div>
      <div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg> Pannes et anomalies</h4>${r2 || '<div style="font-size:14px;color:var(--muted)">Aucun signalement aujourd\'hui.</div>'}
      ${sent ? '' : `<button class="drv-btn" style="background:#C0504D" onclick="drvFaultForm('${tid}')"><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> Signaler une panne</button>`}${lock}</div>`;
  } else {
    const rows = ((sh && sh.expenses) || []).map((e) => `<div class="drv-row"><span>${esc(DRV_EXP[e.category] || e.category)}${e.description ? ' — ' + esc(e.description) : ''}${e.category === 'DEPANNAGE' && e.insured != null ? ' (assurance : ' + (e.insured ? 'oui' : 'non') + ')' : ''}<br><small>${hh(e.time)} · <span class="badge ${DRV_EXP_ST[e.status][0]}">${DRV_EXP_ST[e.status][1]}</span>${e.note ? ' · ' + esc(e.note) : ''}</small></span><b>${fmt(e.amount)} GNF</b></div>`).join('') + drvPendingRows(['expense'], (o) => `Dépense de ${fmt(o.payload.amount)} GNF`);
    root.innerHTML = banner + `<div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg> Dépenses diverses du jour</h4><div class="drv-row"><span>Total</span><b>${fmt(T.expenses || 0)} GNF</b></div>${rows || '<div style="font-size:14px;color:var(--muted)">Aucune dépense aujourd\'hui.</div>'}
      <div style="font-size:12px;color:var(--muted);margin:6px 0">Péages, contraventions, dépannage d'urgence, lavage. La photo du reçu est obligatoire.</div>
      ${sent ? '' : `<button class="drv-btn gold" onclick="drvExpenseForm('${tid}')"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Ajouter une dépense</button>`}${lock}</div>`;
  }
}
/* ---------- Fiche journalière (fiche de bord) ---------- */
const DRV_NAT = { PIECES: 'Pièces / entretien', PNEUS: 'Pneumatiques', VIDANGE: 'Vidange complète', FILTRE: 'Filtre', HUILE: 'Huile', FREINS: 'Freins', BATTERIE: 'Batterie', ELECTRICITE: 'Électricité', ANOMALIE: 'Anomalie signalée', AUTRE: 'Autre' };
function drvSheetHtml(sh, offline) {
  const me = drvView(), v = me.vehicle, sent = sh.status === 'SENT';
  const hh = (d) => (d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '…');
  const T = sh.totals;
  const lock = '<div style="font-size:12px;color:var(--muted)"><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg> Fiche envoyée : modification impossible.</div>';
  const motifOf = (t) => [({ MISSION: 'Mission', AUTRE: 'Autre', TRANSPORT: 'Transport' })[t.purposeType], t.cargo, t.purpose].filter(Boolean).join(' — ') || '—';
  const blk = (title, body) => `<div class="drv-card"><h4>${title}</h4>${body || '<div style="font-size:14px;color:var(--muted)">Rien de saisi.</div>'}</div>`;
  const missions = sh.trips.map((t) => `${t.reference ? `<div class="drv-row"><span>N° de mission</span><b>${esc(t.reference)} <a href="#" onclick="drvTimeline('${esc(t.id)}');return false;" style="font-size:14px"><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> Chronologie</a></b></div>` : ''}
    <div class="drv-row"><span>Départ ${hh(t.startTime)} · ${esc(t.plate)}</span><b>km ${fmt(t.startMileage)}${t.startFuelLiters != null ? ' · ' + esc(drvFuelTxt(t.startFuelLiters)) : ''}</b></div>
    <div class="drv-row"><span>Destination(s)</span><b style="text-align:right">${esc(t.destination || (t.regions || []).join(', ') || '—')}</b></div>
    <div class="drv-row"><span>Motif</span><b style="text-align:right">${esc(motifOf(t))}</b></div>
    ${t.preCondition === 'ANOMALIE' ? `<div class="drv-warn">Anomalie au départ : ${esc(t.preAnomalies)}</div>` : ''}
    ${t.status === 'COMPLETED' ? `<div class="drv-row"><span>${drvOutside(t) ? 'Arrivée ' + drvDt(t.endTime) : 'Retour / arrêt'}</span><b>km ${fmt(t.endMileage)}${t.endFuelLiters != null ? ' · ' + esc(drvFuelTxt(t.endFuelLiters)) : ''}</b></div><div class="drv-row"><span>Distance</span><b>${fmt(t.km)} km</b></div>${t.voyages != null ? `<div class="drv-row"><span>Voyages</span><b>${esc(t.voyages)}</b></div>` : ''}` : '<div class="drv-warn">Mission non terminée : déclarez l\'arrivée avant d\'envoyer la fiche.</div>'}`).join('<hr style="border:0;border-top:1px dashed #d8dee8">');
  const fuel = sh.fuel.map((f) => `<div class="drv-row"><span>${hh(f.time)} · km ${fmt(f.mileage)} · ${esc(drvSrc(f))}</span><b>${f.liters} L · ${fmt(f.cost)} GNF</b></div>`).join('');
  const maint = sh.maintenance.filter((m) => m.nature !== 'ANOMALIE').map((m) => `<div class="drv-row"><span>${esc(DRV_NAT[m.nature] || m.nature)}${m.detail ? ' — ' + esc(m.detail) : ''}<br><small>${hh(m.date)} · km ${m.mileage != null ? fmt(m.mileage) : '—'}${m.nextServiceKm ? ' · prochaine vidange : ' + fmt(m.nextServiceKm) + ' km' : ''}</small></span><b>${m.cost != null ? fmt(m.cost) + ' GNF' : '—'}</b></div>`).join('');
  const pannes = sh.maintenance.filter((m) => m.nature === 'ANOMALIE').map((m) => `<div class="drv-warn">${hh(m.date)} · ${m.severity ? '[' + (m.severity === 'MOYENNE' ? 'Moyenne' : 'Légère') + '] ' : ''}${esc(m.detail || '')}</div>`).join('') + (sh.breakdowns || []).map((b) => `<div class="drv-warn"><svg class="ic ic-bad" aria-hidden="true"><use href="#i-dot"/></svg> ${hh(b.time)} · Panne grave : ${esc(b.reason || '')}</div>`).join('');
  const exps = (sh.expenses || []).map((e) => `<div class="drv-row"><span>${esc(DRV_EXP[e.category] || e.category)}${e.description ? ' — ' + esc(e.description) : ''}${e.category === 'DEPANNAGE' && e.insured != null ? ' (assurance : ' + (e.insured ? 'oui' : 'non') + ')' : ''}<br><small>${hh(e.time)} · <span class="badge ${DRV_EXP_ST[e.status][0]}">${DRV_EXP_ST[e.status][1]}</span></small></span><b>${fmt(e.amount)} GNF</b></div>`).join('');
  const photos = [];
  sh.fuel.forEach((f) => f.receiptUrl && photos.push(['Carburant ' + hh(f.time), f.receiptUrl]));
  sh.maintenance.forEach((m) => (m.photoUrls || []).forEach((u) => photos.push(['Maintenance / anomalie ' + hh(m.date), u])));
  (sh.breakdowns || []).forEach((b) => (b.photoUrls || []).forEach((u) => photos.push(['Panne ' + hh(b.time), u])));
  (sh.expenses || []).forEach((e) => e.receiptUrl && photos.push([(DRV_EXP[e.category] || 'Dépense') + ' ' + hh(e.time), e.receiptUrl]));
  const base = (state.apiUrl || '').replace(/\/$/, '');
  const gallery = photos.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${photos.map((x) => `<a href="${esc(base + x[1])}" target="_blank" rel="noopener" style="width:30%;min-width:96px;text-decoration:none;color:var(--text);font-size:12px"><img src="${esc(base + x[1])}" alt="" style="width:100%;height:84px;object-fit:cover;border-radius:6px;border:1px solid #D9E0E8"><div>${esc(x[0])}</div></a>`).join('')}</div>` : '';
  return `<div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg> Ma fiche — ${esc(sh.day)} ${esc(sh.date.split('-').reverse().join('/'))}</h4>
      <div class="drv-row"><span>Chauffeur</span><b>${esc(me.driver.name)}</b></div>
      <div class="drv-row"><span>Véhicule</span><b>${esc(v ? v.plate : '—')}</b></div>
      <div class="drv-row"><span>Statut</span><b>${sent ? stepBadge(sh.step) + ' <small>' + drvDt(sh.sentAt) + '</small>' : sh.step === 'REJECTED' ? '<span class="badge bad">Rejeté : à corriger</span>' : '<span class="badge warn">Brouillon</span>'}</b></div>
      ${sh.step === 'REJECTED' || sh.rejectNote ? `<div class="drv-warn">Fiche renvoyée par la hiérarchie : ${esc(sh.rejectNote || '')}. Corrigez puis renvoyez-la.</div>` : ''}
      <div class="drv-row"><span>Distance totale</span><b>${fmt(T.km)} km</b></div>
      <div class="drv-row"><span>Carburant</span><b>${T.liters} L · ${fmt(T.fuelCost)} GNF</b></div>
      <div class="drv-row"><span>Consommation</span><b>${T.consumption !== null ? T.consumption + ' L/100 km' : 'calculée après l\'arrivée'}</b></div>
      <div class="drv-row"><span>Entretien</span><b>${fmt(T.maintenanceCost || 0)} GNF</b></div>
      <div class="drv-row"><span>Dépenses diverses</span><b>${fmt(T.expenses || 0)} GNF</b></div>
      <div class="drv-row" style="font-weight:700"><span>Total des frais</span><b>${fmt((T.fuelCost || 0) + (T.maintenanceCost || 0) + (T.expenses || 0))} GNF</b></div></div>
    ${blk('Missions et destinations', missions)}
    ${blk('Carburant', fuel)}
    ${blk('Entretien', maint)}
    ${blk('Pannes et anomalies', pannes)}
    ${blk('Dépenses diverses', exps)}
    ${blk('Pièces jointes (' + photos.length + ')', gallery)}
    <div class="drv-card"><h4><svg class="ic" aria-hidden="true"><use href="#i-upload"/></svg> Vérifier et envoyer</h4>
      ${sent ? lock : `<div style="font-size:14px;color:var(--muted);margin-bottom:8px">Relisez votre journée. Une fois envoyée, la fiche est transmise à la hiérarchie et ne peut plus être modifiée.</div>
      <button class="drv-btn gold" onclick="drvSheetSend('${esc(sh.date)}')" ${offline ? 'disabled' : ''}><svg class="ic" aria-hidden="true"><use href="#i-upload"/></svg> Valider et envoyer ma fiche</button>
      ${offline ? '<div style="font-size:12px;color:var(--muted);text-align:center;margin-top:6px">Connexion nécessaire pour envoyer.</div>' : ''}`}</div>`;
}
async function drvSheetLoad(date) {
  const root = drvEl('drv-root');
  const d = date || DRV.sheetDate || new Date().toISOString().slice(0, 10);
  DRV.sheetDate = d;
  const picker = `<div class="drv-card" style="padding:10px"><label style="margin:0">Jour</label><input type="date" id="sh-date" value="${esc(d)}" onchange="drvSheetLoad(this.value)"></div>`;
  let sh = null, offline = false;
  try { await drvFlush(); sh = await api('/driver/sheet?date=' + d); dset('sheet_' + d, sh); }
  catch (e) {
    if (e.code === 'DEVICE_BLOCKED') { DRV.blocked = e.message; return drvRender(); }
    sh = dget('sheet_' + d, null); offline = true;
    if (!sh) { if (DRV.tab === 'sheet') root.innerHTML = picker + `<div class="drv-card drv-center">Fiche indisponible hors connexion.</div>`; return; }
  }
  DRV.lastSheet = sh;
  if (DRV.tab === 'sheet') root.innerHTML = picker + (drvQueue().some((o) => !o.rejected) ? '<div class="drv-warn">Des saisies sont en attente d\'envoi : elles apparaîtront dans la fiche après synchronisation.</div>' : '') + drvSheetHtml(sh, offline);
}
async function drvSheetSend(date) {
  const act = drvView().activeTrip;
  if (act) return alert("Une mission est encore en cours : déclarez d'abord l'arrivée / retour (bloc 3).");
  if (!confirm('Enregistrer et envoyer la fiche du ' + date + ' au responsable logistique ?\n\nAprès l\'envoi, vous ne pourrez plus modifier cette journée.\nPensez à déposer vos justificatifs (reçus, factures) au responsable.')) return;
  try {
    await drvFlush();
    if (drvQueue().some((o) => !o.rejected)) throw new Error('Des saisies ne sont pas encore synchronisées. Réessayez avec du réseau.');
    await api('/driver/sheet/send', { method: 'POST', body: { date } });
    await drvSheetLoad(date);
  } catch (e) { alert(e.message); }
}

/* ============ FICHES CHAUFFEURS (bureau) ============ */
const BOARD_ST = { EN_MISSION: ['', 'En mission', 'ok'], A_ENVOYER: ['', 'Fiche à envoyer', 'warn'], ENVOYEE: ['', 'Fiche envoyée', 'ok'], RIEN: ['', 'Rien de saisi', 'bad'] };
async function renderDriverExpenses(status) {
  const st = status || window._exSt || 'PENDING'; window._exSt = st;
  const role = state.user.role, canDecide = ['SUPER_ADMIN', 'COMPTABLE'].includes(role), canPaper = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_OPERATIONS'].includes(role);
  const rows = await api('/driver-admin/expenses?status=' + st + '&siteId=' + state.siteId);
  const stb = { PENDING: ['warn', 'En attente'], APPROVED: ['ok', 'Validée'], REJECTED: ['bad', 'Refusée'] };
  const tr = rows.map((e) => `<tr><td>${esc(drvDt(e.date))}</td><td><b>${esc(e.driver)}</b><div style="font-size:12px;color:var(--muted)">${esc(e.vehicle || '')}</div></td>
    <td>${esc(DRV_EXP[e.category] || e.category)}<div style="font-size:12px">${esc(e.description || '')}</div></td><td class="mono"><b>${fmt(e.amount)}</b> GNF</td>
    <td>${receiptLink(e.receiptUrl)}</td>
    <td>${e.receiptCheckedAt ? '<span class="badge ok"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Conforme</span>' : canPaper ? `<button class="btn small" onclick="receiptCheck('${esc(e.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Reçu papier reçu</button>` : '<span class="badge warn">À contrôler</span>'}</td>
    <td>${stepBadge(e.sheetStep)}</td>
    <td><span class="badge ${stb[e.status][0]}">${stb[e.status][1]}</span>${e.note ? `<div style="font-size:12px">${esc(e.note)}</div>` : ''}</td>
    <td>${e.status === 'PENDING' && canDecide ? (e.sheetStep === 'VALIDATED' ? `<button class="btn small gold" onclick="decideExpense('${esc(e.id)}','APPROVED')"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Valider</button> <button class="btn small" onclick="decideExpense('${esc(e.id)}','REJECTED')"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg> Refuser</button>` : '<span style="font-size:12px;color:var(--muted)">Attend la validation des opérations</span>') : ''}</td></tr>`).join('');
  root().innerHTML = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg> Dépenses déclarées par les chauffeurs</h3><div class="desc">${canDecide ? 'Vous traitez les dépenses des fiches déjà validées par le Responsable des opérations. Une dépense validée est ajoutée aux dépenses du véhicule.' : 'Suivi des dépenses : seule la Comptabilité les valide, après validation de la fiche par le Responsable des opérations.'}</div>
    <label>Afficher</label><select onchange="renderDriverExpenses(this.value)" style="max-width:220px"><option value="PENDING" ${st === 'PENDING' ? 'selected' : ''}>En attente</option><option value="APPROVED" ${st === 'APPROVED' ? 'selected' : ''}>Validées</option><option value="REJECTED" ${st === 'REJECTED' ? 'selected' : ''}>Refusées</option></select></div>
    <div class="panel"><div style="overflow:auto"><table><tr><th>Date</th><th>Chauffeur</th><th>Nature</th><th>Montant</th><th>Reçu scanné</th><th>Reçu papier</th><th>Fiche</th><th>Statut</th><th></th></tr>${tr || '<tr><td colspan="9" class="empty">Aucune dépense.</td></tr>'}</table></div></div>`;
}
/* ---------- Ventes (Responsable commercial) : Commandes · Factures · Clients · Retours · Caisses à valider ---------- */
let vtTab = 'tableau';
const VT_DASH = { period: 'MONTH', from: '', to: '' };
const VT_TABS = [['tableau', 'Tableau de bord'], ['caisses', 'Caisses à valider'], ['catalogue', 'Catalogue et tarifs'], ['commandes', 'Commandes'], ['factures', 'Factures'], ['clients', 'Clients'], ['retours', 'Retours']];
const VT_ORDER = { QUOTE: ['Devis', 'info'], CONFIRMED: ['Confirmée', 'info'], PARTIALLY_DELIVERED: ['Livrée en partie', 'warn'], DELIVERED: ['Livrée', 'ok'], INVOICED: ['Facturée', 'ok'], CANCELLED: ['Annulée', 'bad'] };
const VT_INV = { DRAFT: ['Brouillon', 'info'], UNPAID: ['Impayée', 'bad'], PARTIALLY_PAID: ['Partielle', 'warn'], PAID: ['Payée', 'ok'], CANCELLED: ['Annulée', 'bad'] };
function cashState(c) {
  if (!c.closedAt) return ['Brouillon', 'info'];
  if (c.rejectedAt) return ['Rejeté', 'bad'];
  if (c.opsAt) return ['Validé', 'ok'];
  if (c.validatedBy) return ['Vérifié', 'warn'];
  return ['Soumis', 'warn'];
}
function vtCanAct() { return ['RESPONSABLE_COMMERCIAL', 'SUPER_ADMIN'].includes(state.user.role); }
async function renderVentes() {
  const sid = encodeURIComponent(state.siteId || '');
  const [sess, orders, invs, rets, custList] = await Promise.all([api('/cash-sessions?siteId=' + sid), api('/sales/orders?siteId=' + sid), api('/sales/invoices?siteId=' + sid), api('/sales/returns?siteId=' + sid).catch(() => []), api('/customers?siteId=' + sid).catch(() => [])]);
  const g = (n) => fmt(Math.round(Number(n) || 0)), dd = (x) => new Date(x).toLocaleDateString('fr-FR'), act = vtCanAct();
  const toCheck = (sess || []).filter((c) => c.closedAt && !c.validatedBy && !c.opsAt);
  const pendRet = (rets || []).filter((r) => r.status === 'PENDING');
  const bar = `<div class="dp-tabs" id="dp-bar">${VT_TABS.map(([k, t]) => { const n = k === 'caisses' ? toCheck.length : k === 'retours' ? pendRet.length : 0; return `<button class="${vtTab === k ? 'on' : ''}" onclick="vtTab='${k}';renderVentes()">${t}${n ? ' (' + n + ')' : ''}</button>`; }).join('')}</div>`;
  const badge = (m, k) => `<span class="badge ${m[1]}">${m[0]}</span>`;
  const opened = (invs || []).filter((i) => ['UNPAID', 'PARTIALLY_PAID'].includes(i.status));
  const due = (i) => Math.max(0, Number(i.totalAmount) - Number(i.amountPaid || 0));
  let body = '';
  if (vtTab === 'tableau') {
    const pd = VT_DASH, t0 = new Date(), iso = (d) => d.toISOString().slice(0, 10);
    let from = '', to = '';
    if (pd.period === 'TODAY') { from = to = iso(t0); } else if (pd.period === 'WEEK') { const d = new Date(t0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); from = iso(d); to = iso(t0); } else if (pd.period === 'CUSTOM') { from = pd.from; to = pd.to; }
    let D = null, err = '';
    try { D = await api('/sales/dashboard?siteId=' + sid + (from ? '&from=' + from : '') + (to ? '&to=' + to : '')); } catch (e) { err = e.message; }
    const tile = (n, l, c, sub) => `<div style="flex:1;min-width:140px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px"><div style="font-size:12px;color:var(--muted)">${l}</div><div style="font-size:20px;font-weight:700;color:${c || '#1F3A5F'}">${n}</div>${sub ? `<div style="font-size:12px;color:var(--muted)">${sub}</div>` : ''}</div>`;
    const ctl = `<div class="panel"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select onchange="VT_DASH.period=this.value;renderVentes()">${[['TODAY', "Aujourd'hui"], ['WEEK', 'Cette semaine'], ['MONTH', 'Ce mois'], ['CUSTOM', 'Période libre']].map(([k, l]) => `<option value="${k}" ${pd.period === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${pd.period === 'CUSTOM' ? `<input type="date" value="${esc(pd.from)}" onchange="VT_DASH.from=this.value;renderVentes()"> → <input type="date" value="${esc(pd.to)}" onchange="VT_DASH.to=this.value;renderVentes()">` : ''}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn small" onclick="vtReport('pdf')">Rapport PDF</button><button class="btn small" onclick="vtReport('xlsx')">Rapport Excel</button></div></div>`;
    if (!D) body = ctl + `<div class="panel"><div class="msg err">${esc(err || 'Indisponible')}</div></div>`;
    else body = ctl + `<div class="panel"><h3>Chiffres de la période</h3><div style="display:flex;gap:10px;flex-wrap:wrap">
      ${tile(g(D.turnover) + ' GNF', "Chiffre d'affaires", '', D.invoicesCount + ' facture(s)')}${tile(g(D.salesToday) + ' GNF', "Ventes du jour", '', D.salesTodayCount + ' facture(s)')}${tile(g(D.paymentsReceived) + ' GNF', 'Paiements reçus', '#3F8F6B', D.paymentsCount + ' encaissement(s)')}${tile(g(D.unpaid.amount) + ' GNF', 'Factures impayées', D.unpaid.count ? '#B33A32' : '#3F8F6B', D.unpaid.count + ' facture(s) · ' + D.unpaid.overdueCount + ' en retard')}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">${tile(D.ordersCount, 'Commandes', '', 'hors devis et annulées')}${tile(D.quotesPending, 'Devis en attente', '#C9A24D')}${tile(D.quotesAccepted, 'Devis acceptés', '', D.quoteConversionPercent == null ? '' : D.quoteConversionPercent + ' % de transformation')}${tile(D.ordersToPrepare, 'À préparer / livrer', '#C9A24D', D.ordersPartiallyDelivered + ' partiellement livrée(s)')}${tile(D.ordersDelivered, 'Livrées')}${tile(D.activeCustomers, 'Clients actifs')}</div></div>
      <div class="panel"><h3>Meilleurs produits</h3>${D.topProducts.length ? `<table><tr><th>Produit</th><th>Quantité</th><th>Montant (GNF)</th></tr>${D.topProducts.map((p) => `<tr><td>${esc(p.name)}</td><td>${g(p.qty)}</td><td class="mono">${g(p.amount)}</td></tr>`).join('')}</table>` : '<div class="empty">Aucune vente sur la période.</div>'}</div>
      <div class="panel"><h3>Performance des commerciaux</h3>${D.agents.length ? `<table><tr><th>Agent</th><th>Factures</th><th>Montant (GNF)</th></tr>${D.agents.map((a) => `<tr><td>${esc(a.name)}</td><td>${a.count}</td><td class="mono">${g(a.total)}</td></tr>`).join('')}</table>` : '<div class="empty">Aucune facture sur la période.</div>'}</div>`;
  } else if (vtTab === 'caisses') {
    const rows = (sess || []).filter((c) => c.closedAt).map((c) => { const st = cashState(c), gap = c.gapAmount == null ? null : Number(c.gapAmount); const who = c.cashier ? c.cashier.firstName + ' ' + c.cashier.lastName : '';
      return `<tr><td>${dd(c.openedAt)}<div style="font-size:12px;color:var(--muted)">${esc(who)}</div></td><td>${badge(st)}${c.rejectNote ? '<div style="font-size:12px;color:var(--muted)">' + esc(c.rejectNote) + '</div>' : ''}</td><td class="mono">${g(c.expectedCash)}</td><td class="mono">${g(c.countedCash)}</td><td>${gap === 0 ? '<span class="badge ok">0</span>' : '<span class="badge bad">' + (gap > 0 ? '+' : '') + g(gap) + '</span>'}${c.note ? '<div style="font-size:12px;color:var(--muted)">' + esc(c.note) + '</div>' : ''}</td><td style="white-space:nowrap">${act && !c.validatedBy && !c.opsAt ? `<button class="btn small gold" onclick="vtCashOk('${esc(c.id)}', ${gap === 0 ? 0 : 1})"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Vérifier</button> ` : ''}${act && !c.opsAt && !c.rejectedAt ? `<button class="btn small" onclick="vtCashNo('${esc(c.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-chevron-left"/></svg> Rejeter</button>` : ''}</td></tr>`; }).join('');
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-archive"/></svg> Caisses clôturées <span class="badge ${toCheck.length ? 'warn' : 'ok'}">${toCheck.length} à vérifier</span></h3><div class="desc">Vérifiez la caisse (écart justifié), elle passe ensuite au Responsable des opérations puis à la Comptabilité.</div><div style="overflow:auto"><table><tr><th>Caisse</th><th>État</th><th>Attendu</th><th>Compté</th><th>Écart</th><th></th></tr>${rows || '<tr><td colspan="6"><div class="empty">Aucune caisse clôturée.</div></td></tr>'}</table></div></div>`;
  } else if (vtTab === 'commandes') {
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg> Commandes</h3><div style="overflow:auto"><table><tr><th>Référence</th><th>Client</th><th>Date</th><th>Total</th><th>État</th><th>Documents</th></tr>${(orders || []).map((o) => `<tr><td>${esc(o.reference)}</td><td>${esc(o.customer && o.customer.name)}</td><td>${dd(o.orderDate)}</td><td class="mono">${g((o.lines || []).reduce((a, l) => a + Number(l.lineTotal || 0), 0))}</td><td>${badge(VT_ORDER[o.status] || [o.status, 'info'])}</td><td style="white-space:nowrap"><button class="btn small" onclick="vtPdf('/sales/orders/${esc(o.id)}/pdf','${o.status === 'QUOTE' ? 'devis' : 'commande'}_${esc(o.reference)}')">${o.status === 'QUOTE' ? 'Devis PDF' : 'Commande PDF'}</button>${act && ['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(o.status) ? ` <button class="btn small gold" onclick="vtDeliver('${esc(o.id)}')">Livrer</button>` : ''}${['QUOTE', 'CANCELLED'].includes(o.status) ? '' : ` <button class="btn small" onclick="vtBl('${esc(o.id)}','${esc(o.reference)}')">Bon de livraison</button>`}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">Aucune commande.</div></td></tr>'}</table></div></div>`;
  } else if (vtTab === 'factures') {
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-receipt"/></svg> Factures <span class="badge ${opened.length ? 'warn' : 'ok'}">${opened.length} à encaisser</span></h3><div style="overflow:auto"><table><tr><th>Facture</th><th>Client</th><th>Total</th><th>Reste</th><th>État</th><th>Documents</th></tr>${(invs || []).map((i) => { const ph = String((i.customer && i.customer.phone) || '').replace(/\D/g, ''), full = ph.length === 9 ? '224' + ph : ph; const msg = `Bonjour ${(i.customer && i.customer.name) || ''}, rappel : la facture ${i.reference} présente un reste à payer de ${g(due(i))} GNF. Merci. — SYL LOGISTIQUE`; return `<tr><td>${esc(i.reference)}<div style="font-size:12px;color:var(--muted)">${dd(i.invoiceDate)}</div></td><td>${esc(i.customer && i.customer.name)}</td><td class="mono">${g(i.totalAmount)}</td><td class="mono">${['UNPAID', 'PARTIALLY_PAID'].includes(i.status) ? '<b>' + g(due(i)) + '</b>' : '—'}</td><td>${badge(VT_INV[i.status] || [i.status, 'info'])}</td><td>${['UNPAID', 'PARTIALLY_PAID'].includes(i.status) && full && act ? `<a class="btn small" target="_blank" rel="noopener" href="https://wa.me/${esc(full)}?text=${encodeURIComponent(msg)}">Relancer</a>` : ''} <button class="btn small" onclick="vtPdf('/sales/invoices/${esc(i.id)}/pdf','facture_${esc(i.reference)}')">Facture PDF</button>${Number(i.amountPaid || 0) > 0 ? ` <button class="btn small" onclick="vtReceipt('${esc(i.id)}')">Reçu PDF</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="6"><div class="empty">Aucune facture.</div></td></tr>'}</table></div></div>`;
  } else if (vtTab === 'catalogue') {
    body = `<div class="panel"><h3>Catalogue et tarifs de vente</h3><div class="desc">Prix de vente de chaque article. Toute modification est historisée (ancien prix, nouveau prix, qui, quand).</div><div id="vt-cat"><div class="empty">Chargement…</div></div></div>`;
    setTimeout(vtLoadCatalogue, 0);
  } else if (vtTab === 'clients') {
    const by = {}; (invs || []).filter((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT').forEach((i) => { const n = (i.customer && i.customer.name) || '—'; const c = by[n] || (by[n] = { n, tot: 0, paid: 0, k: 0 }); c.tot += Number(i.totalAmount); c.paid += Number(i.amountPaid || 0); c.k++; });
    const list = Object.values(by).sort((a, b) => (b.tot - b.paid) - (a.tot - a.paid));
    const cform = act ? `<div class="panel"><h3>Nouveau client ou prospect</h3><div class="grid-2"><div><label>Nom / société</label><input id="cu-n" autocomplete="off"></div><div><label>Téléphone</label><input id="cu-p" autocomplete="off"></div><div><label>Personne à contacter</label><input id="cu-c" autocomplete="off"></div><div><label>Adresse</label><input id="cu-a" autocomplete="off"></div><div><label>Type</label><select id="cu-k"><option value="CLIENT">Client</option><option value="PROSPECT">Prospect (pas encore de commande)</option></select></div></div><div id="cu-d" class="desc"></div><button class="btn gold" style="margin-top:8px" onclick="vtAddCustomer(false)">Enregistrer</button><div id="cu-m"></div></div>` : '';
    const clist = `<div class="panel"><h3>Fichier clients et prospects (${(custList || []).length})</h3><div style="overflow:auto"><table><tr><th>Nom</th><th>Type</th><th>Téléphone</th><th>Contact</th><th>Adresse</th>${act ? '<th></th>' : ''}</tr>${(custList || []).map((c) => `<tr><td>${esc(c.name)}</td><td><span class="badge ${c.kind === 'PROSPECT' ? 'warn' : 'ok'}">${c.kind === 'PROSPECT' ? 'Prospect' : 'Client'}</span></td><td>${esc(c.phone || '—')}</td><td>${esc(c.contactName || '—')}</td><td>${esc(c.address || '—')}</td>${act ? `<td>${c.kind === 'PROSPECT' ? `<button class="btn small" onclick="vtSetKind('${esc(c.id)}','CLIENT')">Passer en client</button>` : ''}</td>` : ''}</tr>`).join('')}</table></div></div>`;
    body = cform + clist + `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-users"/></svg> Clients — ce qu'ils doivent</h3><div style="overflow:auto"><table><tr><th>Client</th><th>Factures</th><th>Facturé</th><th>Payé</th><th>Reste dû</th></tr>${list.map((c) => `<tr><td>${esc(c.n)}</td><td>${c.k}</td><td class="mono">${g(c.tot)}</td><td class="mono">${g(c.paid)}</td><td class="mono">${c.tot - c.paid > 0 ? '<span class="badge bad">' + g(c.tot - c.paid) + '</span>' : '<span class="badge ok">0</span>'}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Aucun client facturé.</div></td></tr>'}</table></div></div>`;
  } else {
    const RS = { PENDING: ['À valider', 'warn'], VALIDATED: ['Validé', 'ok'], REJECTED: ['Rejeté', 'bad'] };
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-chevron-left"/></svg> Retours clients <span class="badge ${pendRet.length ? 'warn' : 'ok'}">${pendRet.length} à valider</span></h3><div style="overflow:auto"><table><tr><th>Retour</th><th>Facture / client</th><th>Motif</th><th>Montant</th><th>État</th><th></th></tr>${(rets || []).map((r) => `<tr><td>${esc(r.reference || '')}<div style="font-size:12px;color:var(--muted)">${dd(r.createdAt)}</div></td><td>${esc(r.salesInvoice && r.salesInvoice.reference)}<div style="font-size:12px;color:var(--muted)">${esc(r.salesInvoice && r.salesInvoice.customer && r.salesInvoice.customer.name)}</div></td><td>${esc(r.reason)}</td><td class="mono">${g(r.totalAmount)}</td><td>${badge(RS[r.status] || [r.status, 'info'])}</td><td style="white-space:nowrap">${act && r.status === 'PENDING' ? `<button class="btn small gold" onclick="vtRet('${esc(r.id)}', true)"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Valider</button> <button class="btn small" onclick="vtRet('${esc(r.id)}', false)"><svg class="ic" aria-hidden="true"><use href="#i-chevron-left"/></svg> Rejeter</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">Aucun retour.</div></td></tr>'}</table></div></div>`;
  }
  root().innerHTML = bar + (act ? '' : '<div class="msg">Lecture seule.</div>') + body + '<div id="vt-msg"></div>';
}
