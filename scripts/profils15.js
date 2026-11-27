// Recette des 15 profils (base de test uniquement) : droits de consultation vérifiés CÔTÉ SERVEUR.
//
// Référence : les droits déclarés dans le code (@Roles sur chaque contrôleur ou méthode, appliqués par RolesGuard).
// Le script lit ces déclarations, crée un compte de chaque profil, puis appelle chaque écran de consultation
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

// ---------- 1. Lecture des droits déclarés dans le code ----------
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.controller.ts') ? [path.join(dir, e.name)] : []); }
const rolesOf = (txt) => { const m = txt.match(/@Roles\(([^)]*)\)/); return m ? [...m[1].matchAll(/RoleName\.(\w+)|'(\w+)'/g)].map((x) => x[1] || x[2]) : null; };
const endpoints = [];
for (const f of walk(path.join(__dirname, '..', 'src'))) {
  const src = fs.readFileSync(f, 'utf8');
  // Décorateurs de classe : tout ce qui se trouve entre la dernière importation et « export class ».
  const ci = src.indexOf('export class');
  const head = ci < 0 ? '' : src.slice(0, ci);
  const lastImport = head.lastIndexOf('\nimport ');
  const classDecos = head.slice(lastImport < 0 ? 0 : head.indexOf('\n', lastImport + 1)).replace(/\/\/.*$/gm, '');
  const ctrl = (src.match(/@Controller\(\s*'([^']*)'\s*\)/) || [])[1];
  if (ctrl === undefined) continue;
  const classRoles = rolesOf(classDecos);
  const classGuard = /RolesGuard/.test(classDecos);
  const classPublic = /@Public\(\)/.test(classDecos);
  const re = /((?:\s*@\w+(?:\([^)]*\))?\s*)+)\s*(?:async\s+)?(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const decos = m[1];
    const g = decos.match(/@Get\(\s*(?:'([^']*)')?\s*\)/);
    if (!g) continue;
    const sub = g[1] || '';
    if (sub.includes(':') || /@Public\(\)/.test(decos) || classPublic) continue;
    const full = '/' + [ctrl, sub].filter(Boolean).join('/');
    const roles = rolesOf(decos) || classRoles;
    const guard = classGuard || /RolesGuard/.test(decos);
    endpoints.push({ path: full, roles, guard, file: path.relative(path.join(__dirname, '..'), f) });
  }
}
const uniq = new Map(); for (const e of endpoints) if (!uniq.has(e.path)) uniq.set(e.path, e);
const EPS = [...uniq.values()].sort((a, b) => a.path.localeCompare(b.path));
const allowed = (e, role) => !e.roles || !e.roles.length || e.roles.includes(role) || (role === 'DIRECTEUR_GENERAL' && e.roles.includes('LECTEUR'));

(async () => {
  console.log(`${EPS.length} écrans de consultation trouvés dans ${new Set(EPS.map((e) => e.file)).size} contrôleurs.`);
  const sansGarde = EPS.filter((e) => e.roles && e.roles.length && !e.guard);
  ok(sansGarde.length === 0, 'tout écran réservé à des rôles est bien protégé par RolesGuard', sansGarde.map((e) => e.path));

  // ---------- 2. Un compte par profil ----------
  const n = Date.now().toString().slice(-7), PW = 'Test1234x';
  let logins = 0;
  const login = async (email, password) => {
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
  ok(!!T.SUPER_ADMIN, 'connexion Super administrateur');
  for (const role of ROLES.slice(1)) {
    const email = `p15${role.toLowerCase()}${n}@test.gn`;
    const r = await api('POST', '/users', { firstName: 'Profil', lastName: role, email, password: PW, role, siteId: SITE }, T.SUPER_ADMIN);
    ok(r.s === 201, `compte de test ${role} créé`, r);
    T[role] = await login(email, PW);
    ok(!!T[role], `connexion ${role}`);
  }

  // ---------- 3. Matrice : chaque écran × chaque profil ----------
  const rows = [];
  let failles = 0, anomalies = 0;
  for (const e of EPS) {
    const cells = [];
    for (const role of ROLES) {
      if (!T[role]) { cells.push('—'); continue; }
      const r = await api('GET', e.path, undefined, T[role]);
      const want = allowed(e, role);
      if (!want && r.s !== 403) { failles++; console.log(`✘ FAILLE : ${role} accède à ${e.path} (${r.s}) alors que le code le réserve à ${e.roles.join(', ')}`); cells.push(`**${r.s}!**`); }
      else if (want && r.s === 403) { anomalies++; warns++; console.log(`⚠ à examiner : ${role} refusé sur ${e.path} (autorisé par @Roles)`); cells.push('403?'); }
      else cells.push(want ? (r.s >= 500 ? `${r.s}` : 'oui') : 'non');
      if (r.s >= 500) { console.log(`✘ erreur serveur ${r.s} : ${role} sur ${e.path}`); fails++; }
    }
    rows.push(`| \`${e.path}\` | ${cells.join(' | ')} |`);
  }
  ok(failles === 0, `aucun profil n'accède à un écran qui ne lui est pas réservé (${EPS.length} écrans × ${ROLES.length} profils)`, failles);
  console.log(`${anomalies} refus à examiner (profil autorisé par le code mais refusé par le serveur).`);

  const abbr = { SUPER_ADMIN: 'SA', DIRECTEUR_GENERAL: 'DG', ADMIN_LOGISTIQUE: 'LOG', GESTIONNAIRE_FLOTTE: 'FLO', MAGASINIER: 'MAG', CHAUFFEUR: 'CHF', LECTEUR: 'LEC', RESPONSABLE_COMMERCIAL: 'COM', CAISSIER: 'CAI', GESTIONNAIRE_HSE: 'GHSE', AGENT_HSE: 'AHSE', MECANICIEN: 'MEC', POINTEUR: 'POI', COMPTABLE: 'CPT', RESPONSABLE_OPERATIONS: 'OPS' };
  const md = [`# Matrice des droits de consultation (15 profils) — résultat du serveur`, ``, `Généré par scripts/profils15.js le ${new Date().toISOString()} sur une base de test.`,
    `« oui » = accès accordé et prévu ; « non » = refus (403) prévu ; « 403? » = refus alors que le code l'autorise ; « NNN! » = accès NON prévu (faille).`, ``,
    `| Écran | ${ROLES.map((r) => abbr[r]).join(' | ')} |`, `|---|${ROLES.map(() => '---').join('|')}|`, ...rows, ``,
    `Légende : ${ROLES.map((r) => `${abbr[r]} = ${r}`).join(', ')}.`].join('\n');
  fs.writeFileSync('profils15-matrice.md', md);
  console.log(fails ? `\n${fails} échec(s), ${warns} point(s) à examiner` : `\nProfils : tous les contrôles de sécurité sont passés (${warns} point(s) à examiner).`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
