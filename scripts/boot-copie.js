// Démarrage de l'application sur une COPIE RESTAURÉE de la base (jamais la production).
//
// Utilisé par le test « Démarrage sur copie restaurée » du dépôt privé de sauvegardes :
// la copie est restaurée dans une base jetable, l'application démarre dessus, puis ce script
// ouvre chaque écran de consultation (GET sans paramètre) avec chaque compte actif de la copie.
//
// Confidentialité : le script n'affiche JAMAIS le contenu des réponses ni les adresses e-mail,
// seulement des codes de réponse, des chemins d'écran et des totaux.
// Les jetons sont signés avec la clé de test de ce démarrage (JWT_ACCESS_SECRET), connue de ce seul test :
// aucun mot de passe réel n'est utilisé ni nécessaire.
//
// Entrée : USERS_TSV = fichier « id<TAB>email<TAB>rôle<TAB>entreprise<TAB>site<TAB>département » (comptes actifs).
// Réussite : aucune erreur serveur (5xx) et aucun refus (403) sur un écran autorisé au rôle.
const fs = require('fs');
const path = require('path');
// Dossier de l'application construite (dépôt syllogistique-backend) : variable APP_DIR
const ROOT = path.resolve(process.env.APP_DIR || path.join(__dirname, '..'));
const B = process.env.SMOKE_URL || 'http://localhost:3000';
const jwt = require(require.resolve('jsonwebtoken', { paths: [ROOT] }));
const SECRET = process.env.JWT_ACCESS_SECRET;
if (!SECRET) { console.error('JWT_ACCESS_SECRET manquant'); process.exit(2); }

// ---------- Écrans de consultation, lus dans l'application compilée (même méthode que profils15.js) ----------
require(require.resolve('reflect-metadata', { paths: [ROOT] }));
const DIST = path.join(ROOT, 'dist');
const { PATH_METADATA, METHOD_METADATA } = require(require.resolve('@nestjs/common/constants', { paths: [DIST] }));
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.controller.js') ? [path.join(d, e.name)] : []); }
const eps = new Map();
for (const f of walk(DIST)) {
  const mod = require(f);
  for (const C of Object.values(mod)) {
    if (typeof C !== 'function') continue;
    const base = Reflect.getMetadata(PATH_METADATA, C); if (base === undefined) continue;
    const cRoles = Reflect.getMetadata('roles', C), cPublic = Reflect.getMetadata('isPublic', C);
    for (const k of Object.getOwnPropertyNames(C.prototype)) {
      const h = C.prototype[k]; if (k === 'constructor' || typeof h !== 'function') continue;
      if (Reflect.getMetadata(METHOD_METADATA, h) !== 0) continue; // GET uniquement
      if (Reflect.getMetadata('isPublic', h) || cPublic) continue;
      const sub = Reflect.getMetadata(PATH_METADATA, h);
      const roles = Reflect.getMetadata('roles', h) || cRoles || null;
      for (const sb of (Array.isArray(sub) ? sub : [sub])) {
        const full = '/' + [base, sb].map((x) => String(x || '').replace(/^\/|\/$/g, '')).filter(Boolean).join('/');
        if (full.includes(':')) continue;
        // Exports et envois : fichiers volumineux ou envoi d'e-mail, exclus du test de démarrage
        if (/\/(export|pdf|xlsx|excel|csv|send|email|whatsapp|download)(\/|$)/i.test(full)) continue;
        if (!eps.has(full)) eps.set(full, { path: full, roles });
      }
    }
  }
}
const EPS = [...eps.values()].sort((a, b) => a.path.localeCompare(b.path));
const driverAllowed = (p) => /^\/(driver|auth|uploads|notifications|support)(\/|$)/.test(p) || ['/branding', '/license', '/health'].some((x) => p === x || p.startsWith(x + '/'));
const allowed = (e, role) => (role !== 'CHAUFFEUR' || driverAllowed(e.path)) && (!e.roles || !e.roles.length || e.roles.includes(role) || (role === 'DIRECTEUR_GENERAL' && e.roles.includes('LECTEUR')));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(p, token, tries = 0) {
  await sleep(320); // sous la limite de 200 requêtes par minute
  let r;
  try { r = await fetch(B + p, { headers: token ? { authorization: 'Bearer ' + token } : {} }); }
  catch { return 0; }
  await r.arrayBuffer(); // contenu lu puis jeté, jamais affiché
  if (r.status === 429 && tries < 2) { await sleep(61000); return get(p, token, tries + 1); }
  return r.status;
}

(async () => {
  let fails = 0;
  const line = (ok, m) => { console.log((ok ? '✔ ' : '✘ ') + m); if (!ok) fails++; };
  line((await get('/health')) === 200, 'serveur démarré (/health 200)');
  line((await get('/app/')) === 200, 'application web servie (/app/ 200)');

  const users = fs.readFileSync(process.env.USERS_TSV, 'utf8').split('\n').filter(Boolean).map((l) => {
    const [id, email, role, organizationId, siteId, department] = l.split('\t');
    return { id, email, role, organizationId, siteId: siteId || undefined, department: department || undefined };
  }).filter((u, i, all) => {
    // MAX_PAR_ROLE (intégration continue) : limite le nombre de comptes testés par rôle pour rester sous la durée permise
    const max = Number(process.env.MAX_PAR_ROLE || 0);
    return !max || all.slice(0, i).filter((x) => x.role === u.role).length < max;
  });
  console.log(`${EPS.length} écrans de consultation ; ${users.length} compte(s) actif(s) dans la copie.`);
  const parRole = {};
  let total = 0, e5 = 0, refus = 0, metier = 0;
  for (const [i, u] of users.entries()) {
    const token = jwt.sign({ sub: u.id, email: u.email, role: u.role, organizationId: u.organizationId, siteId: u.siteId, department: u.department }, SECRET, { expiresIn: '2h' });
    const st = { ecrans: 0, ok: 0, e5: [], refus: [], metier: 0 };
    for (const e of EPS.filter((x) => allowed(x, u.role))) {
      const s = await get(e.path, token);
      st.ecrans++; total++;
      if (s >= 500 || s === 0) { st.e5.push(`${e.path} (${s})`); e5++; }
      else if (s === 403 || s === 401) {
        // Espace chauffeur sans appareil activé : refus voulu par la règle métier (un appareil par chauffeur)
        if (u.role === 'CHAUFFEUR' && e.path.startsWith('/driver')) { st.metier++; metier++; }
        else { st.refus.push(`${e.path} (${s})`); refus++; }
      } else st.ok++;
    }
    const nom = `compte ${i + 1} (${u.role})`;
    line(st.e5.length === 0, `${nom} : ${st.ok}/${st.ecrans} écrans ouverts sans erreur serveur` + (st.e5.length ? ` — ERREURS : ${st.e5.join(', ')}` : ''));
    if (st.refus.length) line(false, `${nom} : refus inattendus sur des écrans autorisés : ${st.refus.join(', ')}`);
    if (st.metier) console.log(`  · ${st.metier} refus voulus (espace chauffeur sans appareil activé)`);
    parRole[u.role] = (parRole[u.role] || 0) + 1;
  }
  const resume = [
    '## Démarrage sur copie restaurée — résultat',
    '',
    `- Écrans de consultation testés : ${EPS.length}`,
    `- Comptes actifs de la copie : ${users.length} (${Object.entries(parRole).map(([r, n]) => `${r} ×${n}`).join(', ')})`,
    `- Ouvertures d'écran : ${total} ; erreurs serveur (5xx) : ${e5} ; refus inattendus : ${refus} ; refus voulus (règle chauffeur) : ${metier}`,
    `- Verdict : ${fails === 0 ? 'CONFORME' : 'NON CONFORME (' + fails + ' anomalie(s))'}`,
  ].join('\n');
  console.log('\n' + resume);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, resume + '\n');
  process.exit(fails ? 1 : 0);
})();
