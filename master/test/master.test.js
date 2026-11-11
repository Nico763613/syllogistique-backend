'use strict';
const test = require('node:test');
const assert = require('node:assert');
const auth = require('../src/auth');
const { Pool } = require('pg');
const { migrate } = require('../src/db');
const { createApp, bootstrapAdmin } = require('../src/server');

const cfg = { sessionSecret: 'x'.repeat(40), adminEmail: 'Owner@Test.com', adminPassword: 'MotDePasseSolide42', insecureCookies: true };
let server, base, pool; let cookie = '';

async function call(method, path, body, ck) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'master', cookie: ck ?? cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (sc && ck === undefined) cookie = sc.split(';')[0];
  return { status: r.status, json: await r.json().catch(() => null), headers: r.headers };
}

test.before(async () => {
  pool = new Pool({});
  await pool.query('drop table if exists master_recovery_codes, master_audit_log, master_admins cascade');
  await migrate(pool);
  assert.equal(await bootstrapAdmin(pool, cfg), true);
  assert.equal(await bootstrapAdmin(pool, cfg), false, 'ne recrée pas un second administrateur');
  server = createApp(pool, cfg); await new Promise((r) => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => server.close());

test('mots de passe : scrypt, politique de force', () => {
  const h = auth.hashPassword('MotDePasseSolide42');
  assert.ok(auth.verifyPassword('MotDePasseSolide42', h)); assert.ok(!auth.verifyPassword('autre', h));
  assert.ok(auth.passwordProblem('court')); assert.ok(auth.passwordProblem('tousenminuscules123')); assert.equal(auth.passwordProblem('MotDePasseSolide42'), null);
});
test('TOTP : vecteur de test RFC 6238 (SHA1)', () => {
  const secret = auth.base32(Buffer.from('12345678901234567890'));
  assert.equal(auth.totpAt(secret, Math.floor(59 / 30)), '287082');
  assert.equal(auth.totpAt(secret, Math.floor(1111111109 / 30)), '081804');
  assert.ok(auth.verifyTotp(secret, '287082', 59000)); assert.ok(!auth.verifyTotp(secret, '000000', 59000));
});
test('sessions signées : falsification et expiration refusées', () => {
  const t = auth.signSession({ aid: 1, exp: Date.now() + 1000 }, 's'.repeat(40));
  assert.ok(auth.readSession(t, 's'.repeat(40))); assert.equal(auth.readSession(t, 'z'.repeat(40)), null);
  assert.equal(auth.readSession(t.replace(/^./, 'A'), 's'.repeat(40)), null);
  assert.equal(auth.readSession(auth.signSession({ aid: 1, exp: Date.now() - 1 }, 's'.repeat(40)), 's'.repeat(40)), null);
});

test('API : rien sans connexion, rejet des requêtes d\'un autre site', async () => {
  assert.equal((await call('GET', '/api/me', undefined, '')).status, 401);
  assert.equal((await call('GET', '/api/audit', undefined, '')).status, 401);
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
  const r2 = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'master', origin: 'https://pirate.example' }, body: '{}' });
  assert.equal(r2.status, 403);
  assert.equal((await fetch(base + '/health')).status, 200);
  const ui = await fetch(base + '/'); assert.match(await ui.text(), /SYLLOGISTIQUE/); assert.equal(ui.headers.get('cache-control'), 'no-store');
});

test('parcours complet : mot de passe, activation 2FA, codes de secours, connexion avec code', async () => {
  let r = await call('POST', '/api/login', { email: 'owner@test.com', password: 'faux' }, '');
  assert.equal(r.status, 401);
  r = await call('POST', '/api/login', { email: 'owner@test.com', password: 'MotDePasseSolide42' });
  assert.equal(r.status, 200); assert.equal(r.json.next, 'enroll');
  assert.equal((await call('GET', '/api/me')).status, 401, 'pas d\'accès tant que la 2FA n\'est pas activée');
  const s = await call('GET', '/api/2fa/setup'); assert.match(s.json.uri, /^otpauth:\/\/totp\//); const secret = s.json.secret;
  assert.equal((await call('POST', '/api/2fa/confirm', { code: '000000' })).status, 401);
  const c = await call('POST', '/api/2fa/confirm', { code: auth.totpAt(secret, Math.floor(Date.now() / 30000)) });
  assert.equal(c.status, 200); assert.equal(c.json.codes.length, 8);
  const me = await call('GET', '/api/me'); assert.equal(me.json.email, 'owner@test.com');
  const audit = await call('GET', '/api/audit'); assert.ok(audit.json.some((l) => l.action === '2FA_ACTIVE'));
  await call('POST', '/api/logout', {}); cookie = '';
  // nouvelle connexion : mot de passe puis code
  r = await call('POST', '/api/login', { email: 'owner@test.com', password: 'MotDePasseSolide42' }); assert.equal(r.json.next, 'code');
  assert.equal((await call('POST', '/api/login/code', { code: '123456' })).status, 401);
  assert.equal((await call('POST', '/api/login/code', { code: auth.totpAt(secret, Math.floor(Date.now() / 30000)) })).status, 200);
  assert.equal((await call('GET', '/api/me')).status, 200);
  // code de secours : valable une seule fois
  cookie = ''; await call('POST', '/api/login', { email: 'owner@test.com', password: 'MotDePasseSolide42' });
  assert.equal((await call('POST', '/api/login/code', { code: c.json.codes[0] })).status, 200);
  cookie = ''; await call('POST', '/api/login', { email: 'owner@test.com', password: 'MotDePasseSolide42' });
  assert.equal((await call('POST', '/api/login/code', { code: c.json.codes[0] })).status, 401, 'code de secours déjà utilisé');
  // changement de mot de passe
  cookie = ''; await call('POST', '/api/login', { email: 'owner@test.com', password: 'MotDePasseSolide42' });
  await call('POST', '/api/login/code', { code: c.json.codes[1] });
  assert.equal((await call('POST', '/api/password', { current: 'faux', next: 'NouveauSolide4242' })).status, 401);
  assert.equal((await call('POST', '/api/password', { current: 'MotDePasseSolide42', next: 'court' })).status, 400);
  assert.equal((await call('POST', '/api/password', { current: 'MotDePasseSolide42', next: 'NouveauSolide4242' })).status, 200);
  cookie = '';
  assert.equal((await call('POST', '/api/login', { email: 'owner@test.com', password: 'MotDePasseSolide42' })).status, 401, 'ancien mot de passe refusé');
});

test('verrouillage après 5 mots de passe faux', async () => {
  cookie = '';
  await pool.query("update master_admins set failed_logins=0, locked_until=null where email='owner@test.com' returning id");
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/login', { email: 'owner@test.com', password: 'mauvais' + i })).status, 401);
  const r = await call('POST', '/api/login', { email: 'owner@test.com', password: 'NouveauSolide4242' });
  assert.equal(r.status, 423, 'même le bon mot de passe est refusé pendant le verrouillage');
  const a = await pool.query("select count(*)::int as n from master_audit_log where action='LOGIN_BLOQUE'"); assert.ok(a.rows[0].n >= 1);
});

// ---------- étape 2 : clients, licences, activation ----------
async function pub(method, path, body) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
test('clients et licences : création, activation unique, jeton signé, suspension, révocation', async () => {
  const a = (await pool.query("select id from master_admins where email='owner@test.com'")).rows[0];
  cookie = 'master_session=' + auth.signSession({ aid: a.id, stage: 'ok', exp: Date.now() + 600000 }, cfg.sessionSecret);
  assert.equal((await call('POST', '/api/clients', { name: '  ' })).status, 400);
  const cl = await call('POST', '/api/clients', { name: 'Transports Diallo', country: 'Guinée', brandColor: '#1a7f37', email: 'a@b.c' });
  assert.equal(cl.status, 200);
  assert.equal((await call('POST', `/api/clients/${cl.json.id}/licenses`, { permanent: false })).status, 400, 'date requise');
  assert.equal((await call('POST', `/api/clients/${cl.json.id}/licenses`, { expiresAt: '2001-01-01' })).status, 400, 'date passée refusée');
  const lic = await call('POST', `/api/clients/${cl.json.id}/licenses`, { expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(), maxDevices: 20 });
  assert.equal(lic.status, 200); assert.match(lic.json.code, /^SYLL-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  const stored = (await pool.query('select code_hash, code_hint from master_licenses where id=$1', [lic.json.id])).rows[0];
  assert.ok(!JSON.stringify(stored).includes(lic.json.code), 'le code n\'est jamais stocké en clair');
  // la liste n'expose jamais le code
  const list = await call('GET', '/api/clients'); assert.ok(!JSON.stringify(list.json).includes(lic.json.code));
  // activation : mauvais code, puis bon code
  assert.equal((await pub('POST', '/v1/activate', { code: 'SYLL-AAAAA-AAAAA-AAAAA-AAAAA', instanceId: 'instance-0001' })).status, 404);
  assert.equal((await pub('POST', '/v1/activate', { code: lic.json.code })).status, 400);
  const lower = lic.json.code.toLowerCase().replace(/-/g, ' ');
  const act = await pub('POST', '/v1/activate', { code: lower, instanceId: 'instance-0001', appVersion: '39' });
  assert.equal(act.status, 200); assert.ok(act.json.instanceKey && act.json.licenseId);
  const pk = (await pub('GET', '/v1/public-key')).json.publicKey;
  const lt = require('../src/license');
  const tok = lt.verifyToken(act.json.token, pk); assert.ok(tok); assert.equal(tok.status, 'ACTIVE'); assert.equal(tok.brand.name, 'Transports Diallo'); assert.equal(tok.maxDevices, 20);
  assert.equal(lt.verifyToken(act.json.token.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')), pk), null, 'jeton falsifié refusé');
  // réutilisation du code : refusée
  assert.equal((await pub('POST', '/v1/activate', { code: lic.json.code, instanceId: 'instance-0002' })).status, 409);
  assert.equal((await pub('POST', '/v1/activate', { code: lic.json.code, instanceId: 'instance-0001' })).status, 409);
  // contrôle périodique
  const chk = { licenseId: act.json.licenseId, instanceKey: act.json.instanceKey, instanceId: 'instance-0001' };
  let r = await pub('POST', '/v1/check', chk); assert.equal(r.status, 200); assert.equal(r.json.status, 'ACTIVE');
  assert.equal((await pub('POST', '/v1/check', { ...chk, instanceKey: 'faux' })).status, 401);
  assert.equal((await pub('POST', '/v1/check', { ...chk, instanceId: 'instance-0002' })).status, 401);
  // suspension (motif obligatoire) puis rétablissement
  assert.equal((await call('POST', `/api/licenses/${lic.json.id}/action`, { action: 'suspend' })).status, 400);
  assert.equal((await call('POST', `/api/licenses/${lic.json.id}/action`, { action: 'suspend', reason: 'impayé' })).status, 200);
  r = await pub('POST', '/v1/check', chk); assert.equal(r.json.status, 'SUSPENDED'); assert.equal(lt.verifyToken(r.json.token, pk).status, 'SUSPENDED');
  assert.equal((await call('POST', `/api/licenses/${lic.json.id}/action`, { action: 'reactivate' })).status, 200);
  assert.equal((await pub('POST', '/v1/check', chk)).json.status, 'ACTIVE');
  // expiration calculée
  await pool.query("update master_licenses set expires_at = now() - interval '1 day' where id=$1 returning id", [lic.json.id]);
  assert.equal((await pub('POST', '/v1/check', chk)).json.status, 'EXPIRED');
  await pool.query("update master_licenses set expires_at = now() + interval '5 day' where id=$1 returning id", [lic.json.id]);
  // nouveau code : l'ancienne installation n'est plus reconnue
  const nc = await call('POST', `/api/licenses/${lic.json.id}/action`, { action: 'newcode' }); assert.equal(nc.status, 200); assert.notEqual(nc.json.code, lic.json.code);
  assert.equal((await pub('POST', '/v1/check', chk)).status, 401);
  assert.equal((await pub('POST', '/v1/activate', { code: nc.json.code, instanceId: 'instance-0003' })).status, 200);
  // révocation définitive
  assert.equal((await call('POST', `/api/licenses/${lic.json.id}/action`, { action: 'revoke', reason: 'fin de contrat' })).status, 200);
  assert.equal((await call('POST', `/api/licenses/${lic.json.id}/action`, { action: 'reactivate' })).status, 400);
  assert.equal((await call('POST', `/api/licenses/${lic.json.id}/action`, { action: 'newcode' })).status, 400);
  // licence permanente : jamais expirée
  const perm = await call('POST', `/api/clients/${cl.json.id}/licenses`, { permanent: true });
  assert.equal(perm.status, 200);
  const act2 = await pub('POST', '/v1/activate', { code: perm.json.code, instanceId: 'instance-0009' });
  assert.equal(lt.verifyToken(act2.json.token, pk).permanent, true);
  // tout est tracé, et l'API d'administration reste fermée sans session
  const au = await call('GET', '/api/audit'); for (const k of ['CLIENT_CREE', 'LICENCE_CREEE', 'LICENCE_ACTIVEE', 'LICENCE_SUSPENDUE', 'LICENCE_REVOQUEE', 'ACTIVATION_REFUSEE']) assert.ok(au.json.some((l) => l.action === k), k);
  assert.equal((await call('GET', '/api/clients', undefined, '')).status, 401);
  assert.equal((await call('POST', '/api/licenses/1/action', { action: 'revoke', reason: 'x' }, '')).status, 401);
});
