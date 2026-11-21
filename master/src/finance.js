'use strict';
// Échéancier : calculs de dates, état d'une échéance et rappels automatiques (J-30 … J+60).
const FREQ = { MENSUEL: 1, SEMESTRIEL: 6, ANNUEL: 12 };
const COUNT = { MENSUEL: 12, SEMESTRIEL: 4, ANNUEL: 2 }; // nombre d'échéances générées d'avance
const CURRENCIES = ['GNF', 'USD', 'EUR', 'XOF'];
// Étapes de rappel : nombre de jours AVANT l'échéance (positif) ou APRÈS (négatif)
const STEPS = [[30, 'J-30', 'Notification préventive'], [15, 'J-15', 'Premier rappel'], [7, 'J-7', 'Rappel de paiement'], [1, 'J-1', 'Dernier rappel avant échéance'],
  [0, 'J', "Jour d'échéance : vérifier le paiement"], [-1, 'J+1', 'Retard de paiement'], [-7, 'J+7', 'Relance'], [-15, 'J+15', 'Alerte : retard important'],
  [-30, 'J+30', 'Suivi renforcé'], [-60, 'J+60', 'Décision de suspension à prendre']];

const ymd = (d) => new Date(d).toISOString().slice(0, 10);
function addMonths(date, n) { const d = new Date(date); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d; }
const daysTo = (due, now = new Date()) => Math.round((Date.parse(ymd(due)) - Date.parse(ymd(now))) / 864e5); // >0 : à venir, <0 : en retard
function etat(due, tolerance, now) {
  const d = daysTo(due, now);
  if (d > 30) return 'a_venir'; if (d >= 0) return d === 0 ? 'jour_j' : 'proche';
  return -d <= tolerance ? 'tolerance' : 'hors_tolerance';
}
// Pour d > 0 : l'étape atteinte est la plus petite valeur positive >= d ; pour d <= 0 : la plus négative >= d
function stepFor(d) {
  let best = null;
  for (const s of STEPS) { const ok = s[0] > 0 ? d <= s[0] : d <= s[0]; if (ok && (!best || s[0] < best[0])) best = s; }
  return best;
}

function dueDates(first, frequency) { const n = COUNT[frequency], m = FREQ[frequency]; return Array.from({ length: n }, (_, i) => ymd(addMonths(first, i * m))); }

// Contrôle les échéances ouvertes et notifie le Master Admin. Un rappel n'est enregistré que s'il a vraiment été envoyé.
async function runReminders(pool, notify, now = new Date()) {
  const { rows } = await pool.query(`select p.id, p.due_date::text as due, p.amount, l.currency, c.name as cname, l.id as lid
    from master_payments p join master_licenses l on l.id=p.license_id join master_clients c on c.id=l.client_id
    where p.status='DUE' and l.status not in ('REVOKED') and p.due_date < current_date + 31`);
  let sent = 0;
  for (const p of rows) {
    const d = daysTo(p.due, now); const st = stepFor(d); if (!st) continue;
    const have = await pool.query('select 1 from master_reminders where payment_id=$1 and step=$2', [p.id, st[1]]);
    if (have.rowCount) continue;
    const when = d > 0 ? `dans ${d} jour(s)` : d === 0 ? "aujourd'hui" : `en retard de ${-d} jour(s)`;
    const r = await notify('pay-' + p.id + '-' + st[1], `SYL MASTER — ${st[1]} — ${p.cname}`,
      `${st[2]}.\nEntreprise : ${p.cname}\nÉchéance : ${p.due} (${when})\nMontant : ${Number(p.amount).toLocaleString('fr-FR')} ${p.currency}\nAction : ouvrez Finance et confirmez le paiement dès réception.`);
    if (r && r.sent && r.sent.length) { await pool.query('insert into master_reminders(payment_id, step, channels) values ($1,$2,$3) on conflict do nothing returning payment_id', [p.id, st[1], r.sent.join(',')]); sent++; }
  }
  return { checked: rows.length, sent };
}
module.exports = { FREQ, COUNT, CURRENCIES, STEPS, addMonths, daysTo, etat, stepFor, dueDates, ymd, runReminders };
