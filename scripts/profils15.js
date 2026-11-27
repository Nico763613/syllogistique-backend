// Recette des 15 profils (base de test uniquement) : droits de consultation vérifiés CÔTÉ SERVEUR.
//
// Référence : les droits appliqués par le serveur (@Roles + RolesGuard), lus dans l'application compilée.
// Le script lit ces droits, crée un compte de chaque profil, puis appelle chaque écran de consultation
// (GET sans paramètre) avec chaque profil :
//   - profil NON autorisé  → doit recevoir 403 (sinon : FAILLE, le test échoue) ;
//   - profil autorisé      → ne doit pas recevoir 403 (sinon : anomalie signalée, à examiner).
// Il écrit aussi la matrice complète dans profils15-matrice.md (pièce jointe de la recette).
// Seules des lectures sont faites (aucune écriture hors création des comptes de test).
const fs = require('fs');
const path = require('path');
const B = process.env.SMOKE_URL || 'http://localhost:3000';
const SITE = '00000000-0000-0000-0000-000000000002';
const ROLES = ['SUPER_ADMIN', 'DIRECTEUR_GENERAL', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE', 'MAGASINIER', 'CHAUFFEUR', 'LECTEUR',
  'RESPONSABLE_COMMERCIAL', 'CAISSIER', 'GESTIONNAIRE_HSE', 'AGENT_HSE', 'MECANICIEN', 'POINTEUR', 'COMPTABLE', 'RESPONSABLE_OPERATIONS'];
let fails = 0, warns = 0;
const ok = (c, m, extra) => { console.log((c ? '✔ ' : '✘ ') + m + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 200))); if (!c) fails++; };
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const api = async (method, p, body, token, tries = 0) => {
  await sleep(330); // reste sous la limite générale de 200 requêtes par minute
  const r = await fetch(B + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let d = null; const ct = r.headers.get('content-type') || ''; if (ct.includes('json')) d = await r.json().catch(() => null); else await r.arrayBuffer();
  if (r.status === 429 && tries < 2) { console.log('… limite atteinte, pause de 61 s'); await sleep(61000); return api(method, p, body, token, tries + 1); }
  return { s: r.status, d };
};
const pause = (why) => { console.log(`… pause de 61 s (${why})`); return new Promise((res) => setTimeout(res, 61000)); };

// ---------- 1. Droits réellement appliqués : lus dans l'application compilée (métadonnées Nest) ----------
// On lit exactement ce que le serveur applique (@Roles, RolesGuard, @Public), y compris les listes de rôles
// regroupées sous un nom (ex. ...CASH_ROLES), au lieu d'analyser le texte des fichiers.
require(require.resolve('reflect-metadata', { paths: [path.join(__dirname, '..')] }));
const DIST = path.join(__dirname, '..', 'dist');
const { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } = require(require.resolve('@nestjs/common/constants', { paths: [DIST] }));
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.controller.js') ? [path.join(d, e.name)] : []); }
const endpoints = [];
for (const f of walk(DIST)) {
  const mod = require(f);
  for (const C of Object.values(mod)) {
    if (typeof C !== 'function') continue;
    const base = Reflect.getMetadata(PATH_METADATA, C); if (base === undefined) continue;
    const cRoles = Reflect.getMetadata('roles', C), cGuards = (Reflect.getMetadata(GUARDS_METADATA, C) || []).map((g) => g.name), cPublic = Reflect.getMetadata('isPublic', C);
    for (const k of Object.getOwnPropertyNames(C.prototype)) {
      const h = C.prototype[k]; if (k === 'constructor' || typeof h !== 'function') continue;
      if (Reflect.getMetadata(METHOD_METADATA, h) !== 0) continue; // 0 = GET (lecture seule)
      const sub = Reflect.getMetadata(PATH_METADATA, h);
      const roles = Reflect.getMetadata('roles', h) || cRoles || null;
      const guard = cGuards.concat((Reflect.getMetadata(GUARDS_METADATA, h) || []).map((g) => g.name)).includes('RolesGuard');
      if (Reflect.getMetadata('isPublic', h) || cPublic) continue;
      for (const sb of (Array.isArray(sub) ? sub : [sub])) {
        const full = '/' + [base, sb].map((x) => String(x || '').replace(/^\/|\/$/g, '')).filter(Boolean).join('/');
        if (full.includes(':')) continue;
        endpoints.push({ path: full, roles, guard, file: path.relative(DIST, f) });
      }
    }
  }
}
const uniq = new Map(); for (const e of endpoints) if (!uniq.has(e.path)) uniq.set(e.path, e);
const EPS = [...uniq.values()].sort((a, b) => a.path.localeCompare(b.path));
// Compte Chauffeur : limité à l'application chauffeur (même règle que JwtAuthGuard.driverAllowed)
const driverAllowed = (p) => /^\/(driver|auth|uploads|notifications|support)(\/|$)/.test(p) || ['/branding', '/license', '/health'].some((x) => p === x || p.startsWith(x + '/'));
const allowed = (e, role) => (role !== 'CHAUFFEUR' || driverAllowed(e.path)) && (!e.roles || !e.roles.length || e.roles.includes(role) || (role === 'DIRECTEUR_GENERAL' && e.roles.includes('LECTEUR')));

(async () => {
  console.log(`${EPS.length} écrans de consultation trouvés dans ${new Set(EPS.map((e) => e.file)).size} contrôleurs.`);
  const sansGarde = EPS.filter((e) => e.roles && e.roles.length && !e.guard);
  ok(sansGarde.length === 0, 'tout écran réservé à des rôles est bien protégé par RolesGuard', sansGarde.map((e) => e.path));

  // ---------- 2. Un compte par profil ----------
  const n = Date.now().toString().slice(-7), PW = 'Test1234x';
  let logins = 0;
  const CRED = {}; // identifiants finaux de chaque profil, pour se reconnecter quand le jeton (15 min) expire
  const login = async (email, password) => {
    login.last = { email, password };
    if (logins && logins % 4 === 0) await pause('limite de connexions par minute');
    logins++;
    const r = await api('POST', '/auth/login', { email, password }); const d = r.d || {};
    if (d.accessToken && d.user && d.user.mustChangePassword) {
      await api('POST', '/auth/change-password', { currentPassword: password, newPassword: password + 'N' }, d.accessToken);
      return (await login(email, password + 'N'));
    }
    return d.accessToken;
  };
  const T = { SUPER_ADMIN: await login('admin@syllogistique.local', 'ChangeMoi123!') };
  CRED.SUPER_ADMIN = login.last;
  ok(!!T.SUPER_ADMIN, 'connexion Super administrateur');
  for (const role of ROLES.slice(1)) {
    const email = `p15${role.toLowerCase()}${n}@test.gn`;
    const r = await api('POST', '/users', { firstName: 'Profil', lastName: role, email, password: PW, role, siteId: SITE }, T.SUPER_ADMIN);
    ok(r.s === 201, `compte de test ${role} créé`, r);
    T[role] = await login(email, PW);
    CRED[role] = login.last;
    ok(!!T[role], `connexion ${role}`);
  }

  // ---------- 3. Matrice : chaque écran × chaque profil ----------
  const rows = [];
  let failles = 0, anomalies = 0, regles = 0;
  for (const e of EPS) {
    const cells = [];
    for (const role of ROLES) {
      if (!T[role]) { cells.push('—'); continue; }
      let r = await api('GET', e.path, undefined, T[role]);
      if (r.s === 401) { // jeton expiré : on se reconnecte une fois, puis on refait la même demande
        T[role] = await login(CRED[role].email, CRED[role].password); CRED[role] = login.last;
        r = await api('GET', e.path, undefined, T[role]);
      }
      const want = allowed(e, role);
      if (!want && r.s !== 403) { failles++; console.log(`✘ FAILLE : ${role} accède à ${e.path} (${r.s}) alors que le code le réserve à ${e.roles.join(', ')}`); cells.push(`**${r.s}!**`); }
      else if (want && r.s === 403 && r.d && (r.d.code === 'DEVICE_BLOCKED' || /fiche chauffeur/.test(String(r.d.message || '')))) {
        // Refus voulu par une règle métier, pas par le rôle : l'espace chauffeur exige un appareil activé
        // (un seul appareil par chauffeur) et un compte lié à une fiche chauffeur. Ce circuit est testé ailleurs.
        regles++; cells.push('appareil');
      }
      else if (want && r.s === 403) { anomalies++; warns++; console.log(`⚠ à examiner : ${role} refusé sur ${e.path} (autorisé par @Roles)`); cells.push('403?'); }
      else cells.push(want ? (r.s >= 500 ? `${r.s}` : 'oui') : 'non');
      if (r.s >= 500) { console.log(`✘ erreur serveur ${r.s} : ${role} sur ${e.path}`); fails++; }
    }
    rows.push(`| \`${e.path}\` | ${cells.join(' | ')} |`);
  }
  ok(failles === 0, `aucun profil n'accède à un écran qui ne lui est pas réservé (${EPS.length} écrans × ${ROLES.length} profils)`, failles);
  console.log(`${regles} refus dus à une règle métier (appareil chauffeur non activé, compte sans fiche chauffeur).`);
  console.log(`${anomalies} refus à examiner (profil autorisé par le code mais refusé par le serveur).`);

  // ---------- 4. Rapport de période : dates obligatoires et vérifiées ----------
  {
    T.SUPER_ADMIN = await login(CRED.SUPER_ADMIN.email, CRED.SUPER_ADMIN.password); // jeton neuf
    let r = await api('GET', '/reports/period', undefined, T.SUPER_ADMIN);
    ok(r.s === 400, 'rapport de période sans dates → 400 avec message clair (et non une erreur serveur)', r);
    r = await api('GET', '/reports/period?from=2026-12-31&to=2026-01-01', undefined, T.SUPER_ADMIN);
    ok(r.s === 400, 'rapport de période avec dates inversées → 400', r.s);
    r = await api('GET', `/reports/period?siteId=${SITE}&from=2026-01-01&to=2026-12-31`, undefined, T.SUPER_ADMIN);
    ok(r.s === 200, 'rapport de période avec dates valides → 200', r.s);
    r = await api('GET', `/reports/period/export/pdf?siteId=${SITE}&from=2026-01-01&to=2026-12-31`, undefined, T.SUPER_ADMIN);
    ok(r.s === 200, 'export PDF du rapport de période → 200', r.s);
  }

  const abbr = { SUPER_ADMIN: 'SA', DIRECTEUR_GENERAL: 'DG', ADMIN_LOGISTIQUE: 'LOG', GESTIONNAIRE_FLOTTE: 'FLO', MAGASINIER: 'MAG', CHAUFFEUR: 'CHF', LECTEUR: 'LEC', RESPONSABLE_COMMERCIAL: 'COM', CAISSIER: 'CAI', GESTIONNAIRE_HSE: 'GHSE', AGENT_HSE: 'AHSE', MECANICIEN: 'MEC', POINTEUR: 'POI', COMPTABLE: 'CPT', RESPONSABLE_OPERATIONS: 'OPS' };
  const md = [`# Matrice des droits de consultation (15 profils) — résultat du serveur`, ``, `Généré par scripts/profils15.js le ${new Date().toISOString()} sur une base de test.`,
    `« oui » = accès accordé et prévu ; « non » = refus (403) prévu ; « 403? » = refus alors que le code l'autorise ; « NNN! » = accès NON prévu (faille) ; « appareil » = rôle autorisé mais refus voulu par la règle « un appareil activé par chauffeur ».`, ``,
    `| Écran | ${ROLES.map((r) => abbr[r]).join(' | ')} |`, `|---|${ROLES.map(() => '---').join('|')}|`, ...rows, ``,
    `Légende : ${ROLES.map((r) => `${abbr[r]} = ${r}`).join(', ')}.`].join('\n');
  fs.writeFileSync('profils15-matrice.md', md);
  console.log(fails ? `\n${fails} échec(s), ${warns} point(s) à examiner` : `\nProfils : tous les contrôles de sécurité sont passés (${warns} point(s) à examiner).`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
