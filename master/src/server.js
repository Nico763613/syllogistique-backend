'use strict';
// SYLLOGISTIQUE MASTER — étape 1 : connexion propriétaire (mot de passe + code à 2 étapes) et journal d'audit.
const http = require('http');
const fs = require('fs');
const path = require('path');
const auth = require('./auth');
const lic = require('./license');
const { makePool, migrate } = require('./db');

const UI = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');
const COOKIE = 'master_session';
const IDLE_MIN = 15; // déconnexion automatique après 15 minutes d'inactivité
const PUB = {};
for (const f of ['manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png']) PUB['/' + f] = fs.readFileSync(path.join(__dirname, 'public', f));
const PUB_TYPE = { '.json': 'application/manifest+json', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png' };
const MAX_FAILS = 5, LOCK_MIN = 15;

function createApp(pool, cfg) {
  const secret = cfg.sessionSecret;
  const secure = !cfg.insecureCookies;
  const tries = new Map(); // limitation par adresse IP
  const v1tries = new Map();
  const rtries = new Map(); // tentatives de réinitialisation : 5 par 15 minutes
  function resetLimited(req) { const k = ip(req), now = Date.now(); const e = rtries.get(k) || { n: 0, t: now }; if (now - e.t > 15 * 60000) { e.n = 0; e.t = now; } e.n++; rtries.set(k, e); return e.n > 5; }
  let keysP = null; const keys = () => (keysP = keysP || lic.loadKeys(pool, secret));

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
    const isJson = typeof body === 'object' && !Buffer.isBuffer(body);
    res.writeHead(code, {
      'content-type': isJson ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; worker-src 'self'; manifest-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'",
      ...(secure ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
      ...extra,
    });
    res.end(isJson ? JSON.stringify(body) : body);
  }
  function sendFile(res, name, buf) {
    const ext = path.extname(name);
    res.writeHead(200, { 'content-type': PUB_TYPE[ext], 'cache-control': ext === '.png' ? 'public, max-age=86400' : 'no-cache', 'x-content-type-options': 'nosniff', ...(name === '/sw.js' ? { 'service-worker-allowed': '/' } : {}) });
    res.end(buf);
  }
  function sendCsv(res, name, rows) {
    const cell = (v) => { let t = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
    const out = '\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
    res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(out);
  }
  const cookie = (val, maxAge) => `${COOKIE}=${val}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  const readBody = (req) => new Promise((ok, ko) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 20000) { ko(new Error('trop gros')); req.destroy(); } }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { ko(e); } }); });
  function session(req) {
    const m = /(?:^|;\s*)master_session=([^;]+)/.exec(req.headers.cookie || '');
    return m ? auth.readSession(m[1], secret) : null;
  }
  const startSession = (res, p, minutes) => cookie(auth.signSession({ ...p, exp: Date.now() + minutes * 60000 }, secret), minutes * 60);


  // ---------- API appelée par les installations clientes (sans cookie) ----------
  function v1Limited(req) {
    const k = ip(req), now = Date.now(); const e = v1tries.get(k) || { n: 0, t: now };
    if (now - e.t > 60000) { e.n = 0; e.t = now; } e.n++; v1tries.set(k, e); return e.n > 60;
  }
  async function licenseToken(l, c) {
    const { privateKey } = await keys();
    const st = lic.effectiveStatus(l);
    return lic.signToken({ lid: Number(l.id), cid: Number(c.id), status: st, plan: l.plan, maxDevices: l.max_devices, permanent: l.permanent, expiresAt: l.expires_at || null,
      iid: l.instance_id, brand: { name: c.name, logoUrl: c.logo_url || null, color: c.brand_color || null }, iat: Date.now(), exp: Date.now() + 24 * 3600 * 1000 }, privateKey);
  }
  async function handleV1(req, res, p) {
    if (req.method === 'GET' && p === '/v1/public-key') return send(res, 200, { publicKey: (await keys()).publicPem });
    if (req.method !== 'POST') return send(res, 404, { error: 'Introuvable' });
    if (v1Limited(req)) return send(res, 429, { error: 'Trop de requêtes.' });
    const b = await readBody(req);
    if (p === '/v1/activate') {
      const instanceId = String(b.instanceId || '').slice(0, 100);
      if (instanceId.length < 8 || !b.code) return send(res, 400, { error: 'Code ou identifiant d\'installation manquant.' });
      const { rows } = await pool.query('select l.*, c.name as cname from master_licenses l join master_clients c on c.id=l.client_id where l.code_hash=$1', [lic.hashActivation(b.code)]);
      const l = rows[0];
      if (!l) { await audit(null, 'ACTIVATION_REFUSEE', 'code inconnu', req); return send(res, 404, { error: 'Code d\'activation invalide.' }); }
      if (l.status === 'REVOKED' || l.status === 'SUSPENDED') return send(res, 403, { error: 'Cette licence n\'est pas active. Contactez votre fournisseur.' });
      if (lic.effectiveStatus({ ...l, status: 'ACTIVE' }) === 'EXPIRED') return send(res, 403, { error: 'Cette licence a expiré.' });
      if (l.status === 'ACTIVE' && l.instance_id !== instanceId) { await audit(null, 'ACTIVATION_REFUSEE', 'code déjà utilisé (licence ' + l.id + ')', req); return send(res, 409, { error: 'Ce code a déjà été utilisé sur une autre installation.' }); }
      let instanceKey = null;
      if (l.status === 'PENDING') {
        instanceKey = lic.newInstanceKey();
        await pool.query("update master_licenses set status='ACTIVE', instance_id=$2, instance_url=$3, instance_key_hash=$4, app_version=$5, activated_at=now(), last_check_at=now(), last_check_ip=$6 where id=$1 returning id",
          [l.id, instanceId, String(b.instanceUrl || '').slice(0, 200) || null, lic.hashKey(instanceKey), String(b.appVersion || '').slice(0, 30) || null, ip(req)]);
        await audit(null, 'LICENCE_ACTIVEE', `client ${l.cname} · licence ${l.id}`, req);
      } else return send(res, 409, { error: 'Ce code a déjà été utilisé. Si la réponse a été perdue, demandez un nouveau code à votre fournisseur.' });
      const fresh = (await pool.query('select l.*, c.id as cid from master_licenses l join master_clients c on c.id=l.client_id where l.id=$1', [l.id])).rows[0];
      const c = (await pool.query('select * from master_clients where id=$1', [l.client_id])).rows[0];
      return send(res, 200, { licenseId: Number(l.id), instanceKey, token: await licenseToken(fresh, c), publicKey: (await keys()).publicPem });
    }
    if (p === '/v1/check') {
      const { rows } = await pool.query('select * from master_licenses where id=$1', [Number(b.licenseId) || 0]);
      const l = rows[0];
      if (!l || !l.instance_key_hash || !lic.safeEqual(lic.hashKey(b.instanceKey || ''), l.instance_key_hash) || l.instance_id !== String(b.instanceId || '')) return send(res, 401, { error: 'Licence non reconnue.' });
      await pool.query('update master_licenses set last_check_at=now(), last_check_ip=$2, app_version=coalesce($3, app_version) where id=$1 returning id', [l.id, ip(req), String(b.appVersion || '').slice(0, 30) || null]);
      // appareils remontés par l'installation (facultatif) : liste enregistrée, ordres de blocage / déconnexion renvoyés
      if (Array.isArray(b.devices)) {
        for (const d of b.devices.slice(0, 500)) {
          const did = String(d && d.id || '').slice(0, 100); if (!did) continue;
          await pool.query(`insert into master_devices(license_id, device_id, name, last_seen_at) values ($1,$2,$3,$4)
            on conflict (license_id, device_id) do update set name=excluded.name, last_seen_at=excluded.last_seen_at, disconnect_requested=false returning id`,
          [l.id, did, String(d.name || '').slice(0, 120) || null, d.lastSeenAt && !isNaN(new Date(d.lastSeenAt)) ? new Date(d.lastSeenAt).toISOString() : new Date().toISOString()]);
        }
      }
      const dv = (await pool.query('select device_id, blocked, disconnect_requested from master_devices where license_id=$1', [l.id])).rows;
      const c = (await pool.query('select * from master_clients where id=$1', [l.client_id])).rows[0];
      const out = { status: lic.effectiveStatus(l), token: await licenseToken(l, c), blockedDevices: dv.filter((d) => d.blocked).map((d) => d.device_id), disconnectDevices: dv.filter((d) => d.disconnect_requested).map((d) => d.device_id) };
      await pool.query('update master_devices set disconnect_requested=false where license_id=$1 and disconnect_requested returning id', [l.id]);
      return send(res, 200, out);
    }
    return send(res, 404, { error: 'Introuvable' });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x'); const p = url.pathname;
    if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return send(res, 200, UI);
    if (req.method === 'GET' && PUB[p]) return sendFile(res, p, PUB[p]);
    if (p.startsWith('/v1/')) return handleV1(req, res, p);
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
      return send(res, 200, { ok: true }, { 'set-cookie': startSession(res, { aid: a.id, stage: 'ok' }, IDLE_MIN) });
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
      return send(res, 200, { codes }, { 'set-cookie': startSession(res, { aid: a.id, stage: 'ok' }, IDLE_MIN) });
    }

    // ---- espace connecté ----
    if (!s || s.stage !== 'ok') return send(res, 401, { error: 'Non connecté.' });
    res.setHeader('set-cookie', startSession(res, { aid: s.aid, stage: 'ok' }, IDLE_MIN)); // session glissante : 15 min d'inactivité
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

    // ---------- clients et licences ----------
    const endOfDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(v + 'T23:59:59Z') : new Date(v));
    const str = (v, n = 200) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, n));
    const color = (v) => (/^#[0-9A-Fa-f]{6}$/.test(String(v || '')) ? v : null);
    const clientFields = (b) => [str(b.name, 120), str(b.contactName), str(b.email), str(b.phone, 40), str(b.country, 60), color(b.brandColor), str(b.logoUrl, 400), str(b.notes, 1000)];
    if (req.method === 'GET' && p === '/api/clients') {
      const { rows } = await pool.query(`select c.*, (select coalesce(json_agg(json_build_object('id', l.id, 'status', l.status, 'plan', l.plan, 'hint', l.code_hint, 'permanent', l.permanent,
          'expiresAt', l.expires_at, 'activatedAt', l.activated_at, 'lastCheckAt', l.last_check_at, 'maxDevices', l.max_devices, 'instanceUrl', l.instance_url, 'appVersion', l.app_version, 'reason', l.status_reason) order by l.id), '[]'::json)
          from master_licenses l where l.client_id=c.id) as licenses from master_clients c order by c.id desc`);
      return send(res, 200, rows.map((c) => ({ ...c, licenses: (typeof c.licenses === 'string' ? JSON.parse(c.licenses) : c.licenses).map((l) => ({ ...l, effective: lic.effectiveStatus({ status: l.status, permanent: l.permanent, expires_at: l.expiresAt }) })) })));
    }
    if (req.method === 'POST' && p === '/api/clients') {
      const f = clientFields(body); if (!f[0]) return send(res, 400, { error: 'Le nom du client est obligatoire.' });
      const { rows } = await pool.query('insert into master_clients(name, contact_name, email, phone, country, brand_color, logo_url, notes) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id', f);
      await audit(s.aid, 'CLIENT_CREE', f[0], req); return send(res, 200, { id: rows[0].id });
    }
    let m;
    if (req.method === 'POST' && (m = /^\/api\/clients\/(\d+)$/.exec(p))) {
      const f = clientFields(body); if (!f[0]) return send(res, 400, { error: 'Le nom du client est obligatoire.' });
      const r = await pool.query('update master_clients set name=$2, contact_name=$3, email=$4, phone=$5, country=$6, brand_color=$7, logo_url=$8, notes=$9 where id=$1 returning id', [Number(m[1]), ...f]);
      if (!r.rows.length) return send(res, 404, { error: 'Client introuvable.' });
      await audit(s.aid, 'CLIENT_MODIFIE', f[0], req); return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && (m = /^\/api\/clients\/(\d+)\/licenses$/.exec(p))) {
      const cl = (await pool.query('select * from master_clients where id=$1', [Number(m[1])])).rows[0]; if (!cl) return send(res, 404, { error: 'Client introuvable.' });
      const permanent = body.permanent === true; let exp = null;
      if (!permanent) { exp = body.expiresAt ? endOfDay(body.expiresAt) : null; if (!exp || isNaN(exp) || exp < new Date()) return send(res, 400, { error: 'Choisissez une date d\'expiration future, ou une licence permanente.' }); }
      const maxDevices = Math.min(Math.max(parseInt(body.maxDevices, 10) || 50, 1), 5000);
      const code = lic.newActivationCode();
      const r = await pool.query('insert into master_licenses(client_id, code_hash, code_hint, plan, max_devices, permanent, expires_at) values ($1,$2,$3,$4,$5,$6,$7) returning id',
        [cl.id, lic.hashActivation(code), lic.codeHint(code), str(body.plan, 40) || 'standard', maxDevices, permanent, exp ? exp.toISOString() : null]);
      await audit(s.aid, 'LICENCE_CREEE', `${cl.name} · licence ${r.rows[0].id}`, req);
      return send(res, 200, { id: r.rows[0].id, code });
    }
    if (req.method === 'POST' && (m = /^\/api\/licenses\/(\d+)\/action$/.exec(p))) {
      const l = (await pool.query('select l.*, c.name as cname from master_licenses l join master_clients c on c.id=l.client_id where l.id=$1', [Number(m[1])])).rows[0];
      if (!l) return send(res, 404, { error: 'Licence introuvable.' });
      const reason = str(body.reason, 300); const a = body.action;
      if (a === 'suspend' || a === 'revoke') {
        if (!reason) return send(res, 400, { error: 'Indiquez le motif.' });
        if (l.status === 'REVOKED') return send(res, 400, { error: 'Licence déjà révoquée.' });
        await pool.query('update master_licenses set status=$2, status_reason=$3 where id=$1 returning id', [l.id, a === 'suspend' ? 'SUSPENDED' : 'REVOKED', reason]);
        await audit(s.aid, a === 'suspend' ? 'LICENCE_SUSPENDUE' : 'LICENCE_REVOQUEE', `${l.cname} · licence ${l.id} · ${reason}`, req); return send(res, 200, { ok: true });
      }
      if (a === 'reactivate') {
        if (l.status !== 'SUSPENDED') return send(res, 400, { error: 'Seule une licence suspendue peut être rétablie.' });
        await pool.query("update master_licenses set status=$2, status_reason=null where id=$1 returning id", [l.id, l.instance_id ? 'ACTIVE' : 'PENDING']);
        await audit(s.aid, 'LICENCE_RETABLIE', `${l.cname} · licence ${l.id}`, req); return send(res, 200, { ok: true });
      }
      if (a === 'newcode') { // nouveau code : l'ancien est annulé et l'installation devra être réactivée
        if (l.status === 'REVOKED') return send(res, 400, { error: 'Licence révoquée : créez une nouvelle licence.' });
        const code = lic.newActivationCode();
        await pool.query("update master_licenses set code_hash=$2, code_hint=$3, status='PENDING', instance_id=null, instance_url=null, instance_key_hash=null, activated_at=null, status_reason=null where id=$1 returning id", [l.id, lic.hashActivation(code), lic.codeHint(code)]);
        await audit(s.aid, 'LICENCE_NOUVEAU_CODE', `${l.cname} · licence ${l.id}`, req); return send(res, 200, { code });
      }
      return send(res, 400, { error: 'Action inconnue.' });
    }
    // ---------- suppression, prolongation, appareils, export, réinitialisation ----------
    const effOf = (l) => lic.effectiveStatus(l);
    if (req.method === 'POST' && (m = /^\/api\/licenses\/(\d+)\/delete$/.exec(p))) {
      const l = (await pool.query('select l.*, c.name as cname from master_licenses l join master_clients c on c.id=l.client_id where l.id=$1', [Number(m[1])])).rows[0];
      if (!l) return send(res, 404, { error: 'Licence introuvable.' });
      const e = effOf(l);
      if (e !== 'REVOKED' && e !== 'EXPIRED') return send(res, 400, { error: 'Seule une licence révoquée ou expirée peut être supprimée. Révoquez-la d\'abord.' });
      await pool.query('delete from master_licenses where id=$1 returning id', [l.id]);
      await audit(s.aid, 'LICENCE_SUPPRIMEE', `${l.cname} · licence ${l.id} (${e})`, req); return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && (m = /^\/api\/clients\/(\d+)\/delete$/.exec(p))) {
      const cl = (await pool.query('select * from master_clients where id=$1', [Number(m[1])])).rows[0]; if (!cl) return send(res, 404, { error: 'Client introuvable.' });
      const ls = (await pool.query('select * from master_licenses where client_id=$1', [cl.id])).rows;
      if (ls.some((l) => effOf(l) === 'ACTIVE')) return send(res, 400, { error: 'Ce client a une licence active. Révoquez-la d\'abord.' });
      await pool.query('delete from master_clients where id=$1 returning id', [cl.id]); // licences et appareils supprimés en cascade
      await audit(s.aid, 'CLIENT_SUPPRIME', `${cl.name} · ${ls.length} licence(s) supprimée(s)`, req); return send(res, 200, { ok: true, licenses: ls.length });
    }
    if (req.method === 'POST' && (m = /^\/api\/licenses\/(\d+)\/extend$/.exec(p))) {
      const l = (await pool.query('select l.*, c.name as cname from master_licenses l join master_clients c on c.id=l.client_id where l.id=$1', [Number(m[1])])).rows[0];
      if (!l) return send(res, 404, { error: 'Licence introuvable.' });
      if (l.status === 'REVOKED') return send(res, 400, { error: 'Licence révoquée : créez une nouvelle licence.' });
      const permanent = body.permanent === true; let exp = l.expires_at;
      if (permanent) exp = null; else if (body.expiresAt) { const d = endOfDay(body.expiresAt); if (isNaN(d) || d < new Date()) return send(res, 400, { error: 'Choisissez une date future.' }); exp = d.toISOString(); }
      else if (!l.permanent) { /* seulement le nombre d'appareils */ } else return send(res, 400, { error: 'Choisissez une date ou laissez la licence permanente.' });
      const maxDevices = body.maxDevices ? Math.min(Math.max(parseInt(body.maxDevices, 10) || l.max_devices, 1), 5000) : l.max_devices;
      await pool.query('update master_licenses set permanent=$2, expires_at=$3, max_devices=$4 where id=$1 returning id', [l.id, permanent, exp, maxDevices]);
      await audit(s.aid, 'LICENCE_PROLONGEE', `${l.cname} · licence ${l.id} · ${permanent ? 'permanente' : (exp ? String(new Date(exp).toISOString()).slice(0, 10) : '—')} · ${maxDevices} appareils`, req);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && (m = /^\/api\/licenses\/(\d+)\/devices$/.exec(p))) {
      const { rows } = await pool.query('select device_id, name, last_seen_at, blocked, disconnect_requested from master_devices where license_id=$1 order by last_seen_at desc nulls last', [Number(m[1])]);
      return send(res, 200, rows);
    }
    if (req.method === 'POST' && (m = /^\/api\/licenses\/(\d+)\/devices\/action$/.exec(p))) {
      const a = body.action; const did = String(body.deviceId || '');
      if (!['block', 'unblock', 'disconnect'].includes(a)) return send(res, 400, { error: 'Action inconnue.' });
      const col = a === 'disconnect' ? 'disconnect_requested=true' : `blocked=${a === 'block'}`;
      const r = await pool.query(`update master_devices set ${col} where license_id=$1 and device_id=$2 returning id`, [Number(m[1]), did]);
      if (!r.rows.length) return send(res, 404, { error: 'Appareil introuvable.' });
      await audit(s.aid, 'APPAREIL_' + a.toUpperCase(), `licence ${m[1]} · ${did.slice(0, 40)}`, req); return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && (p === '/api/export/clients.csv' || p === '/api/export/licenses.csv')) {
      const rows = (await pool.query('select l.*, c.name as cname, c.country, c.contact_name, c.email, c.phone from master_licenses l right join master_clients c on c.id=l.client_id order by c.id, l.id')).rows;
      const day = new Date().toISOString().slice(0, 10); const d = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
      await audit(s.aid, 'EXPORT_CSV', p.split('/').pop(), req);
      if (p.endsWith('clients.csv')) {
        const cs = (await pool.query('select * from master_clients order by id')).rows;
        return sendCsv(res, `clients-${day}.csv`, [['N°', 'Client', 'Contact', 'Téléphone', 'E-mail', 'Pays', 'Créé le', 'Nombre de licences']].concat(cs.map((c) => [c.id, c.name, c.contact_name, c.phone, c.email, c.country, d(c.created_at), rows.filter((l) => String(l.client_id) === String(c.id)).length])));
      }
      const SL = { PENDING: 'En attente', ACTIVE: 'Active', SUSPENDED: 'Suspendue', REVOKED: 'Révoquée', EXPIRED: 'Expirée' };
      return sendCsv(res, `licences-${day}.csv`, [['N° licence', 'Client', 'Statut', 'Formule', 'Appareils max', 'Permanente', 'Expire le', 'Activée le', 'Dernier contact', 'Version', 'Code (4 derniers)']].concat(
        rows.filter((l) => l.id).map((l) => [l.id, l.cname, SL[effOf(l)] || effOf(l), l.plan, l.max_devices, l.permanent ? 'oui' : 'non', d(l.expires_at), d(l.activated_at), d(l.last_check_at), l.app_version, l.code_hint])));
    }
    if (req.method === 'POST' && p === '/api/reset') {
      if (resetLimited(req)) return send(res, 429, { error: 'Trop de tentatives.' });
      if (String(body.word || '').trim() !== 'SUPPRIMER') return send(res, 400, { error: 'Tapez exactement le mot SUPPRIMER.' });
      const a = (await pool.query('select * from master_admins where id=$1', [s.aid])).rows[0];
      if (!a || !a.totp_secret || !auth.verifyTotp(a.totp_secret, body.code)) { await audit(s.aid, 'REINIT_REFUSEE', 'code à 6 chiffres incorrect', req); return send(res, 401, { error: 'Code à 6 chiffres incorrect.' }); }
      const n = (await pool.query('select (select count(*) from master_clients)::int as c, (select count(*) from master_licenses)::int as l')).rows[0];
      await pool.query('delete from master_clients returning id'); // licences et appareils en cascade ; administrateurs, clés de signature et journal d'audit conservés
      await audit(s.aid, 'REINIT_TEST', `${n.c} client(s) et ${n.l} licence(s) supprimés`, req); return send(res, 200, { ok: true, clients: n.c, licenses: n.l });
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
