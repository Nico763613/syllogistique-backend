// Test de fumée du backend démarré : santé, authentification, protection des routes, anti-force-brute, en-têtes de sécurité.
const B = process.env.SMOKE_URL || 'http://localhost:3000';
let fails = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };
const j = (path, opt = {}) => fetch(B + path, { ...opt, headers: { 'content-type': 'application/json', ...(opt.headers || {}) } });
(async () => {
  let r = await j('/health');
  ok(r.status === 200 && (await r.json()).status === 'ok', 'GET /health répond ok');
  ok(!!r.headers.get('x-content-type-options'), 'en-têtes Helmet présents');
  ok(!r.headers.get('x-powered-by'), 'X-Powered-By masqué');
  for (const f of ['/app/', '/app/core.js', '/app/chauffeur.js', '/app/appareils.js', '/app/marque.js', '/app/css/app.css']) { r = await j(f); ok(r.status === 200, 'interface servie : ' + f + ' (' + r.status + ')'); }
  r = await j('/vehicles'); ok(r.status === 401, 'route protégée sans jeton → 401 (reçu ' + r.status + ')');
  r = await j('/vehicles', { headers: { authorization: 'Bearer jeton.invalide.xx' } }); ok(r.status === 401, 'jeton invalide → 401');
  r = await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@syllogistique.local', password: 'mauvais-mot-de-passe' }) });
  ok(r.status === 401, 'mauvais mot de passe → 401 (reçu ' + r.status + ')');
  r = await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@syllogistique.local', password: 'ChangeMoi123!' }) });
  const body = await r.json().catch(() => ({}));
  ok(r.status === 201 || r.status === 200, 'connexion valide (reçu ' + r.status + ')');
  const tok = body.accessToken; ok(!!tok, 'jeton d’accès reçu');
  if (tok) {
    r = await j('/vehicles', { headers: { authorization: 'Bearer ' + tok } }); ok(r.status === 200, 'route protégée avec jeton → 200 (reçu ' + r.status + ')');
    r = await j('/vehicles', { method: 'POST', headers: { authorization: 'Bearer ' + tok }, body: JSON.stringify({ champInconnu: 1 }) }); ok(r.status === 400, 'validation : champs inconnus refusés → 400 (reçu ' + r.status + ')');
  }
  let got429 = false;
  for (let i = 0; i < 8 && !got429; i++) { r = await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'x@y.z', password: 'aaaaaaaa' }) }); got429 = r.status === 429; }
  ok(got429, 'anti-force-brute : 429 après trop de tentatives');
  console.log(fails ? `\n${fails} échec(s)` : '\nTest de fumée réussi'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
