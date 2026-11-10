'use strict';
// SYLLOGISTIQUE MASTER — étape 1 : connexion propriétaire (mot de passe + code à 2 étapes) et journal d'audit.
const http = require('http');
const fs = require('fs');
const path = require('path');
const auth = require('./auth');
const { makePool, migrate } = require('./db');

const UI = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');
const COOKIE = 'master_session';
const MAX_FAILS = 5, LOCK_MIN = 15;

function createApp(pool, cfg) {
  const secret = cfg.sessionSecret;
  const secure = !cfg.insecureCookies;
  const tries = new Map(); // limitation par adresse IP

  const ip = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const audit = (adminId, action, detail, req) =>
    pool.query('insert into master_audit_log(admin_id, action, detail, ip) values ($1,$2,$3,$4) returning id', [adminId || null, action, detail || null, req ? ip(req) : null]).catch(() => {});

  function tooMany(req) {
    const k = ip(req), now = Date.now(); const e = tries.get(k) || { n: 0, t: now };
    if (now - e.t > 15 * 60000) { e.n = 0; e.t = now; }
    e.n++; tries.set(k, e);
    return e.n > 20;
  }
  function send(res, code, body, extra = {}) {
    const isJson = typeof body === 'object';
    res.writeHead(code, {
      'content-type': isJson ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'",
      ...(secure ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
      ...extra,
    });
    res.end(isJson ? JSON.stringify(body) : body);
  }
  const cookie = (val, maxAge) => `${COOKIE}=${val}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  const readBody = (req) => new Promise((ok, ko) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 20000) { ko(new Error('trop gros')); req.destroy(); } }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { ko(e); } }); });
  function session(req) {
    const m = /(?:^|;\s*)master_session=([^;]+)/.exec(req.headers.cookie || '');
    return m ? auth.readSession(m[1], secret) : null;
  }
  const startSession = (res, p, minutes) => cookie(auth.signSession({ ...p, exp: Date.now() + minutes * 60000 }, secret), minutes * 60);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x'); const p = url.pathname;
    if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return send(res, 200, UI);
    if (!p.startsWith('/api/')) return send(res, 404, { error: 'Introuvable' });

    // Protection contre les requêtes venues d'un autre site
    if (req.method !== 'GET') {
      const o = req.headers.origin;
      if (req.headers['x-requested-with'] !== 'master' || (o && new URL(o).host !== req.headers.host)) return send(res, 403, { error: 'Requête refusée.' });
    }
    const s = session(req);
    const body = req.method === 'POST' ? await readBody(req) : {};

    if (req.method === 'POST' && p === '/api/login') {
      if (tooMany(req)) return send(res, 429, { error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
      const email = String(body.email || '').trim().toLowerCase();
      const { rows } = await pool.query('select * from master_admins where email=$1', [email]);
      const a = rows[0];
      if (a && a.locked_until && new Date(a.locked_until) > new Date()) { await audit(a.id, 'LOGIN_BLOQUE', 'compte verrouillé', req); return send(res, 423, { error: 'Compte verrouillé 15 minutes après trop d\'erreurs.' }); }
      if (!a || !auth.verifyPassword(String(body.password || ''), a.password_hash)) {
        if (a) {
          const fails = a.failed_logins + 1;
          await pool.query('update master_admins set failed_logins=$2, locked_until=$3 where id=$1 returning id', [a.id, fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60000) : null]);
        } else { auth.verifyPassword('x', 'scrypt$00$00'); }
        await audit(a && a.id, 'LOGIN_ECHEC', email, req);
        return send(res, 401, { error: 'Identifiants incorrects.' });
      }
      await pool.query('update master_admins set failed_logins=0, locked_until=null where id=$1 returning id', [a.id]);
      const stage = a.totp_enabled ? 'code' : 'enroll';
      return send(res, 200, { next: stage }, { 'set-cookie': startSession(res, { aid: a.id, stage }, 10) });
    }

    if (req.method === 'POST' && p === '/api/login/code') {
      if (!s || s.stage !== 'code') return send(res, 401, { error: 'Reconnectez-vous.' });
      if (tooMany(req)) return send(res, 429, { error: 'Trop de tentatives.' });
      const { rows } = await pool.query('select * from master_admins where id=$1', [s.aid]); const a = rows[0];
      const code = String(body.code || '').trim();
      let ok = a && a.totp_secret && auth.verifyTotp(a.totp_secret, code);
      if (!ok && a && /^[0-9A-Fa-f]{5}-[0-9A-Fa-f]{5}$/.test(code)) {
        const r = await pool.query('update master_recovery_codes set used_at=now() where id=(select id from master_recovery_codes where admin_id=$1 and code_hash=$2 and used_at is null limit 1) returning id', [a.id, auth.hashCode(code)]);
        ok = r.rows.length > 0; if (ok) await audit(a.id, 'CODE_SECOURS_UTILISE', null, req);
      }
      if (!ok) { await audit(a && a.id, 'CODE2_ECHEC', null, req); return send(res, 401, { error: 'Code incorrect.' }); }
      await pool.query('update master_admins set last_login_at=now() where id=$1 returning id', [a.id]);
      await audit(a.id, 'LOGIN_OK', null, req);
      return send(res, 200, { ok: true }, { 'set-cookie': startSession(res, { aid: a.id, stage: 'ok' }, 480) });
    }

    if (req.method === 'GET' && p === '/api/2fa/setup') {
      if (!s || s.stage !== 'enroll') return send(res, 401, { error: 'Reconnectez-vous.' });
      const { rows } = await pool.query('select * from master_admins where id=$1', [s.aid]); const a = rows[0];
      let sec = a.totp_secret;
      if (!sec) { sec = auth.newTotpSecret(); await pool.query('update master_admins set totp_secret=$2 where id=$1 returning id', [a.id, sec]); }
      return send(res, 200, { secret: sec, uri: auth.otpauthUri(a.email, sec) });
    }
    if (req.method === 'POST' && p === '/api/2fa/confirm') {
      if (!s || s.stage !== 'enroll') return send(res, 401, { error: 'Reconnectez-vous.' });
      const { rows } = await pool.query('select * from master_admins where id=$1', [s.aid]); const a = rows[0];
      if (!a.totp_secret || !auth.verifyTotp(a.totp_secret, body.code)) return send(res, 401, { error: 'Code incorrect. Vérifiez l\'heure de votre téléphone.' });
      const codes = auth.newRecoveryCodes();
      await pool.query('update master_admins set totp_enabled=true, last_login_at=now() where id=$1 returning id', [a.id]);
      await pool.query('delete from master_recovery_codes where admin_id=$1 returning id', [a.id]);
      for (const c of codes) await pool.query('insert into master_recovery_codes(admin_id, code_hash) values ($1,$2) returning id', [a.id, auth.hashCode(c)]);
      await audit(a.id, '2FA_ACTIVE', null, req);
      return send(res, 200, { codes }, { 'set-cookie': startSession(res, { aid: a.id, stage: 'ok' }, 480) });
    }

    // ---- espace connecté ----
    if (!s || s.stage !== 'ok') return send(res, 401, { error: 'Non connecté.' });
    if (req.method === 'GET' && p === '/api/me') {
      const { rows } = await pool.query('select email, last_login_at from master_admins where id=$1', [s.aid]);
      return rows[0] ? send(res, 200, rows[0]) : send(res, 401, { error: 'Non connecté.' });
    }
    if (req.method === 'POST' && p === '/api/logout') { await audit(s.aid, 'LOGOUT', null, req); return send(res, 200, { ok: true }, { 'set-cookie': cookie('', 0) }); }
    if (req.method === 'POST' && p === '/api/password') {
      const { rows } = await pool.query('select * from master_admins where id=$1', [s.aid]); const a = rows[0];
      if (!auth.verifyPassword(String(body.current || ''), a.password_hash)) return send(res, 401, { error: 'Mot de passe actuel incorrect.' });
      const prob = auth.passwordProblem(body.next); if (prob) return send(res, 400, { error: prob });
      await pool.query('update master_admins set password_hash=$2 where id=$1 returning id', [a.id, auth.hashPassword(body.next)]);
      await audit(a.id, 'MOT_DE_PASSE_CHANGE', null, req);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && p === '/api/audit') {
      const { rows } = await pool.query('select l.id, l.at, l.action, l.detail, l.ip, a.email from master_audit_log l left join master_admins a on a.id=l.admin_id order by l.id desc limit 50');
      return send(res, 200, rows);
    }
    return send(res, 404, { error: 'Introuvable' });
  }

  return http.createServer((req, res) => {
    handle(req, res).catch((e) => { console.error('[master]', e.message); if (!res.headersSent) send(res, 500, { error: 'Erreur du serveur.' }); });
  });
}

async function bootstrapAdmin(pool, cfg) {
  const { rows } = await pool.query('select count(*)::int as n from master_admins');
  if (rows[0].n > 0) return false;
  if (!cfg.adminEmail || !cfg.adminPassword) { console.warn('[master] Aucun administrateur : définissez MASTER_ADMIN_EMAIL et MASTER_ADMIN_PASSWORD.'); return false; }
  const prob = auth.passwordProblem(cfg.adminPassword); if (prob) throw new Error('MASTER_ADMIN_PASSWORD refusé : ' + prob);
  await pool.query('insert into master_admins(email, password_hash) values ($1,$2) returning id', [cfg.adminEmail.trim().toLowerCase(), auth.hashPassword(cfg.adminPassword)]);
  console.log('[master] Administrateur créé : ' + cfg.adminEmail + ' (double authentification à activer à la première connexion)');
  return true;
}

function configFromEnv(env = process.env) {
  const sessionSecret = env.MASTER_SESSION_SECRET || '';
  if (sessionSecret.length < 32) throw new Error('MASTER_SESSION_SECRET manquant ou trop court (32 caractères minimum).');
  return { sessionSecret, adminEmail: env.MASTER_ADMIN_EMAIL, adminPassword: env.MASTER_ADMIN_PASSWORD, insecureCookies: env.MASTER_INSECURE_COOKIES === '1', port: Number(env.PORT || 3100) };
}

if (require.main === module) {
  (async () => {
    const cfg = configFromEnv(); const pool = makePool();
    await migrate(pool); await bootstrapAdmin(pool, cfg);
    createApp(pool, cfg).listen(cfg.port, () => console.log('[master] en ligne sur le port ' + cfg.port));
  })().catch((e) => { console.error('[master] arrêt :', e.message); process.exit(1); });
}
module.exports = { createApp, bootstrapAdmin, configFromEnv };
