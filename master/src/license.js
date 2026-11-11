'use strict';
// Licences : codes d'activation à usage unique, clé de signature (Ed25519) et jetons de licence signés.
const crypto = require('crypto');

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I pour éviter les erreurs de saisie
function newActivationCode() {
  const g = () => Array.from(crypto.randomBytes(5), (b) => ALPHA[b % 32]).join('');
  return `SYLL-${g()}-${g()}-${g()}-${g()}`;
}
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SYLL/, '');
const hashActivation = (c) => crypto.createHash('sha256').update('syll:' + normCode(c)).digest('hex');
const codeHint = (c) => normCode(c).slice(-4);
const newInstanceKey = () => crypto.randomBytes(32).toString('base64url');
const hashKey = (k) => crypto.createHash('sha256').update(String(k)).digest('hex');
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---- clé de signature : générée au premier démarrage, chiffrée (AES-256-GCM) dans la base ----
function kek(secret) { return crypto.createHash('sha256').update('syll-kek:' + secret).digest(); }
function seal(text, secret) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', kek(secret), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function unseal(blob, secret) {
  const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', kek(secret), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
async function loadKeys(pool, secret) {
  const got = await pool.query("select key, value from master_settings where key in ('sign_private','sign_public')");
  const m = Object.fromEntries(got.rows.map((r) => [r.key, r.value]));
  if (m.sign_private && m.sign_public) return { privateKey: crypto.createPrivateKey(unseal(m.sign_private, secret)), publicPem: m.sign_public };
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }); const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  await pool.query("insert into master_settings(key, value) values ('sign_private',$1) on conflict (key) do nothing returning key", [seal(privPem, secret)]);
  await pool.query("insert into master_settings(key, value) values ('sign_public',$1) on conflict (key) do nothing returning key", [pubPem]);
  return loadKeys(pool, secret);
}
function signToken(payload, privateKey) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.sign(null, Buffer.from(body), privateKey).toString('base64url')}`;
}
function verifyToken(token, publicPem, now = Date.now()) {
  try {
    const [body, sig] = String(token).split('.');
    if (!crypto.verify(null, Buffer.from(body), crypto.createPublicKey(publicPem), Buffer.from(sig, 'base64url'))) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > now ? p : null;
  } catch { return null; }
}
// état réel d'une licence (l'expiration est calculée)
function effectiveStatus(l, now = Date.now()) {
  if (l.status === 'ACTIVE' && !l.permanent && l.expires_at && new Date(l.expires_at).getTime() < now) return 'EXPIRED';
  return l.status;
}
module.exports = { newActivationCode, normCode, hashActivation, codeHint, newInstanceKey, hashKey, safeEqual, loadKeys, signToken, verifyToken, effectiveStatus };
