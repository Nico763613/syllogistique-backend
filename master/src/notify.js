'use strict';
// Notification immédiate de l'administrateur général (HTTPS uniquement : les ports SMTP sont bloqués sur l'offre gratuite de Render).
// Canaux, tous facultatifs et pilotés par variables d'environnement (aucun secret dans le code) :
//  - E-mail via l'API HTTPS de Brevo : BREVO_API_KEY (clé « API », pas la clé SMTP), MAIL_FROM, MASTER_NOTIFY_EMAIL (sinon MASTER_ADMIN_EMAIL)
//  - Notification push sur téléphone via ntfy : NTFY_TOPIC (nom secret de votre choix), NTFY_SERVER (facultatif)
// Un échec de notification ne gêne jamais le serveur ; au plus un message par type d'alerte toutes les 10 minutes.
const https = require('https');
const last = new Map();
const GAP_MS = 10 * 60 * 1000;

function post(url, headers, body) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = https.request({ method: 'POST', hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, headers: { ...headers, 'content-length': Buffer.byteLength(body) }, timeout: 8000 }, (r) => { r.resume(); r.on('end', () => resolve(r.statusCode)); });
      req.on('error', () => resolve(0)); req.on('timeout', () => { req.destroy(); resolve(0); });
      req.end(body);
    } catch (e) { resolve(0); }
  });
}

function channels(env = process.env) {
  const c = [];
  const to = env.MASTER_NOTIFY_EMAIL || env.MASTER_ADMIN_EMAIL;
  if (env.BREVO_API_KEY && env.MAIL_FROM && to) c.push('email');
  if (env.NTFY_TOPIC) c.push('ntfy');
  return c;
}

async function notify(kind, title, text, env = process.env, now = Date.now()) {
  const t = last.get(kind) || 0;
  if (now - t < GAP_MS) return { sent: [], skipped: 'throttled' };
  const ch = channels(env); if (!ch.length) return { sent: [], skipped: 'no-channel' };
  last.set(kind, now);
  const sent = [];
  if (ch.includes('email')) {
    const from = /<([^>]+)>/.exec(env.MAIL_FROM); const to = env.MASTER_NOTIFY_EMAIL || env.MASTER_ADMIN_EMAIL;
    const code = await post('https://api.brevo.com/v3/smtp/email', { 'content-type': 'application/json', 'api-key': env.BREVO_API_KEY },
      JSON.stringify({ sender: { name: 'SYL MASTER ADMIN', email: (from ? from[1] : env.MAIL_FROM).trim() }, to: [{ email: to }], subject: title, textContent: text }));
    if (code >= 200 && code < 300) sent.push('email');
  }
  if (ch.includes('ntfy')) {
    const code = await post((env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '') + '/' + encodeURIComponent(env.NTFY_TOPIC), { Title: encodeURIComponent(title).slice(0, 200), Priority: 'high' }, text);
    if (code >= 200 && code < 300) sent.push('ntfy');
  }
  return { sent };
}
module.exports = { notify, channels };
