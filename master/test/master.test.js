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
  await pool.query('drop table if exists master_charge_reminders, master_charges, master_reminders, master_payments, master_devices, master_licenses, master_clients, master_recovery_codes, master_audit_log, master_admins cascade');
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
  const ui = await fetch(base + '/'); assert.match(await ui.text(), /SYL MASTER ADMIN/); assert.equal(ui.headers.get('cache-control'), 'no-store');
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
  // Tableau de bord : activité réelle sur la période et indicateurs de base de données
  const actv = await call('GET', '/api/activity?days=7'); assert.equal(actv.status, 200); assert.equal(actv.json.length, 7);
  assert.ok(actv.json.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day) && Number.isInteger(r.licenses) && Number.isInteger(r.mails) && Number.isInteger(r.reports)));
  const ov = await call('GET', '/api/overview'); assert.equal(ov.status, 200); assert.ok(ov.json.dbMb > 0);
  const cl = await call('POST', '/api/clients', { name: 'Transports Diallo', country: 'Guinée', brandColor: '#1a7f37', email: 'a@b.c' });
  assert.equal(cl.status, 200);
  assert.equal((await call('POST', `/api/clients/${cl.json.id}/folder`, { folder: 'Transport', subfolder: 'Conakry' })).status, 200, 'classement en dossier');
  assert.equal((await call('POST', '/api/clients/999999/folder', { folder: 'X' })).status, 404);
  const gl = await call('GET', '/api/global?from=2020-01-01&folder=Transport'); assert.equal(gl.status, 200); assert.ok(gl.json.some((r) => r.id === cl.json.id && r.reports === 0 && r.devices === 0), 'rapports globaux');
  const fl = (await call('GET', '/api/clients')).json.find((x) => x.id === cl.json.id); assert.equal(fl.folder, 'Transport'); assert.equal(fl.subfolder, 'Conakry');
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

// ---------- étape 3 : PWA, suppression, prolongation, appareils, export, réinitialisation ----------
test('PWA : manifest, service worker, icônes', async () => {
  const m = await fetch(base + '/manifest.json'); const j = await m.json();
  assert.equal(j.name, 'SYL MASTER ADMIN'); assert.equal(j.display, 'standalone'); assert.equal(j.theme_color, '#163A5F');
  assert.deepEqual(j.icons.map((i) => i.sizes).filter((v, i, a) => a.indexOf(v) === i), ['192x192', '512x512']);
  assert.equal((await fetch(base + '/sw.js')).headers.get('content-type').split(';')[0], 'application/javascript');
  for (const n of [192, 512]) { const r = await fetch(base + `/icon-${n}.png`); assert.equal(r.headers.get('content-type'), 'image/png'); assert.equal(Buffer.from(await r.arrayBuffer()).slice(1, 4).toString(), 'PNG'); }
});
test('suppression, prolongation, appareils, export CSV, réinitialisation', async () => {
  const a = (await pool.query("select id from master_admins where email='owner@test.com'")).rows[0];
  cookie = 'master_session=' + auth.signSession({ aid: a.id, stage: 'ok', exp: Date.now() + 600000 }, cfg.sessionSecret);
  const cl = await call('POST', '/api/clients', { name: '=Client Test' });
  const l1 = await call('POST', `/api/clients/${cl.json.id}/licenses`, { expiresAt: new Date(Date.now() + 864e5 * 40).toISOString().slice(0, 10), maxDevices: 5 });
  assert.equal(l1.status, 200);
  const exp = (await pool.query('select expires_at from master_licenses where id=$1', [l1.json.id])).rows[0].expires_at; assert.match(new Date(exp).toISOString(), /T23:59:59/);
  // une licence en attente ne se supprime pas ; un client avec licence active non plus
  assert.equal((await call('POST', `/api/licenses/${l1.json.id}/delete`, {})).status, 400);
  const act = await pub('POST', '/v1/activate', { code: l1.json.code, instanceId: 'instance-abcd1' }); assert.equal(act.status, 200);
  assert.equal((await call('POST', `/api/clients/${cl.json.id}/delete`, {})).status, 400, 'licence active : révoquer d\'abord');
  // prolongation + nombre d'appareils
  assert.equal((await call('POST', `/api/licenses/${l1.json.id}/extend`, { expiresAt: '2001-01-01' })).status, 400);
  assert.equal((await call('POST', `/api/licenses/${l1.json.id}/extend`, { expiresAt: new Date(Date.now() + 864e5 * 400).toISOString().slice(0, 10), maxDevices: 9 })).status, 200);
  assert.equal((await pool.query('select max_devices from master_licenses where id=$1', [l1.json.id])).rows[0].max_devices, 9);
  // appareils remontés, blocage, déconnexion
  const chk = { licenseId: act.json.licenseId, instanceKey: act.json.instanceKey, instanceId: 'instance-abcd1', devices: [{ id: 'tel-1', name: 'Téléphone Mamadou', lastSeenAt: new Date().toISOString() }] };
  let r = await pub('POST', '/v1/check', chk); assert.equal(r.status, 200); assert.deepEqual(r.json.blockedDevices, []);
  let ds = await call('GET', `/api/licenses/${l1.json.id}/devices`); assert.equal(ds.json.length, 1); assert.equal(ds.json[0].name, 'Téléphone Mamadou');
  assert.equal((await call('POST', `/api/licenses/${l1.json.id}/devices/action`, { deviceId: 'tel-1', action: 'block' })).status, 200);
  assert.deepEqual((await pub('POST', '/v1/check', chk)).json.blockedDevices, ['tel-1']);
  assert.equal((await call('POST', `/api/licenses/${l1.json.id}/devices/action`, { deviceId: 'tel-1', action: 'unblock' })).status, 200);
  assert.equal((await call('POST', `/api/licenses/${l1.json.id}/devices/action`, { deviceId: 'tel-1', action: 'disconnect' })).status, 200);
  assert.deepEqual((await pub('POST', '/v1/check', { ...chk, devices: undefined })).json.disconnectDevices, ['tel-1']);
  assert.deepEqual((await pub('POST', '/v1/check', { ...chk, devices: undefined })).json.disconnectDevices, [], 'ordre de déconnexion donné une seule fois');
  // export CSV : protégé, sans code complet, formule neutralisée
  assert.equal((await fetch(base + '/api/export/licenses.csv')).status, 401);
  const csv = await (await fetch(base + '/api/export/clients.csv', { headers: { cookie } })).text(); assert.match(csv, /"'=Client Test"/);
  const csv2 = await (await fetch(base + '/api/export/licenses.csv', { headers: { cookie } })).text(); assert.ok(!csv2.includes(l1.json.code)); assert.match(csv2, /Active/);
  // révocation puis suppression de la licence ; l'installation n'est plus reconnue
  assert.equal((await call('POST', `/api/licenses/${l1.json.id}/action`, { action: 'revoke', reason: 'test' })).status, 200);
  assert.equal((await call('POST', `/api/licenses/${l1.json.id}/delete`, {})).status, 200);
  assert.equal((await pub('POST', '/v1/check', chk)).status, 401);
  // suppression du client (cascade)
  const l2 = await call('POST', `/api/clients/${cl.json.id}/licenses`, { permanent: true });
  const d = await call('POST', `/api/clients/${cl.json.id}/delete`, {}); assert.equal(d.status, 200); assert.equal(d.json.licenses, 1);
  assert.equal((await pool.query('select count(*)::int as n from master_licenses where id=$1', [l2.json.id])).rows[0].n, 0);
  // réinitialisation : mot + code 2FA obligatoires, audit conservé
  await call('POST', '/api/clients', { name: 'A supprimer' });
  assert.equal((await call('POST', '/api/reset', { word: 'supprimer', code: '000000' })).status, 400);
  assert.equal((await call('POST', '/api/reset', { word: 'SUPPRIMER', code: '000000' })).status, 401);
  const sec = (await pool.query('select totp_secret from master_admins where id=$1', [a.id])).rows[0].totp_secret;
  const rs = await call('POST', '/api/reset', { word: 'SUPPRIMER', code: auth.totpAt(sec, Math.floor(Date.now() / 30000)) }); assert.equal(rs.status, 200);
  assert.equal((await call('GET', '/api/clients')).json.length, 0);
  const au = await call('GET', '/api/audit'); for (const k of ['LICENCE_SUPPRIMEE', 'CLIENT_SUPPRIME', 'LICENCE_PROLONGEE', 'REINIT_TEST', 'APPAREIL_BLOCK', 'EXPORT_CSV']) assert.ok(au.json.some((x) => x.action === k), k);
});
test('session glissante de 15 minutes', async () => {
  const a = (await pool.query("select id from master_admins where email='owner@test.com'")).rows[0];
  const ck = 'master_session=' + auth.signSession({ aid: a.id, stage: 'ok', exp: Date.now() + 600000 }, cfg.sessionSecret);
  const r = await fetch(base + '/api/me', { headers: { cookie: ck } }); const sc = r.headers.get('set-cookie'); assert.match(sc, /Max-Age=900/);
});
test('liaison BARAKA : résumé, déblocage et mot de passe provisoire via la clé, rien sans configuration', async () => {
  const a = (await pool.query("select id from master_admins where email='owner@test.com'")).rows[0];
  const ck = 'master_session=' + auth.signSession({ aid: a.id, stage: 'ok', exp: Date.now() + 600000 }, cfg.sessionSecret);
  delete process.env.BARAKA_URL; delete process.env.BARAKA_LINK_KEY;
  assert.equal((await call('GET', '/api/baraka/summary', undefined, ck)).status, 503, 'non configuré');
  const seen = [];
  const fake = require('http').createServer((rq, rs) => {
    seen.push([rq.method, rq.url, rq.headers['x-link-key']]);
    rs.setHeader('content-type', 'application/json');
    if (rq.headers['x-link-key'] !== 'cle-de-test') { rs.statusCode = 404; return rs.end('{"error":"Introuvable"}'); }
    if (rq.url.endsWith('/summary')) return rs.end('{"comptes":3,"verrouilles":1}');
    if (rq.url.endsWith('/users')) return rs.end('[{"id":"11111111-1111-1111-1111-111111111111","full_name":"Test","role":"livreur"}]');
    if (rq.url.endsWith('/unlock') || rq.url.endsWith('/block')) return rs.end('{"ok":true,"nom":"Test"}');
    return rs.end('{"ok":true,"nom":"Test","login":"620","temp_password":"ABCD2345","expires_hours":24}');
  });
  await new Promise((r) => fake.listen(0, r));
  process.env.BARAKA_URL = 'http://127.0.0.1:' + fake.address().port; process.env.BARAKA_LINK_KEY = 'cle-de-test';
  assert.equal((await call('GET', '/api/baraka/summary', undefined, '')).status, 401, 'connexion obligatoire');
  const sm = await call('GET', '/api/baraka/summary', undefined, ck); assert.equal(sm.status, 200); assert.equal(sm.json.comptes, 3);
  assert.equal((await call('GET', '/api/baraka/users', undefined, ck)).json.length, 1);
  const id = '11111111-1111-1111-1111-111111111111';
  assert.equal((await call('POST', `/api/baraka/users/${id}/unlock`, {}, ck)).json.ok, true);
  assert.equal((await call('POST', `/api/baraka/users/${id}/block`, {}, ck)).json.ok, true);
  assert.equal((await call('POST', `/api/baraka/users/${id}/reset-password`, {}, ck)).json.temp_password, 'ABCD2345');
  assert.equal((await call('POST', '/api/baraka/users/pas-un-id/unlock', {}, ck)).status, 404, 'identifiant invalide refusé');
  assert.ok(seen.every((x) => x[2] === 'cle-de-test'));
  const au = await call('GET', '/api/audit', undefined, ck); for (const k of ['BARAKA_DEBLOCAGE', 'BARAKA_BLOCAGE', 'BARAKA_NOUVEAU_MDP']) assert.ok(au.json.some((x) => x.action === k), k);
  process.env.BARAKA_LINK_KEY = 'mauvaise'; assert.equal((await call('GET', '/api/baraka/summary', undefined, ck)).status, 502, 'clé refusée par BARAKA');
  fake.close();
});

test('version de l\'écran : publique, stable, et injectée dans la page', async () => {
  const a = await (await fetch(base + '/api/version')).json(); assert.match(a.build, /^[0-9a-f]{10}$/);
  const html = await (await fetch(base + '/')).text(); assert.ok(html.includes("const BUILD = '" + a.build + "'"), 'la page connaît sa version');
});

test('finance : échéancier, confirmation manuelle, renouvellement, rappels sans doublon', async () => {
  const fin = require('../src/finance');
  const a = (await pool.query("select id from master_admins where email='owner@test.com'")).rows[0];
  const ck = 'master_session=' + auth.signSession({ aid: a.id, stage: 'ok', exp: Date.now() + 600000 }, cfg.sessionSecret);
  assert.equal((await call('GET', '/api/finance/schedule', undefined, '')).status, 401, 'rien sans connexion');
  const cl = await call('POST', '/api/clients', { name: 'Entreprise Finance' }, ck);
  const exp0 = new Date(Date.now() + 864e5 * 10).toISOString().slice(0, 10);
  const lic = await call('POST', `/api/clients/${cl.json.id}/licenses`, { expiresAt: exp0, maxDevices: 5 }, ck); assert.equal(lic.status, 200);
  const id = lic.json.id || lic.json.licenseId || (await pool.query('select max(id) as id from master_licenses')).rows[0].id;
  const due = fin.ymd(new Date(Date.now() + 864e5 * 5));
  assert.equal((await call('POST', `/api/licenses/${id}/billing`, { frequency: 'HEBDO', amount: 100, firstDue: due }, ck)).status, 400);
  assert.equal((await call('POST', `/api/licenses/${id}/billing`, { frequency: 'MENSUEL', amount: 0, firstDue: due }, ck)).status, 400);
  assert.equal((await call('POST', `/api/licenses/${id}/billing`, { frequency: 'MENSUEL', amount: 500000, currency: 'GNF', toleranceDays: 15, firstDue: due }, ck)).status, 200);
  let sc = (await call('GET', '/api/finance/schedule', undefined, ck)).json;
  assert.equal(sc.items.filter((x) => x.license_id == id).length, 12);
  assert.equal(sc.totaux.attendu, 12 * 500000); assert.equal(sc.totaux.recu_mois, 0, 'rien n\'est reçu tant que le Master Admin n\'a pas confirmé');
  // rappel : une seule fois par étape, et seulement s'il a été réellement envoyé
  const sentLog = []; const fake = async (k, t) => { sentLog.push(k); return { sent: ['ntfy'] }; };
  const r1 = await fin.runReminders(pool, fake); assert.equal(r1.sent, 1);
  const r2 = await fin.runReminders(pool, fake); assert.equal(r2.sent, 0, 'pas de doublon');
  const none = await fin.runReminders(pool, async () => ({ sent: [], skipped: 'no-channel' }), new Date(Date.now() + 864e5 * 20)); assert.equal(none.sent, 0, 'non envoyé = non enregistré');
  // confirmation : méthode obligatoire, puis renouvellement de la période payée
  const first = sc.items.find((x) => x.license_id == id);
  assert.equal((await call('POST', `/api/payments/${first.id}/confirm`, {}, ck)).status, 400);
  const c = await call('POST', `/api/payments/${first.id}/confirm`, { method: 'Orange Money', reference: 'OM123' }, ck); assert.equal(c.status, 200);
  assert.equal(c.json.expiresAt.slice(0, 10), fin.ymd(fin.addMonths(new Date(exp0 + 'T23:59:59Z'), 1)));
  assert.equal((await call('POST', `/api/payments/${first.id}/confirm`, { method: 'x' }, ck)).status, 404, 'déjà confirmée');
  sc = (await call('GET', '/api/finance/schedule', undefined, ck)).json;
  assert.equal(sc.totaux.recu_mois, 500000);
  const log = (await call('GET', '/api/audit', undefined, ck)).json; assert.ok(log.some((x) => x.action === 'PAIEMENT_CONFIRME'));
});
test('finance : calcul des états et des étapes de rappel', () => {
  const fin = require('../src/finance'); const now = new Date('2026-11-10T10:00:00Z');
  assert.equal(fin.etat('2026-12-30', 15, now), 'a_venir'); assert.equal(fin.etat('2026-11-15', 15, now), 'proche'); assert.equal(fin.etat('2026-11-10', 15, now), 'jour_j');
  assert.equal(fin.etat('2026-11-01', 15, now), 'tolerance'); assert.equal(fin.etat('2026-10-01', 15, now), 'hors_tolerance');
  assert.equal(fin.stepFor(40), null); assert.equal(fin.stepFor(20)[1], 'J-30'); assert.equal(fin.stepFor(0)[1], 'J'); assert.equal(fin.stepFor(-3)[1], 'J+1'); assert.equal(fin.stepFor(-90)[1], 'J+60');
  assert.deepEqual(fin.dueDates('2026-01-31', 'SEMESTRIEL'), ['2026-01-31', '2026-07-31', '2027-01-31', '2027-07-31']);
});

test('contrat à durée fixe : la fin de licence reste celle du contrat, même après des paiements mensuels', async () => {
  const fin = require('../src/finance');
  const a = (await pool.query("select id from master_admins where email='owner@test.com'")).rows[0];
  const ck = 'master_session=' + auth.signSession({ aid: a.id, stage: 'ok', exp: Date.now() + 600000 }, cfg.sessionSecret);
  const cl = await call('POST', '/api/clients', { name: 'Contrat 12 mois' }, ck);
  await call('POST', `/api/clients/${cl.json.id}/licenses`, { expiresAt: '2027-01-15', maxDevices: 3 }, ck);
  const id = (await pool.query('select max(id) as id from master_licenses')).rows[0].id;
  assert.equal((await call('POST', `/api/licenses/${id}/billing`, { frequency: 'MENSUEL', amount: 1000, firstDue: fin.ymd(new Date()), contractMonths: 99 }, ck)).status, 400);
  assert.equal((await call('POST', `/api/licenses/${id}/billing`, { frequency: 'MENSUEL', amount: 1000, firstDue: fin.ymd(new Date()), contractMonths: 12, contractStart: '2026-11-01' }, ck)).status, 200);
  let row = (await pool.query('select contract_months, expires_at::text as e from master_licenses where id=$1', [id])).rows[0];
  assert.equal(row.contract_months, 12); assert.match(row.e, /^2027-11-01/);
  const pay = (await pool.query("select id from master_payments where license_id=$1 order by due_date limit 1", [id])).rows[0];
  assert.equal((await call('POST', `/api/payments/${pay.id}/confirm`, { method: 'Espèces' }, ck)).status, 200);
  row = (await pool.query('select expires_at::text as e from master_licenses where id=$1', [id])).rows[0];
  assert.match(row.e, /^2027-11-01/, 'un paiement mensuel ne prolonge pas un contrat de 12 mois');
  const sc = (await call('GET', '/api/finance/schedule', undefined, ck)).json;
  assert.ok(sc.contrats.some((c) => c.license_id == id && c.contract_months === 12));
});
test('charges techniques : alerte 7 jours avant, une seule fois, avance après paiement', async () => {
  const fin = require('../src/finance');
  const a = (await pool.query("select id from master_admins where email='owner@test.com'")).rows[0];
  const ck = 'master_session=' + auth.signSession({ aid: a.id, stage: 'ok', exp: Date.now() + 600000 }, cfg.sessionSecret);
  assert.equal((await call('POST', '/api/charges', { name: '' }, ck)).status, 400);
  const due = fin.ymd(new Date(Date.now() + 864e5 * 6));
  const r = await call('POST', '/api/charges', { name: 'Render', provider: 'Render', amount: 7000, currency: 'USD', frequency: 'MENSUEL', nextDue: due, remindDays: 7 }, ck); assert.equal(r.status, 200);
  const logs = []; const fake = async (k, t) => { logs.push(t); return { sent: ['ntfy'] }; };
  assert.equal((await fin.runChargeReminders(pool, fake)).sent, 1); assert.match(logs[0], /ABONNEMENT À RENOUVELER — Render — J-7/);
  assert.equal((await fin.runChargeReminders(pool, fake)).sent, 0, 'pas de doublon');
  assert.equal((await fin.runChargeReminders(pool, async () => ({ sent: [] }), new Date(Date.now() + 864e5 * 5))).sent, 0, 'non envoyé = non enregistré');
  assert.equal((await fin.runChargeReminders(pool, fake, new Date(Date.now() + 864e5 * 5.5))).sent, 1, "J-1 : nouvelle étape, nouvelle alerte");
  const p = await call('POST', `/api/charges/${r.json.id}/paid`, {}, ck); assert.equal(p.status, 200); assert.equal(p.json.nextDue, fin.ymd(fin.addMonths(new Date(due + 'T12:00:00Z'), 1)));
  const l = (await call('GET', '/api/charges', undefined, ck)).json; assert.equal(l.find((c) => c.id === r.json.id).etat, 'a_venir');
  assert.equal(fin.chargeStep(10, 7), null); assert.equal(fin.chargeStep(7, 7), 7); assert.equal(fin.chargeStep(0, 7), 0); assert.equal(fin.chargeStep(-2, 7), -1);
});
