'use strict';
// Outils de sécurité sans dépendance externe : mots de passe (scrypt), code à 2 étapes (TOTP RFC 6238), sessions signées.
const crypto = require('crypto');

const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [alg, saltHex, keyHex] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64, SCRYPT);
    const want = Buffer.from(keyHex, 'hex');
    return key.length === want.length && crypto.timingSafeEqual(key, want);
  } catch { return false; }
}
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 12) return 'Le mot de passe doit contenir au moins 12 caractères.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Utilisez des majuscules, des minuscules et des chiffres.';
  return null;
}

// ---- TOTP ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function unbase32(str) {
  let bits = 0, val = 0; const out = [];
  for (const c of str.replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function newTotpSecret() { return base32(crypto.randomBytes(20)); }
function totpAt(secret, counter) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', unbase32(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}
function verifyTotp(secret, code, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code || '').trim())) return false;
  const c = Math.floor(now / 30000);
  for (const d of [-1, 0, 1]) if (totpAt(secret, c + d) === String(code).trim()) return true;
  return false;
}
function otpauthUri(email, secret) {
  return `otpauth://totp/${encodeURIComponent('SYLLOGISTIQUE MASTER:' + email)}?secret=${secret}&issuer=${encodeURIComponent('SYLLOGISTIQUE MASTER')}&digits=6&period=30`;
}

// ---- codes de secours ----
function newRecoveryCodes(n = 8) { return Array.from({ length: n }, () => crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})(.{5})/, '$1-$2')); }
const hashCode = (c) => crypto.createHash('sha256').update(String(c).trim().toUpperCase()).digest('hex');

// ---- sessions signées (cookie) ----
function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readSession(token, secret, now = Date.now()) {
  try {
    const [body, sig] = String(token).split('.');
    const want = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > now ? p : null;
  } catch { return null; }
}

module.exports = { hashPassword, verifyPassword, passwordProblem, newTotpSecret, totpAt, verifyTotp, otpauthUri, newRecoveryCodes, hashCode, signSession, readSession, base32 };
