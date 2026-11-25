// Tests fonctionnels n°3 : HSE, maintenance, états des besoins (validation), comptes rendus du personnel (validation hiérarchique), notifications.
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
const n = Date.now().toString().slice(-7), PW = 'Test1234x';
const now = new Date().toISOString(), soon = new Date(Date.now() + 7 * 864e5).toISOString();
const is2 = (r) => r.s === 200 || r.s === 201, is4 = (r) => r.s >= 400 && r.s < 500;
(async () => {
  let r = await api('POST', '/auth/login', { email: 'admin@syllogistique.local', password: 'ChangeMoi123!' }, '');
  tok = r.d && r.d.accessToken; ok(!!tok, 'connexion administrateur');
  const mk = (role, tag) => api('POST', '/users', { firstName: 'Test', lastName: tag, email: `${tag}${n}@test.gn`, password: PW, role, siteId: SITE });
  for (const [role, tag] of [['GESTIONNAIRE_HSE', 'hse'], ['POINTEUR', 'poi'], ['RESPONSABLE_OPERATIONS', 'ops']]) { r = await mk(role, tag); ok(r.s === 201, 'création utilisateur ' + role, r); }
  const login = async (tag) => { const x = await api('POST', '/auth/login', { email: `${tag}${n}@test.gn`, password: PW }, ''); return x.d && x.d.accessToken; };
  const hse = await login('hse'), poi = await login('poi'), ops = await login('ops'); ok(!!hse && !!poi && !!ops, 'connexion HSE, pointeur, responsable des opérations');

  // --- HSE : incident → action corrective → clôture avec cause racine
  r = await api('POST', '/hse/incidents', { siteId: SITE, occurredAt: now, type: 'NEAR_MISS', severity: 'HIGH', description: 'Palette instable ' + n, zone: 'Quai 2' }, hse); ok(r.s === 201, 'déclaration d’un incident HSE', r); const inc = r.d && r.d.id;
  r = await api('POST', '/hse/incidents', { siteId: SITE, occurredAt: now, type: 'EXPLOSION', severity: 'HIGH', description: 'x' }, hse); ok(r.s === 400, 'type d’incident invalide → 400', r.s);
  r = await api('POST', '/hse/incidents', { siteId: SITE, occurredAt: now, type: 'FIRE', severity: 'LOW', description: 'ab' }, hse); ok(r.s === 400, 'description trop courte → 400', r.s);
  r = await api('GET', '/hse/incidents', undefined, hse); ok(r.s === 200 && rows(r.d).some((x) => x.id === inc), 'incident visible dans la liste');
  r = await api('POST', '/hse/actions', { siteId: SITE, title: 'Sangler les palettes', dueDate: soon, incidentId: inc }, hse); ok(r.s === 201, 'action corrective créée', r); const act = r.d && r.d.id;
  r = await api('PATCH', `/hse/actions/${act}/done`, {}, hse); ok(is2(r), 'action marquée faite', r);
  r = await api('PATCH', `/hse/incidents/${inc}/close`, { rootCause: 'x' }, hse); ok(r.s === 400, 'clôture sans cause racine détaillée refusée → 400', r.s);
  r = await api('PATCH', `/hse/incidents/${inc}/close`, { rootCause: 'Sanglage absent sur le quai' }); ok(is2(r), 'clôture de l’incident par un responsable', r);
  r = await api('POST', '/hse/talks', { siteId: SITE, theme: 'Gestes et postures', plannedAt: soon }, hse); ok(r.s === 201, 'causerie sécurité planifiée', r); const talk = r.d && r.d.id;
  r = await api('PATCH', `/hse/talks/${talk}/hold`, { attendees: [{ fullName: 'Agent A' }, { fullName: 'Agent B' }], notes: 'RAS' }, hse); ok(is2(r), 'causerie tenue avec participants', r);
  r = await api('POST', '/hse/inspections', { siteId: SITE, type: 'WAREHOUSE', score: 85, compliant: true, notes: 'Conforme' }, hse); ok(r.s === 201, 'inspection enregistrée', r);
  r = await api('POST', '/hse/ppe', { siteId: SITE, ppeType: 'Casque', issuedAt: now }, hse); ok(r.s === 400, 'EPI sans bénéficiaire refusé → 400', r.s);
  r = await api('GET', '/users'); const hseUser = rows(r.d).find((u) => u.email === `hse${n}@test.gn`);
  r = await api('POST', '/hse/ppe', { siteId: SITE, ppeType: 'Casque', issuedAt: now, renewalDue: soon, userId: hseUser && hseUser.id }, hse); ok(r.s === 201, 'remise d’EPI enregistrée', r);
  r = await api('GET', '/hse/incidents', undefined, poi); ok(r.s === 403, 'pointeur ne peut pas lire les incidents HSE → 403', r.s);

  // --- Maintenance
  r = await api('GET', '/maintenance/types'); ok(r.s === 200 && rows(r.d).length > 0, 'types de maintenance présents');
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'TRUCK', internalNumber: 'M' + n, registrationNumber: 'M' + n, currentMileage: 10000 }); const veh = r.d && r.d.id; ok(!!veh, 'véhicule pour maintenance');
  r = await api('POST', '/maintenance', { vehicleId: veh, maintenanceTypeCode: 'VIDANGE', maintenanceDate: now, mileage: 10000, cost: 120000, kind: 'PREVENTIVE', description: 'Vidange' }); ok(r.s === 201, 'maintenance enregistrée', r);
  r = await api('POST', '/maintenance', { vehicleId: veh, maintenanceTypeCode: 'VIDANGE', maintenanceDate: now, cost: -5 }); ok(r.s === 400, 'coût négatif refusé → 400', r.s);
  r = await api('POST', '/maintenance', { vehicleId: veh, maintenanceTypeCode: 'TYPE_INEXISTANT', maintenanceDate: now }); ok(is4(r), 'type de maintenance inconnu refusé (4xx)', r.s);
  r = await api('POST', '/maintenance-plans', { vehicleId: veh, maintenanceTypeCode: 'VIDANGE', intervalKm: 10000, alertKm: 1000, lastDoneKm: 10000, lastDoneAt: now }); ok(r.s === 201, 'plan d’entretien créé', r); const plan = r.d && r.d.id;
  r = await api('POST', `/maintenance-plans/${plan}/schedule`, { maintenanceDate: soon }); ok(is2(r), 'entretien planifié', r);
  r = await api('GET', '/maintenance/recap'); ok(r.s === 200, 'récapitulatif de maintenance');
  r = await api('GET', '/maintenance', undefined, poi); ok(is4(r) || r.s === 200, 'accès pointeur à la maintenance : réponse maîtrisée (' + r.s + ')');

  // --- États des besoins : cycle de validation
  r = await api('POST', '/needs', { siteId: SITE, title: 'Besoin pneus ' + n, priority: 'URGENTE', lines: [{ designation: 'Pneu 315/80', quantity: 4, estimatedUnitPrice: 2500000 }] }); ok(r.s === 201, 'état des besoins créé', r); const need = r.d && r.d.id;
  r = await api('POST', '/needs', { siteId: SITE, title: 'ab', lines: [] }); ok(r.s === 400, 'besoin sans ligne / titre court refusé → 400', r.s);
  r = await api('POST', `/needs/${need}/status`, { status: 'ENVOYE' }); ok(is2(r), 'besoin envoyé', r);
  r = await api('POST', `/needs/${need}/status`, { status: 'APPROUVE', note: 'OK' }); ok(is2(r), 'besoin approuvé', r);
  r = await api('POST', `/needs/${need}/status`, { status: 'N_IMPORTE_QUOI' }); ok(r.s === 400, 'statut inconnu refusé → 400', r.s);
  r = await api('GET', `/needs/${need}/pdf`); ok(r.s === 200 && r.ct.includes('pdf'), 'état des besoins en PDF');

  // --- Compte rendu du personnel : envoi par le pointeur, validation hiérarchique par les opérations
  const day = new Date().toISOString().slice(0, 10);
  r = await api('POST', '/staff/reports', { date: day, activities: 'Pointage de 12 chauffeurs, contrôle des présences', observations: 'RAS' }, poi); ok(is2(r), 'compte rendu envoyé par le pointeur', r); const rep = r.d && r.d.id;
  r = await api('POST', '/staff/reports', { date: day, activities: 'x' }, poi); ok(r.s === 400, 'compte rendu trop court refusé → 400', r.s);
  r = await api('POST', `/staff/reports/${rep}/validate`, {}, poi); ok(r.s === 403, 'le pointeur ne peut pas valider son propre compte rendu → 403', r.s);
  r = await api('POST', `/staff/reports/${rep}/validate`, {}, ops); ok(r.s === 400, 'validation refusée tant que le rapport n’est pas vérifié (saut d’étape) → 400', r.s);
  r = await api('POST', `/staff/reports/${rep}/receive`, {}, hse); ok(is2(r), 'vérification (réception) par le responsable HSE', r);
  r = await api('GET', '/staff/reports/pending', undefined, ops); ok(r.s === 200 && rows(r.d).some((x) => x.id === rep), 'rapport vérifié visible dans la file des opérations');
  r = await api('POST', `/staff/reports/${rep}/validate`, {}, ops); ok(is2(r), 'validation par le responsable des opérations', r);
  r = await api('POST', `/staff/reports/${rep}/validate`, {}, ops); ok(is4(r), 'seconde validation refusée (4xx)', r.s);

  // --- Notifications
  r = await api('POST', '/notifications/run-role-alerts', {}, poi); ok(r.s === 403, 'pointeur ne peut pas lancer les alertes → 403', r.s);
  r = await api('POST', '/notifications/run-role-alerts', {}); ok(is2(r), 'alertes par département déclenchées', r);
  r = await api('GET', '/notifications'); const ns = rows(r.d); ok(r.s === 200, 'liste des notifications (' + ns.length + ')');
  if (ns.length) { r = await api('PATCH', `/notifications/${ns[0].id}/read`, {}); ok(is2(r), 'notification marquée lue', r); r = await api('PATCH', `/notifications/${ns[0].id}/unread`, {}); ok(is2(r), 'notification remise non lue', r); }
  r = await api('GET', '/audit?limit=200'); ok(r.s === 200 && rows(r.d).length > 5, 'audit : les opérations de ce test sont tracées (' + rows(r.d).length + ')');
  console.log(fails ? `\n${fails} échec(s)` : '\nTests fonctionnels n°3 réussis'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
