'use strict';
// Suivi de la sauvegarde quotidienne (GitHub Actions du dépôt privé de sauvegardes), en lecture seule.
// Facultatif : variables BACKUP_REPO (ex. Nico763613/syllogistique-sauvegardes-) et BACKUP_GH_TOKEN (jeton GitHub « fine-grained », lecture seule des Actions de ce seul dépôt).
const https = require('https');
function get(path, token) {
  return new Promise((resolve) => {
    const req = https.request({ hostname: 'api.github.com', path, method: 'GET', timeout: 8000, headers: { 'user-agent': 'syl-master', accept: 'application/vnd.github+json', authorization: 'Bearer ' + token } }, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { resolve({ status: r.statusCode, body: JSON.parse(d) }); } catch (e) { resolve({ status: r.statusCode, body: null }); } });
    });
    req.on('error', () => resolve({ status: 0, body: null })); req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: null }); });
    req.end();
  });
}
function summarize(runs, now = Date.now()) {
  const list = (runs || []).map((r) => ({ at: r.created_at, status: r.status, conclusion: r.conclusion }));
  const ok = list.find((r) => r.conclusion === 'success');
  const hours = ok ? Math.round((now - new Date(ok.at).getTime()) / 3600e3) : null;
  const state = !list.length ? 'UNKNOWN' : hours !== null && hours <= 36 ? 'OK' : 'STALE';
  return { state, lastSuccessAt: ok ? ok.at : null, hoursSinceSuccess: hours, runs: list.slice(0, 10) };
}
async function status(env = process.env) {
  if (!env.BACKUP_REPO || !env.BACKUP_GH_TOKEN) return { configured: false };
  const r = await get(`/repos/${env.BACKUP_REPO}/actions/runs?per_page=15`, env.BACKUP_GH_TOKEN);
  if (r.status !== 200 || !r.body) return { configured: true, error: 'Lecture GitHub impossible (jeton ou dépôt invalide, code ' + r.status + ').' };
  return { configured: true, ...summarize(r.body.workflow_runs) };
}
module.exports = { status, summarize };
