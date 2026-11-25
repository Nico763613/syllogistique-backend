// Tests fonctionnels n°3 : HSE, maintenance, rapports du personnel et validations hiérarchiques, notifications.
const B = process.env.SMOKE_URL || 'http://localhost:3000';
const SITE = '00000000-0000-0000-0000-000000000002';
let fails = 0, tok = '';
const ok = (c, m, extra) => { console.log((c ? '✔ ' : '✘ ') + m + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); if (!c) fails++; };
const api = async (method, path, body, token = tok) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; const ct = r.headers.get('content-type') || ''; if (ct.includes('json')) data = await r.json().catch(() => null); else await r.arrayBuffer();
  return { s: r.status, d: data, ct };
};
const rows = (d) => Array.isArray(d) ? d : (d && (d.items || d.data || d.rows)) || [];
const n = Date.now().toString().slice(-7), PW = 'Test1234x', iso = (ms = 0) => new Date(Date.now() + ms).toISOString(), day = new Date().toISOString().slice(0, 10);
const is2 = (r) => r.s === 200 || r.s === 201, is4 = (r) => r.s >= 400 && r.s < 500;
(async () => {
  let r = await api('POST', '/auth/login', { email: 'admin@syllogistique.local', password: 'ChangeMoi123!' }, '');
  tok = r.d && r.d.accessToken; const admin = tok; ok(!!admin, 'connexion administrateur');
  const mk = (role, tag) => api('POST', '/users', { firstName: 'Test', lastName: tag, email: `${tag}${n}@test.gn`, password: PW, role, siteId: SITE });
  ok((await mk('AGENT_HSE', 'hse')).s === 201, 'création agent HSE'); ok((await mk('CHAUFFEUR', 'chf')).s === 201, 'création chauffeur (compte)');
  const login = async (tag) => (await api('POST', '/auth/login', { email: `${tag}${n}@test.gn`, password: PW }, '')).d?.accessToken;
  const hse = await login('hse'), chf = await login('chf'); ok(!!hse && !!chf, 'connexion agent HSE et chauffeur');

  // --- HSE
  const inc = { siteId: SITE, occurredAt: iso(-3600e3), type: 'ACCIDENT', severity: 'CRITICAL', description: 'Chute de palette au dépôt', immediateAction: 'Zone sécurisée', lostTime: true, lostDays: 2 };
  r = await api('POST', '/hse/incidents', inc, hse); ok(r.s === 201, 'agent HSE déclare un incident critique', r); const incId = r.d && r.d.id;
  r = await api('POST', '/hse/incidents', { ...inc, severity: 'ENORME' }, hse); ok(r.s === 400, 'gravité invalide refusée → 400', r.s);
  r = await api('POST', '/hse/incidents', { ...inc, description: 'x' }, hse); ok(r.s === 400, 'description trop courte refusée → 400', r.s);
  r = await api('POST', '/hse/incidents', { ...inc, type: 'NEAR_MISS', severity: 'LOW', description: 'Presque-accident chauffeur' }, chf); ok(r.s === 201, 'un chauffeur peut déclarer un presque-accident', r);
  r = await api('GET', '/hse/incidents', undefined, chf); ok(r.s === 403, 'un chauffeur ne peut pas lister les incidents → 403', r.s);
  r = await api('GET', '/hse/incidents', undefined, hse); ok(r.s === 200 && rows(r.d).some((x) => x.id === incId), 'agent HSE voit l’incident déclaré');
  r = await api('PATCH', `/hse/incidents/${incId}/close`, { rootCause: 'Palette mal sanglée' }, hse); ok(r.s === 403, 'agent HSE ne peut pas clôturer (réservé aux responsables) → 403', r.s);
  r = await api('PATCH', `/hse/incidents/${incId}/close`, { rootCause: 'x' }); ok(r.s === 400, 'clôture sans cause racine valable refusée → 400', r.s);
  r = await api('PATCH', `/hse/incidents/${incId}/close`, { rootCause: 'Palette mal sanglée au chargement' }); ok(is2(r), 'responsable clôture avec cause racine', r);
  r = await api('PATCH', `/hse/incidents/${incId}/close`, { rootCause: 'Deuxième clôture' }); ok(is4(r), 'double clôture refusée (4xx)', r.s);
  r = await api('POST', '/hse/actions', { siteId: SITE, title: 'Former à l’arrimage', dueDate: iso(7 * 864e5), incidentId: incId }, hse); ok(r.s === 201, 'action corrective créée', r); const act = r.d && r.d.id;
  r = await api('PATCH', `/hse/actions/${act}/done`, {}, hse); ok(is2(r), 'action marquée faite', r);
  r = await api('POST', '/hse/talks', { siteId: SITE, theme: 'Port des EPI', plannedAt: iso(864e5) }, hse); ok(r.s === 201, 'causerie sécurité planifiée', r); const talk = r.d && r.d.id;
  r = await api('PATCH', `/hse/talks/${talk}/hold`, { attendees: [{ fullName: 'Mamadou Test' }], notes: 'RAS' }, hse); ok(is2(r), 'causerie tenue avec participants', r);
  r = await api('POST', '/hse/inspections', { siteId: SITE, type: 'WAREHOUSE', score: 82, compliant: true, notes: 'Entrepôt conforme' }, hse); ok(r.s === 201, 'inspection enregistrée', r);
  r = await api('POST', '/hse/inspections', { siteId: SITE, type: 'AVION' }, hse); ok(r.s === 400, 'type d’inspection invalide refusé → 400', r.s);
  r = await api('POST', '/hse/ppe', { siteId: SITE, ppeType: 'Casque', issuedAt: iso(), renewalDue: iso(180 * 864e5), compliant: true }, hse); ok(r.s === 201, 'remise d’EPI enregistrée', r);

  // --- Maintenance
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'TRUCK', internalNumber: 'M' + n, registrationNumber: 'M' + n, currentMileage: 10000 }); const veh = r.d && r.d.id; ok(!!veh, 'véhicule pour maintenance');
  r = await api('GET', '/maintenance/types'); ok(r.s === 200 && rows(r.d).length > 0, 'types de maintenance présents (' + rows(r.d).length + ')');
  r = await api('POST', '/maintenance', { vehicleId: veh, maintenanceTypeCode: 'VIDANGE', maintenanceDate: iso(), mileage: 10000, cost: 250000, kind: 'PREVENTIVE', nextMileage: 20000, description: 'Vidange complète' }); ok(r.s === 201, 'intervention de maintenance enregistrée', r);
  r = await api('POST', '/maintenance', { vehicleId: veh, maintenanceTypeCode: 'TYPE-INCONNU', maintenanceDate: iso() }); ok(is4(r), 'type de maintenance inconnu refusé (4xx)', r.s);
  r = await api('POST', '/maintenance', { vehicleId: veh, maintenanceTypeCode: 'VIDANGE', maintenanceDate: iso(), cost: -5 }); ok(r.s === 400, 'coût négatif refusé → 400', r.s);
  r = await api('GET', '/maintenance?vehicleId=' + veh); ok(r.s === 200, 'historique de maintenance du véhicule');
  r = await api('POST', '/maintenance-plans', { vehicleId: veh, maintenanceTypeCode: 'VIDANGE', intervalKm: 10000, intervalDays: 180, alertKm: 1000, alertDays: 15, lastDoneKm: 0 }); ok(r.s === 201, 'plan de maintenance préventive créé', r); const plan = r.d && r.d.id;
  r = await api('GET', '/maintenance-plans'); ok(r.s === 200 && rows(r.d).some((p) => p.id === plan), 'plan visible dans la liste');
  r = await api('POST', `/maintenance-plans/${plan}/schedule`, { maintenanceDate: iso(2 * 864e5), note: 'Planifiée' }); ok(is2(r), 'intervention planifiée depuis le plan', r);
  r = await api('GET', '/maintenance/recap'); ok(r.s === 200, 'récapitulatif de maintenance');
  r = await api('GET', '/maintenance/alerts'); ok(r.s === 200, 'alertes de maintenance');
  r = await api('POST', '/maintenance', { vehicleId: veh, maintenanceTypeCode: 'VIDANGE', maintenanceDate: iso() }, chf); ok(r.s === 403, 'un chauffeur ne peut pas enregistrer de maintenance → 403', r.s);

  // --- Rapports du personnel et validation hiérarchique
  r = await api('POST', '/staff/reports', { date: day, activities: 'Inspection du dépôt, causerie sécurité', observations: 'RAS' }, hse); ok(r.s === 201, 'agent HSE soumet son rapport journalier', r); const rep = r.d && r.d.id;
  r = await api('POST', '/staff/reports', { date: day, activities: 'ab' }, hse); ok(r.s === 400, 'rapport trop court refusé → 400', r.s);
  r = await api('GET', '/staff/reports/mine', undefined, hse); ok(r.s === 200, 'agent HSE lit ses rapports');
  r = await api('GET', '/staff/reports/pending', undefined, hse); ok(r.s === 403, 'agent HSE ne peut pas voir les rapports à valider → 403', r.s);
  r = await api('POST', `/staff/reports/${rep}/validate`, {}, hse); ok(r.s === 403, 'agent HSE ne peut pas valider son propre rapport → 403', r.s);
  r = await api('GET', '/staff/reports/pending'); ok(r.s === 200 && rows(r.d).some((x) => x.id === rep), 'le responsable voit le rapport en attente');
  r = await api('POST', `/staff/reports/${rep}/validate`, {}); ok(is2(r), 'le responsable valide le rapport', r);
  r = await api('POST', `/staff/reports/${rep}/validate`, {}); ok(is4(r), 'seconde validation refusée (4xx)', r.s);
  r = await api('GET', '/staff'); ok(r.s === 200 && rows(r.d).length > 0, 'liste du personnel');

  // --- Notifications
  r = await api('GET', '/notifications'); const nt = rows(r.d); ok(r.s === 200, 'liste des notifications (' + nt.length + ')');
  r = await api('POST', '/notifications/run-checks', {}); ok(is2(r), 'contrôles automatiques d’alertes exécutés', r);
  r = await api('POST', '/notifications/run-role-alerts', {}); ok(is2(r), 'alertes par rôle exécutées', r);
  r = await api('GET', '/notifications', undefined, chf); ok(r.s === 200, 'chauffeur lit ses propres notifications');
  if (nt[0]) { r = await api('PATCH', `/notifications/${nt[0].id}/read`, {}); ok(is2(r), 'notification marquée lue', r); r = await api('PATCH', `/notifications/${nt[0].id}/unread`, {}); ok(is2(r), 'notification remise non lue', r); }
  console.log(fails ? `\n${fails} échec(s)` : '\nTests fonctionnels n°3 réussis'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
