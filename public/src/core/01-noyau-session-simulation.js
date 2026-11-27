/* ============================================================
   SYLLOGISTIQUE — client léger (HTML/JS pur, sans build)
   Consomme l'API SYLLOGISTIQUE (NestJS + Prisma + PostgreSQL)
   ============================================================ */

/* ---- Plusieurs espaces sur un même téléphone ----
   Chaque espace installé (Chauffeurs, Logistique, Commercial, Stock…) a son lien « ?espace=… ». Les applications installées d'un même site
   partagent le stockage du téléphone : sans séparation, se connecter dans l'une déconnectait l'autre. Ici la session (jetons, utilisateur,
   site actif, données chauffeur) est rangée sous une clé propre à l'espace. Sans « ?espace », rien ne change (comportement habituel). */
(function () {
  try {
    const q = new URLSearchParams(location.search).get('espace');
    if (q && /^[a-z]{2,20}$/.test(q)) sessionStorage.setItem('syl_ns', q);
    const ns = sessionStorage.getItem('syl_ns');
    if (!ns) return;
    const tag = '@' + ns;
    const own = (k) => typeof k === 'string' && /^syllo_(access_token|refresh_token|user|site_id|drv_)/.test(k) && !/@[a-z]+$/.test(k);
    const map = (k) => (own(k) ? k + tag : k);
    const P = Storage.prototype, g = P.getItem, st = P.setItem, rm = P.removeItem;
    P.getItem = function (k) { return g.call(this, this === localStorage ? map(k) : k); };
    P.setItem = function (k, v) { return st.call(this, this === localStorage ? map(k) : k, v); };
    P.removeItem = function (k) { return rm.call(this, this === localStorage ? map(k) : k); };
  } catch (e) {}
})();

const state = {
  apiUrl: localStorage.getItem('syllo_api_url') || '',
  accessToken: localStorage.getItem('syllo_access_token') || '',
  refreshToken: localStorage.getItem('syllo_refresh_token') || '',
  user: JSON.parse(localStorage.getItem('syllo_user') || 'null'),
  siteId: localStorage.getItem('syllo_site_id') || '',
  view: 'dashboard',
};

// Sur l'environnement de simulation, l'application parle TOUJOURS à son propre serveur (jamais à la production).
const SIM_HOST = /simulation/i.test(location.hostname);
const DEFAULT_API_URL = SIM_HOST ? location.origin : 'https://syllogistique-backend.onrender.com';
if (SIM_HOST || !state.apiUrl) state.apiUrl = DEFAULT_API_URL;
document.getElementById('api-url').value = state.apiUrl;

// Renouvelle la session en silence (le jeton d'accès dure 15 min) ; une seule demande à la fois
let refreshing = null;
async function refreshSession() {
  if (!state.refreshToken) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await fetch(state.apiUrl.replace(/\/$/, '') + '/auth/refresh', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: state.refreshToken }),
        });
        if (!r.ok) return false;
        const d = await r.json();
        state.accessToken = d.accessToken;
        if (d.refreshToken) state.refreshToken = d.refreshToken;
        localStorage.setItem('syllo_access_token', state.accessToken);
        localStorage.setItem('syllo_refresh_token', state.refreshToken);
        return true;
      } catch (e) { return 'network'; } finally { setTimeout(() => { refreshing = null; }, 0); }
    })();
  }
  return refreshing;
}
async function api(path, options = {}, retried = false) {
  if (state.demo) return demoApi(path, options);
  let res;
  try { res = await apiFetch(path, options); }
  catch (e) { if (e instanceof TypeError) { const t = new TypeError('Pas de connexion au serveur : vérifiez votre réseau.'); t.cause = e; throw t; } throw e; }
  const out = await apiHandle(res, path, options, retried);
  // Enregistrement réussi : le brouillon de l'écran n'a plus lieu d'être
  if (options.method && options.method !== 'GET' && !path.startsWith('/auth') && typeof draftKey === 'function') { try { localStorage.removeItem(draftKey()); } catch (e) {} }
  return out;
}
async function apiFetch(path, options) {
  const go = () => fetch(state.apiUrl.replace(/\/$/, '') + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.accessToken ? { Authorization: 'Bearer ' + state.accessToken } : {}),
      ...(localStorage.getItem('syllo_device_id') ? { 'x-device-id': localStorage.getItem('syllo_device_id') } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  // Serveur gratuit endormi ou réseau instable : on réessaie (lectures seulement) avant d'afficher une erreur claire.
  const safe = !options.method || options.method === 'GET';
  const waits = safe && navigator.onLine ? [0, 4000, 9000, 15000] : [0];
  let last;
  for (const w of waits) {
    if (w) await new Promise((r) => setTimeout(r, w));
    try { return await go(); } catch (e) { last = e; }
  }
  throw new TypeError(navigator.onLine ? 'Le serveur met quelques secondes à se réveiller. Patientez puis touchez « Actualiser » ou rechargez la page.' : 'Pas de connexion internet. Vérifiez votre réseau puis réessayez.');
}
/* Messages du serveur : tout ce qui arrive en anglais est traduit en français simple */
const FR_FIELDS = { email: 'l\'e-mail', password: 'le mot de passe', phone: 'le téléphone', firstName: 'le prénom', lastName: 'le nom', name: 'le nom', amount: 'le montant', quantity: 'la quantité', date: 'la date', siteId: 'le site', vehicleId: 'le véhicule', driverId: 'le chauffeur', itemId: 'l\'article', role: 'la fonction', licenseNumber: 'le numéro de permis', registrationNumber: 'la plaque', mileage: 'le kilométrage', liters: 'les litres', quantityLiters: 'les litres', price: 'le prix', description: 'la description', reason: 'le motif', code: 'le code', status: 'le statut' };
function frField(f) { return FR_FIELDS[f] || ('le champ « ' + f + ' »'); }
function frErr(m, status) {
  m = String(m || '').trim();
  const byStatus = { 400: 'Les informations envoyées ne sont pas valides.', 401: 'Session expirée : reconnectez-vous.', 403: 'Vous n\'avez pas le droit de faire cette action.', 404: 'Élément introuvable.', 409: 'Cet élément existe déjà.', 413: 'Le fichier est trop lourd.', 429: 'Trop de tentatives : patientez une minute puis réessayez.', 500: 'Erreur du serveur : réessayez dans un instant.', 502: 'Le serveur redémarre : réessayez dans une minute.', 503: 'Le serveur est momentanément indisponible : réessayez dans une minute.', 504: 'Le serveur met trop de temps à répondre : réessayez.' };
  if (!m) return byStatus[status] || 'Une erreur est survenue.';
  if (/[àâçéèêëîïôûùüÿœ]/i.test(m) || /^(Le |La |Les |Un |Une |Ce |Cet |Cette |Vous |Aucun|Impossible|Pas |Session|Fiche|Chauffeur|Article|Compte|Code|Mot de passe)/.test(m)) return m; // déjà en français
  const R = [
    [/^Forbidden resource$|^Forbidden$/i, () => byStatus[403]],
    [/^Unauthorized$/i, () => byStatus[401]],
    [/^Not Found$|^Cannot (GET|POST|PUT|PATCH|DELETE) /i, () => byStatus[404]],
    [/^Bad Request$/i, () => byStatus[400]],
    [/^Conflict$/i, () => byStatus[409]],
    [/^Internal server error$/i, () => byStatus[500]],
    [/^Too Many Requests|ThrottlerException/i, () => byStatus[429]],
    [/^Payload Too Large|request entity too large/i, () => byStatus[413]],
    [/^Service Unavailable|Bad Gateway|Gateway Timeout/i, () => byStatus[503]],
    [/^Failed to fetch|NetworkError|Load failed/i, () => 'Pas de connexion au serveur : vérifiez votre réseau.'],
    [/^Invalid credentials$/i, () => 'Identifiant ou mot de passe incorrect.'],
    [/^property (\w+) should not exist$/i, (x) => frField(x[1]) + ' n\'est pas attendu ici.'],
    [/^(\w+) should not be empty$/i, (x) => 'Remplissez ' + frField(x[1]) + '.'],
    [/^(\w+) must be an email$/i, () => 'L\'adresse e-mail n\'est pas valide.'],
    [/^(\w+) must be a string$/i, (x) => frField(x[1]) + ' doit être un texte.'],
    [/^(\w+) must be a (number|int|integer).*$|^(\w+) must be an integer number$/i, (x) => frField(x[1] || x[3]) + ' doit être un nombre.'],
    [/^(\w+) must not be less than (\S+)$/i, (x) => frField(x[1]) + ' doit être au moins ' + x[2] + '.'],
    [/^(\w+) must not be greater than (\S+)$/i, (x) => frField(x[1]) + ' ne doit pas dépasser ' + x[2] + '.'],
    [/^(\w+) must be (a )?positive number$/i, (x) => frField(x[1]) + ' doit être supérieur à zéro.'],
    [/^(\w+) must be longer than or equal to (\d+) characters$/i, (x) => frField(x[1]) + ' doit contenir au moins ' + x[2] + ' caractères.'],
    [/^(\w+) must be shorter than or equal to (\d+) characters$/i, (x) => frField(x[1]) + ' doit contenir au plus ' + x[2] + ' caractères.'],
    [/^(\w+) must be a valid ISO 8601 date string$|^(\w+) must be a Date instance$/i, (x) => frField(x[1] || x[2]) + ' doit être une date valide.'],
    [/^(\w+) must be one of the following values: (.*)$/i, (x) => frField(x[1]) + ' n\'a pas une valeur autorisée.'],
    [/^(\w+) must be a boolean value$/i, (x) => frField(x[1]) + ' doit être oui ou non.'],
    [/^(\w+) must be a UUID$|^(\w+) must be a mongodb id$/i, (x) => frField(x[1] || x[2]) + ' n\'est pas valide.'],
    [/^(\w+) must be an array$/i, (x) => frField(x[1]) + ' doit être une liste.'],
    [/^(\w+) must be a valid phone number$/i, () => 'Le numéro de téléphone n\'est pas valide.'],
    [/must match .* regular expression$/i, () => 'Le format saisi n\'est pas valide.'],
    [/Unique constraint failed/i, () => byStatus[409]],
    [/Record to (update|delete) not found|No .* found/i, () => byStatus[404]],
    [/Foreign key constraint/i, () => 'Cet élément est lié à d\'autres données et ne peut pas être modifié ainsi.'],
    [/timeout|timed out/i, () => byStatus[504]],
  ];
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  for (const [re, f] of R) { const x = m.match(re); if (x) return cap(f(x)); }
  // Message anglais non reconnu : on n'affiche pas d'anglais, seulement un message clair selon le type d'erreur
  if (/^[\x20-\x7E]+$/.test(m) && /\b(the|is|must|should|not|invalid|failed|error|cannot|required|found|already|exists)\b/i.test(m)) return byStatus[status] || 'Une erreur est survenue.';
  return m;
}
async function apiHandle(res, path, options, retried) {
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    const rs = await refreshSession();
    if (rs === 'network') throw new Error('Pas de connexion pour renouveler la session. Vos données sont conservées : réessayez dès que le réseau revient.');
    if (rs) return api(path, options, true);
    logout();
    throw new Error('Session expirée : reconnectez-vous.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    if (res.status === 402 && String(err.code || '').startsWith('LICENSE_')) { licScreen(err.code.slice(8), err.message); }
    const raw = Array.isArray(err.message) ? err.message : [err.message || err.error || ''];
    const ex = new Error([...new Set(raw.map((m) => frErr(m, res.status)))].join(' ')); ex.code = err.code; throw ex;
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.blob();
}

function togglePassword() {
  const i = document.getElementById('login-password');
  const show = i.type === 'password';
  i.type = show ? 'text' : 'password';
  document.getElementById('pw-toggle').innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-' + (show ? 'eye-off' : 'eye') + '"/></svg>';
}

/* ---------- ENVIRONNEMENT DE SIMULATION : comptes de test, bandeau d'avertissement ---------- */
var SIM = { on: false };
async function simBoot() {
  try {
    const base = (state.apiUrl || localStorage.getItem('syllo_api_url') || DEFAULT_API_URL).replace(/\/$/, '');
    const r = await fetch(base + '/health'); const j = await r.json();
    SIM.on = !!(j && j.simulation);
  } catch (e) { SIM.on = false; }
  if (!SIM.on) return;
  if (!document.getElementById('sim-bar')) {
    const b = document.createElement('div'); b.id = 'sim-bar';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2500;background:#C9A24D;color:#0F2747;font-weight:700;font-size:12px;text-align:center;padding:3px 6px;letter-spacing:.3px';
    b.textContent = 'MODE SIMULATION — données de test, la production n\'est pas touchée';
    document.body.appendChild(b); document.body.style.paddingTop = '22px';
  }
  try { applyRoleNav(); } catch (e) {}
}
setTimeout(simBoot, 80);
async function renderSimulation() {
  root().innerHTML = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-users"/></svg> Simulation de l'entreprise</h3>
    <div class="desc">Environnement de test isolé : tout ce que vous faites ici n'affecte jamais la production. Vous jouez le PDG avec votre compte ; préparez les comptes de test des autres espaces, installez chacun sur un téléphone, puis testez le circuit complet.</div>
    <button class="btn gold" style="margin-top:10px" onclick="simSetup()">Préparer les comptes de test et leurs invitations</button><div id="sim-msg"></div></div>
    <div id="sim-list"></div>
    <div class="panel"><h3>Scénario à tester</h3><ol style="margin:0;padding-left:18px;font-size:14px;line-height:1.7">
      <li>Vous (PDG) êtes connecté à votre espace.</li><li>Le Directeur Général de test crée le compte du Responsable logistique.</li>
      <li>Le Responsable logistique enregistre un chauffeur et lui envoie l'invitation WhatsApp.</li><li>Le chauffeur installe l'application, crée son mot de passe et retrouve son tableau de bord.</li>
      <li>Le Responsable logistique suit l'activité du chauffeur ; le Directeur Général et vous consultez ce qui relève de vos responsabilités.</li></ol></div>`;
}
async function simSetup() {
  const m = document.getElementById('sim-msg'), box = document.getElementById('sim-list'); m.innerHTML = '<div class="empty">Préparation…</div>';
  try {
    const link = location.origin + location.pathname.replace(/index\.html$/, '');
    const r = await api('/simulation/setup', { method: 'POST', body: { appUrl: link } }); window._simAcc = r.accounts;
    m.innerHTML = '<div class="msg ok">Comptes de test prêts. Chaque lien est personnel, valable 72 h et à usage unique.</div>';
    box.innerHTML = `<div class="panel"><h3>Comptes de test</h3>${r.accounts.map((a, i) => `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><b>${esc(a.name)}</b> <span class="badge warn">TEST</span><div style="font-size:12px;color:var(--muted)">${esc(a.label)} · connexion : ${esc(a.phone)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><a class="btn small gold" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(a.message)}">Envoyer par WhatsApp</a><button class="btn small" onclick="navigator.clipboard.writeText(window._simAcc[${i}].message).then(()=>alert('Message copié.'))">Copier le message</button></div></div>`).join('')}</div>`;
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
/* ---------- Invitation WhatsApp : le collaborateur crée lui-même son mot de passe (lien individuel, 72 h, usage unique) ---------- */
function inviteClose() { const o = document.getElementById('inv-ov'); if (o) o.remove(); try { const u = new URL(location.href); u.searchParams.delete('invite'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) {} }
async function inviteBoot() {
  let t = ''; try { t = new URLSearchParams(location.search).get('invite') || ''; } catch (e) {}
  if (!t) return;
  const ov = document.createElement('div'); ov.id = 'inv-ov';
  ov.style.cssText = 'position:fixed;inset:0;z-index:3000;background:linear-gradient(160deg,#0F2747,#1B3C6B);overflow:auto;padding:16px;display:flex;align-items:flex-start;justify-content:center';
  ov.innerHTML = '<div class="panel" style="max-width:420px;width:100%;margin:24px auto"><div id="inv-body"><div class="empty">Vérification de votre invitation…</div></div></div>';
  document.body.appendChild(ov);
  const b = document.getElementById('inv-body');
  try {
    state.apiUrl = (state.apiUrl || localStorage.getItem('syllo_api_url') || DEFAULT_API_URL);
    const info = await api('/auth/invite/info', { method: 'POST', body: { token: t } });
    b.innerHTML = `<h3 style="margin:0 0 6px;color:var(--navy)">Bienvenue ${esc(info.firstName)}</h3><div style="font-size:13px;color:var(--muted);margin-bottom:10px">Créez votre mot de passe personnel. Ce lien est à usage unique.</div>
      <label>Nouveau mot de passe (8 caractères minimum)</label><input id="inv-pw1" type="password" autocomplete="new-password" />
      <label>Confirmez le mot de passe</label><input id="inv-pw2" type="password" autocomplete="new-password" />
      <button class="btn gold" style="width:100%;margin-top:10px" onclick="inviteSubmit()">Créer mon mot de passe</button><div id="inv-msg"></div>`;
  } catch (e) {
    b.innerHTML = `<div class="msg err">${esc((e && e.message) || "Lien d'invitation invalide ou expiré.")}</div><button class="btn" style="width:100%;margin-top:10px" onclick="inviteClose()">Aller à la connexion</button>`;
  }
}
async function inviteSubmit() {
  const t = new URLSearchParams(location.search).get('invite') || '', m = document.getElementById('inv-msg');
  const p1 = document.getElementById('inv-pw1').value, p2 = document.getElementById('inv-pw2').value;
  if (p1.length < 8) { m.innerHTML = '<div class="msg err">Le mot de passe doit contenir au moins 8 caractères.</div>'; return; }
  if (p1 !== p2) { m.innerHTML = '<div class="msg err">Les deux mots de passe ne sont pas identiques.</div>'; return; }
  try {
    const r = await api('/auth/invite/accept', { method: 'POST', body: { token: t, password: p1 } });
    inviteClose();
    const em = document.getElementById('login-email'); if (em && r.login) em.value = r.login;
    const lm = document.getElementById('login-msg'); if (lm) lm.innerHTML = '<div class="msg ok">Mot de passe créé. Connectez-vous avec votre numéro de téléphone et ce mot de passe.</div>';
    const pw = document.getElementById('login-password'); if (pw) pw.focus();
  } catch (e) { m.innerHTML = `<div class="msg err">${esc((e && e.message) || 'Erreur')}</div>`; }
}
setTimeout(inviteBoot, 60);
async function login() {
  const msg = document.getElementById('login-msg');
  msg.innerHTML = '';
  state.apiUrl = (document.getElementById('api-url').value || state.apiUrl || DEFAULT_API_URL).trim();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    msg.innerHTML = '<div class="msg err">Merci de renseigner votre e-mail (ou téléphone) et votre mot de passe.</div>';
    return;
  }

  try {
    localStorage.setItem('syllo_api_url', state.apiUrl);
    let fp = ''; try { fp = localStorage.getItem('syllo_fp') || ''; if (!fp) { fp = 'w' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('syllo_fp', fp); } } catch (e) {}
    const kind = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'MOBILE' : 'DESKTOP';
    const data = await api('/auth/login', { method: 'POST', body: { email, password, deviceFp: fp || undefined, deviceKind: kind, deviceName: (navigator.userAgent || '').slice(0, 110) } });
    state._pw = password;
    state.accessToken = data.accessToken;
    state.refreshToken = data.refreshToken;
    state.user = data.user;
    state.siteId = data.user.siteId || '';
    localStorage.setItem('syllo_access_token', state.accessToken);
    localStorage.setItem('syllo_refresh_token', state.refreshToken);
    localStorage.setItem('syllo_user', JSON.stringify(state.user));
    localStorage.setItem('syllo_site_id', state.siteId);
    enterApp();
  } catch (e) {
    msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  }
}

/* ---- Mode démonstration : 100 % dans le navigateur, données fictives, lecture seule. Aucun appel au serveur, aucune donnée réelle. ---- */
function demoData() {
  const now = Date.now(), h = (n) => new Date(now - n * 3600e3).toISOString(), mo = ['juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.'];
  return {
    asOf: new Date(now).toISOString(),
    fleet: { total: 35, active: 31, maintenance: 3, immobilized: 1, onMission: 19, available: 12, trucks: { total: 25, available: 9 } },
    missions: { inProgress: 19, today: 27, planned: 8, completionRate: 94, monthTotal: 412, previousMonthTotal: 389, byMonth: mo.map((l, i) => ({ key: 'm' + i, label: l, total: 300 + i * 22, completed: 280 + i * 20 })) },
    people: { drivers: 38, present: 33, absent: 5, staff: 21, staffReportsToday: 18 },
    expenses: { today: 18450000, month: 412300000, pendingApproval: 6 },
    hse: { openIncidents: 2, compliance: 96 },
    stock: { belowMinimum: 4, recent: [{ item: 'Gasoil (fût 200 L)', type: 'OUT', quantity: 12, at: h(2) }, { item: 'Filtre à huile 15W40', type: 'IN', quantity: 40, at: h(5) }, { item: 'Pneu 315/80 R22.5', type: 'OUT', quantity: 4, at: h(9) }] },
    synthesis: { missionsCompleted: 387, missionsTotal: 412, km: 184250, expensesValidated: 398600000, expensesPreviousMonth: 371200000, incidents: 2, compliance: 96 },
    alerts: [{ severity: 'WARNING', title: 'Vidange à prévoir', message: 'Camion DEMO-014 : prochaine vidange dans 300 km', at: h(3) }],
    safetyAlerts: [{ severity: 'CRITICAL', title: 'Permis bientôt expiré', message: 'Chauffeur fictif : permis expire dans 12 jours', at: h(6) }, { severity: 'INFO', title: 'Inspection véhicule', message: 'Contrôle mensuel terminé sur le site démo', at: h(20) }],
    budgetAlerts: [{ severity: 'WARNING', title: 'Budget carburant', message: 'Consommation à 87 % du budget mensuel', at: h(8) }],
  };
}
async function demoApi(path, options) {
  await new Promise((r) => setTimeout(r, 120));
  if (options && options.method && options.method !== 'GET') throw new Error('Mode démonstration : lecture seule, aucune donnée n\'est enregistrée.');
  if (path.startsWith('/vehicles/fleet-overview')) return demoFleet(/vehicleType=SERVICE/.test(path) ? 'SERVICE_VEHICLE' : 'TRUCK');
  if (/^\/vehicles\/[^/?]+\/dossier/.test(path)) return demoDossier(decodeURIComponent(path.split('/')[2]));
  if (path.startsWith('/dashboards/direction')) return demoDirection(path);
  if (path.startsWith('/dashboards/executive')) return demoData();
  if (path.startsWith('/staff?role=')) return [
    { id: 'd1', firstName: 'Mamadou', lastName: 'Diallo (fictif)', phone: '620 00 00 01', role: 'CHAUFFEUR', status: 'ACTIVE', neverConnected: false },
    { id: 'd2', firstName: 'Aïssatou', lastName: 'Barry (fictif)', phone: '620 00 00 02', role: 'MAGASINIER', status: 'ACTIVE', neverConnected: false },
    { id: 'd3', firstName: 'Ibrahima', lastName: 'Camara (fictif)', phone: '620 00 00 03', role: 'CHAUFFEUR', status: 'ACTIVE', neverConnected: true },
    { id: 'd4', firstName: 'Fatoumata', lastName: 'Sow (fictif)', phone: '620 00 00 04', role: 'GESTIONNAIRE_FLOTTE', status: 'DISABLED', neverConnected: false },
  ];
  return [];
}
function startDemo(role) {
  const logi = role === 'ADMIN_LOGISTIQUE';
  state.demo = true; state.accessToken = 'demo'; state.refreshToken = '';
  state.user = { id: 'demo', role: logi ? 'ADMIN_LOGISTIQUE' : 'DIRECTEUR_GENERAL', firstName: 'Démonstration', lastName: logi ? 'Responsable logistique' : 'Direction Générale', email: 'demo@syllogistique' };
  state.siteId = '';
  enterApp(); go(logi ? 'espace-logi' : 'dashboard');
  if (!document.getElementById('demo-banner')) {
    const b = document.createElement('div'); b.id = 'demo-banner';
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#1F3A5F;color:#fff;font-size:13px;text-align:center;padding:8px 12px;display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap';
    b.innerHTML = 'Mode démonstration — données fictives, lecture seule <button style="background:#C9A24D;color:#1F3A5F;border:0;border-radius:6px;padding:4px 10px;font-weight:700;cursor:pointer" onclick="logout()">Quitter la démonstration</button>';
    document.body.appendChild(b);
  }
}
function logout() {
  if (state.demo) { state.demo = false; const b = document.getElementById('demo-banner'); if (b) b.remove(); }
  // Révoque la session côté serveur (sans bloquer la déconnexion si le réseau est coupé)
  try { if (state.refreshToken && state.apiUrl) fetch(state.apiUrl.replace(/\/$/, '') + '/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(state.accessToken ? { Authorization: 'Bearer ' + state.accessToken } : {}) }, body: JSON.stringify({ refreshToken: state.refreshToken }) }).catch(() => {}); } catch (e) {}
  ['syllo_access_token', 'syllo_refresh_token', 'syllo_user'].forEach((k) => localStorage.removeItem(k));
  try { Object.keys(localStorage).filter((k) => k.startsWith('syllo_draft_')).forEach((k) => localStorage.removeItem(k)); } catch (e) {}
  state._pw = undefined; state.refreshToken = '';
  state.accessToken = ''; state.user = null; state.hist = []; state.view = null;
  const fab = document.getElementById('report-fab'); if (fab) fab.remove();
  document.getElementById('app').style.display = 'none';
  const da = document.getElementById('driver-app'); if (da) da.style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

/* ---------- Sécurité de l'appareil : déconnexion après inactivité et verrou par code PIN ---------- */
const IDLE_MS = 30 * 60000;           // 30 min sans activité : déconnexion (profils bureau)
const PIN_RELOCK_MS = 60000;           // verrou PIN si l'application est restée en arrière-plan plus d'une minute
let idleTimer = null, hiddenAt = 0;
function idleBump() {
  clearTimeout(idleTimer);
  if (!state.user || state.user.role === 'CHAUFFEUR') return; // le chauffeur garde sa session (saisies hors ligne) ; il peut utiliser le verrou PIN
  idleTimer = setTimeout(() => { logout(); const m = document.getElementById('login-msg'); if (m) m.innerHTML = '<div class="msg err">Session fermée après 30 minutes d\'inactivité. Reconnectez-vous.</div>'; }, IDLE_MS);
}
['click', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach((ev) => window.addEventListener(ev, idleBump, { passive: true }));
const pinKey = () => 'syllo_pin_' + ((state.user && state.user.id) || '');
async function pinHash(pin, salt) {
  const d = new TextEncoder().encode(salt + ':' + pin);
  const h = await crypto.subtle.digest('SHA-256', d);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function pinIsSet() { try { return !!localStorage.getItem(pinKey()); } catch (e) { return false; } }
function pinSetup() {
  const old = document.getElementById('pin-ov'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = 'pin-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(31,58,95,.6);z-index:4500;display:flex;align-items:center;justify-content:center;padding:18px;';
  ov.innerHTML = `<div class="panel" style="max-width:340px;width:100%"><h3><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg> Code PIN de l'appareil</h3><div class="desc">Choisissez un code de 4 à 6 chiffres. Il sera demandé quand l'application revient au premier plan.</div>
    <input id="pin-a" type="password" inputmode="numeric" maxlength="6" placeholder="Code PIN" autocomplete="off"><input id="pin-b" type="password" inputmode="numeric" maxlength="6" placeholder="Confirmer le code" autocomplete="off" style="margin-top:8px">
    <div id="pin-msg"></div><div class="row" style="margin-top:10px"><button class="btn" onclick="pinSave()">Enregistrer</button><button class="btn ghost" onclick="document.getElementById('pin-ov').remove()">Annuler</button></div></div>`;
  document.body.appendChild(ov);
}
async function pinSave() {
  const a = document.getElementById('pin-a').value, b = document.getElementById('pin-b').value, m = document.getElementById('pin-msg');
  if (!/^\d{4,6}$/.test(a)) { m.innerHTML = '<div class="msg err">Le code doit contenir 4 à 6 chiffres.</div>'; return; }
  if (a !== b) { m.innerHTML = '<div class="msg err">Les deux codes ne correspondent pas.</div>'; return; }
  const salt = Math.random().toString(36).slice(2);
  try { localStorage.setItem(pinKey(), JSON.stringify({ salt, hash: await pinHash(a, salt) })); } catch (e) { m.innerHTML = '<div class="msg err">Impossible d\'enregistrer le code sur cet appareil.</div>'; return; }
  document.getElementById('pin-ov').remove(); bellToast('Code PIN activé sur cet appareil.');
  if (state.view === 'settings') renderSettings();
}
function pinRemove() { try { localStorage.removeItem(pinKey()); } catch (e) {} bellToast('Code PIN désactivé.'); if (state.view === 'settings') renderSettings(); }
function pinLock() {
  if (!pinIsSet() || !state.user || document.getElementById('pin-lock')) return;
  const ov = document.createElement('div'); ov.id = 'pin-lock'; let fails = 0;
  ov.style.cssText = 'position:fixed;inset:0;background:var(--navy);z-index:6000;display:flex;align-items:center;justify-content:center;padding:18px;';
  ov.innerHTML = `<div class="panel" style="max-width:320px;width:100%;text-align:center"><h3><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg> Application verrouillée</h3><div class="desc">Entrez votre code PIN.</div>
    <input id="pin-in" type="password" inputmode="numeric" maxlength="6" autocomplete="off" style="text-align:center;font-size:20px"><div id="pin-err"></div>
    <button class="btn" style="width:100%;margin-top:10px" id="pin-ok">Déverrouiller</button><button class="btn ghost" style="width:100%;margin-top:6px" onclick="document.getElementById('pin-lock').remove();logout()">Se déconnecter</button></div>`;
  document.body.appendChild(ov);
  const go_ = async () => {
    let rec = null; try { rec = JSON.parse(localStorage.getItem(pinKey())); } catch (e) {}
    const v = document.getElementById('pin-in').value;
    if (rec && (await pinHash(v, rec.salt)) === rec.hash) { ov.remove(); return; }
    fails++; document.getElementById('pin-in').value = '';
    if (fails >= 5) { ov.remove(); logout(); return; }
    document.getElementById('pin-err').innerHTML = `<div class="msg err">Code incorrect (${5 - fails} essai(s) restant(s)).</div>`;
  };
  document.getElementById('pin-ok').onclick = go_;
  document.getElementById('pin-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') go_(); });
  setTimeout(() => { const i = document.getElementById('pin-in'); if (i) i.focus(); }, 50);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > PIN_RELOCK_MS) pinLock();
});
const pinPanel = () => `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg> Verrou de l'appareil</h3><div class="desc">Un code PIN protège l'application sur cet appareil. La session des profils bureau se ferme aussi après 30 minutes d'inactivité.</div>
  ${pinIsSet() ? '<div class="msg ok">Code PIN activé.</div><button class="btn ghost" onclick="pinRemove()">Désactiver le code PIN</button> <button class="btn" onclick="pinSetup()">Changer le code</button>' : '<button class="btn" onclick="pinSetup()">Activer un code PIN</button>'}</div>`;
/* ---------- Signaler un problème ---------- */
const APP_BUILD = '2026-11-17';
let LAST_ERR = '';
window.addEventListener('error', (e) => { LAST_ERR = String((e && e.message) || '').slice(0, 300); });
window.addEventListener('unhandledrejection', (e) => { LAST_ERR = String((e && e.reason && e.reason.message) || e.reason || '').slice(0, 300); });
function ensureReportFab() {
  if (document.getElementById('report-fab')) return;
  const b = document.createElement('button');
  b.id = 'report-fab'; b.type = 'button'; b.setAttribute('aria-label', 'Signaler un problème');
  b.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> <span>Signaler un problème</span>';
  b.onclick = openReportProblem;
  document.body.appendChild(b);
}
function openReportProblem() {
  const old = document.getElementById('report-ov'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = 'report-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(31,58,95,.55);z-index:4000;display:flex;align-items:center;justify-content:center;padding:18px;';
  const screen = (document.getElementById('view-title') && document.getElementById('view-title').textContent) || (typeof DRV !== 'undefined' && DRV.tab ? 'Application chauffeur : ' + DRV.tab : '');
  ov.innerHTML = `<div class="panel" style="max-width:420px;width:100%"><h3><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> Signaler un problème</h3>
    <div class="desc">L'écran, votre compte, l'appareil, le réseau et la dernière erreur sont joints automatiquement.</div>
    <label>Décrivez le problème en une phrase (facultatif)</label>
    <textarea id="rp-msg" rows="3" maxlength="500" style="width:100%"></textarea>
    <div id="rp-res"></div>
    <div class="row" style="margin-top:10px"><button class="btn" id="rp-send" onclick="sendProblemReport()">Envoyer</button><button class="btn ghost" onclick="document.getElementById('report-ov').remove()">Annuler</button></div></div>`;
  ov.dataset.screen = screen;
  document.body.appendChild(ov);
}
async function sendProblemReport() {
  const ov = document.getElementById('report-ov'), res = document.getElementById('rp-res');
  try {
    await api('/support/reports', { method: 'POST', body: {
      message: document.getElementById('rp-msg').value.trim() || undefined, screen: ov.dataset.screen || undefined,
      device: (navigator.userAgent || '').slice(0, 190), appVersion: APP_BUILD, network: navigator.onLine ? 'en ligne' : 'hors ligne', lastError: LAST_ERR || undefined } });
    res.innerHTML = '<div class="msg ok">Merci, votre signalement a été envoyé à l\'administration.</div>';
    setTimeout(() => { const o = document.getElementById('report-ov'); if (o) o.remove(); }, 1600);
  } catch (e) { res.innerHTML = `<div class="msg err">${esc(navigator.onLine ? e.message : 'Pas de réseau : réessayez dès que la connexion revient.')}</div>`; }
}
async function renderProblemReports() {
  const root = document.getElementById('view-root'); root.innerHTML = '<div class="panel">Chargement…</div>';
  try {
    const rows = await api('/support/reports');
    const lab = { NEW: ['Nouveau', 'bad'], IN_PROGRESS: ['En cours', 'warn'], SOLVED: ['Résolu', 'ok'] };
    root.innerHTML = `<div class="panel"><h3>${'<svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg>'} Signalements</h3><div class="desc">Problèmes signalés par les utilisateurs, avec le contexte envoyé automatiquement.</div>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Écran</th><th>Message</th><th>Contexte</th><th>Statut</th></tr></thead><tbody>${rows.map((r) => `<tr>
        <td>${esc(new Date(r.createdAt).toLocaleString('fr-FR'))}</td><td><b>${esc(r.userName)}</b><br><small>${esc(r.role)}</small></td><td>${esc(r.screen || '—')}</td><td>${esc(r.message || '—')}</td>
        <td><small>${esc(r.network || '')} · ${esc(r.appVersion || '')}${r.lastError ? '<br>Dernière erreur : ' + esc(r.lastError) : ''}<br>${esc((r.device || '').slice(0, 80))}</small></td>
        <td><select onchange="setProblemStatus('${esc(r.id)}', this.value)">${Object.keys(lab).map((k) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${lab[k][0]}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aucun signalement pour le moment.</div>'}</div>`;
  } catch (e) { root.innerHTML = `<div class="panel"><div class="msg err">${esc(e.message)}</div></div>`; }
}
async function setProblemStatus(id, status) { try { await api('/support/reports/' + id, { method: 'PATCH', body: { status } }); } catch (e) { alert(e.message); } }
function enterApp() {
  if (!state.demo) { ensureReportFab(); idleBump(); setTimeout(pinLock, 100); }
  if (state.user && state.user.mustChangePassword) { setTimeout(() => forcePasswordScreen(), 0); return; }
  if (state.user && state.user.role === 'CHAUFFEUR') { ensureReportFab(); setTimeout(() => drvEnter(), 0); return; }
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  const realMail = state.user.email && !/@(staff|driver)\.local$/.test(state.user.email);
  document.getElementById('user-name').textContent = realMail ? state.user.email : `${state.user.firstName} ${state.user.lastName}`;
  document.getElementById('user-role').textContent = roleLabel(state.user.role);
  document.getElementById('side-name').textContent = `${state.user.firstName} ${state.user.lastName}`;
  document.getElementById('side-role').textContent = roleLabel(state.user.role);
  spaceApply(); refreshAvatars(); loadMyPhoto(); buildBottomNav();
  loadSiteSwitch();
  applyRoleNav();
  const home = { RESPONSABLE_COMMERCIAL: 'dash-commercial', CAISSIER: 'caisse', GESTIONNAIRE_HSE: 'home', AGENT_HSE: 'espace', MECANICIEN: 'espace', POINTEUR: 'espace', SUPER_ADMIN: 'dashboard', DIRECTEUR_GENERAL: 'dashboard', ADMIN_LOGISTIQUE: 'home', MAGASINIER: 'home', COMPTABLE: 'home', RESPONSABLE_OPERATIONS: 'home', LECTEUR: 'home' }[state.user.role];
  go(home || 'dashboard');
  updateSyncPill();
  window.addEventListener('online', updateSyncPill);
  window.addEventListener('offline', updateSyncPill);
}

// Sélecteur d'entrepôt / site actif (visible s'il y en a plusieurs et que l'utilisateur n'est pas verrouillé sur un seul)
async function loadSiteSwitch() {
  const sel = document.getElementById('site-switch');
  try {
    const sites = (await api('/sites')).filter(s => s.status === 'ACTIVE');
    if (!state.siteId || !sites.some(s => s.id === state.siteId)) {
      if (sites[0]) { state.siteId = sites[0].id; localStorage.setItem('syllo_site_id', state.siteId); }
    }
    if (sites.length < 2) { sel.style.display = 'none'; return; }
    sel.innerHTML = sites.map(s => `<option value="${esc(s.id)}" ${s.id === state.siteId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    sel.style.display = '';
  } catch (e) { sel.style.display = 'none'; }
}
function switchSite(id) {
  state.siteId = id;
  localStorage.setItem('syllo_site_id', id);
  renderView(state.view);
}

function roleLabel(r) {
  return {
    SUPER_ADMIN: 'Super Administrateur', ADMIN_LOGISTIQUE: 'Administrateur Logistique',
    GESTIONNAIRE_FLOTTE: 'Gestionnaire de flotte', MAGASINIER: 'Magasinier',
    CHAUFFEUR: 'Chauffeur', LECTEUR: 'Superviseur',
    RESPONSABLE_COMMERCIAL: 'Responsable commercial', CAISSIER: 'Caissier',
    GESTIONNAIRE_HSE: 'Responsable HSE', AGENT_HSE: 'Agent HSE', COMPTABLE: 'Comptabilité', RESPONSABLE_OPERATIONS: 'Responsable des opérations',
    DIRECTEUR_GENERAL: 'Directeur Général', MECANICIEN: 'Mécanicien', POINTEUR: 'Pointeur',
  }[r] || esc(r);
}

function updateSyncPill() {
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if (navigator.onLine) { dot.className = 'dot'; label.textContent = 'Synchronisé'; }
  else { dot.className = 'dot offline'; label.textContent = 'Hors connexion'; }
}

const titles = {
  'signalements': 'Signalements',
  caisse: 'Caisse',
  ventes: 'Ventes',
  compta: 'Comptabilité',
  atelier: 'Atelier',
  personnel: 'Gestion du personnel', home: 'Accueil', dashboard: 'Tableau de bord', vehicles: 'Camions & Véhicules', trucks: 'Camions', 'fleet-trucks': 'Flotte — Camions', 'fleet-service': 'Flotte — Véhicules de service', 'service-vehicles': 'Véhicules de service', drivers: 'Chauffeurs',
  fuel: 'Carburant', maintenance: 'Maintenance', stock: 'Stocks', purchases: 'Achats & approvisionnement', needs: 'États des besoins', daily: 'Rapports journaliers', 'staff-hse': 'Agents HSE & rapports', 'staff-store': 'Magasiniers & rapports', 'my-report': 'Mon rapport du jour', 'espace': 'Mon espace de travail', 'pointage': 'Pointage des chauffeurs', 'pilotage': 'Tableau de bord Directeur Général', 'espace-logi': 'Espace Responsable logistique', 'staff-mech': 'Mécaniciens & rapports', 'staff-pointer': 'Pointeurs & rapports', 'staff-managers': 'Responsables', 'reports-truck': 'Rapports camions', 'reports-service': 'Rapports véhicules de service', 'reports-drivers': 'Rapports — chauffeurs & pointages', 'reports-stock': 'Rapports — stock', 'reports-hse': 'Rapports — HSE', 'ops-validation': 'Validation des fiches', 'reports-dg': 'Rapports — synthèse DG', 'enrol': 'Enrôlement WhatsApp',
  sync: 'Synchronisation', settings: 'Paramètres', 'driver-devices': 'Appareils chauffeurs', 'driver-sheets': 'Fiches de bord', 'driver-board': 'Suivi des chauffeurs', 'driver-missions': 'Historique des missions', 'driver-expenses': 'Dépenses chauffeurs',
  'dash-logistics': 'Achats & Approvisionnement', 'dash-stock': 'Entrepôt & Stocks', 'dash-commercial': 'Commercial & Caisse',
  'dash-fleet': 'Charroi & Flotte', 'dash-hse': 'HSE — Santé, Sécurité, Environnement',
};



/* ---------- Camions : types, roues, capacités (listes + « Autre ») ---------- */
const TRUCK_TYPES = [['BENNE', 'Camion benne'], ['REMORQUE', 'Camion remorque'], ['SEMI_REMORQUE', 'Semi-remorque'], ['PLATEAU', 'Camion plateau'], ['CITERNE', 'Camion-citerne'], ['PORTE_CHAR', 'Porte-char'], ['AUTRE', 'Autre']];
const TRUCK_WHEELS = [6, 8, 10, 12, 14, 16, 18, 20];
const TRUCK_CAPS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70];
const TON_CHOICES = [40, 45, 50, 55, 60];
const TRUCK_PRODUCTS = ['Bauxite', 'Gravier', 'Agrégats', 'Sable', 'Autre'];
const ttLabel = (c) => (TRUCK_TYPES.find(t => t[0] === c) || [0, c || '—'])[1];
function otherSel(id, opts, fmtOpt, ph, cur) {
  const has = cur !== undefined && cur !== null && cur !== '' && opts.map(String).includes(String(cur));
  const other = cur !== undefined && cur !== null && cur !== '' && !has;
  return `<select id="${id}" onchange="document.getElementById('${id}-o').style.display=this.value==='__o'?'block':'none'"><option value="">— Choisir —</option>${opts.map(o => `<option value="${o}"${has && String(cur) === String(o) ? ' selected' : ''}>${fmtOpt(o)}</option>`).join('')}<option value="__o"${other ? ' selected' : ''}>Autre…</option></select><input id="${id}-o" style="display:${other ? 'block' : 'none'};margin-top:6px" placeholder="${ph}" value="${other ? esc(cur) : ''}">`;
}
