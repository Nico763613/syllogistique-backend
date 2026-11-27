// Tests fonctionnels n°4 (base de test réelle) : droits par rôle, comptes gérés par le DG,
// circuit d'une panne (déclaration → qualification → mécanicien → pièces → clôture)
// et circuit complet du chauffeur (appareil, départ, dépense, arrivée, fiche, vérification, validation, paiement).
const crypto = require('crypto');
const B = process.env.SMOKE_URL || 'http://localhost:3000';
const SITE = '00000000-0000-0000-0000-000000000002';
let fails = 0, tok = '';
const ok = (c, m, extra) => { console.log((c ? '✔ ' : '✘ ') + m + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); if (!c) fails++; };
const api = async (method, path, body, ...rest) => {
  // un jeton passé explicitement (même vide) n'est jamais remplacé par celui de l'administrateur
  const token = rest.length ? (rest[0] || 'jeton-absent') : tok, headers = rest[1] || {};
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; const ct = r.headers.get('content-type') || ''; if (ct.includes('json')) data = await r.json().catch(() => null); else await r.arrayBuffer();
  return { s: r.status, d: data };
};
const rows = (d) => Array.isArray(d) ? d : (d && (d.items || d.data || d.rows)) || [];
const n = Date.now().toString().slice(-7), PW = 'Test1234x', day = new Date().toISOString().slice(0, 10);
const is2 = (r) => r.s === 200 || r.s === 201;
// Envoi d'une vraie photo de reçu (le serveur refuse désormais une adresse de fichier inventée)
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a0b00000000049454e44ae426082', 'hex');
const upload = async (token) => { const fd = new FormData(); fd.append('file', new Blob([PNG], { type: 'image/png' }), 'recu.png'); const x = await fetch(B + '/uploads?category=fuel_receipt', { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: fd }); const d = await x.json().catch(() => ({})); return d.url; };

(async () => {
  let r = await fetch(B + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@syllogistique.local', password: 'ChangeMoi123!' }) }).then(async (x) => ({ s: x.status, d: await x.json() }));
  tok = r.d && r.d.accessToken; ok(!!tok, 'connexion administrateur');

  // --- Comptes de test, un par rôle
  const ROLES = { dg: 'DIRECTEUR_GENERAL', logi: 'ADMIN_LOGISTIQUE', ops: 'RESPONSABLE_OPERATIONS', compta: 'COMPTABLE', meca: 'MECANICIEN', meca2: 'MECANICIEN', stock: 'MAGASINIER', flotte: 'GESTIONNAIRE_FLOTTE', chf: 'CHAUFFEUR' };
  const T = {}, U = {};
  for (const [tag, role] of Object.entries(ROLES)) {
    r = await api('POST', '/users', { firstName: 'Test', lastName: tag, email: `f4${tag}${n}@test.gn`, password: PW, role, siteId: SITE });
    ok(r.s === 201, `création du compte ${role} (${tag})`, r); U[tag] = r.d && r.d.id;
  }
  // La connexion est limitée à 5 essais par minute et par adresse : connexions par lots de 5
  const tags = Object.keys(ROLES);
  for (let i = 0; i < tags.length; i++) {
    if (i === 4) { console.log('… pause de 61 s (limite de connexions)'); await new Promise((res) => setTimeout(res, 61000)); }
    const x = await fetch(B + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `f4${tags[i]}${n}@test.gn`, password: PW }) });
    const d = await x.json().catch(() => ({}));
    T[tags[i]] = d.accessToken;
    // Mot de passe provisoire (compte créé par un administrateur) : on le remplace d'abord.
    if (d.accessToken && d.user && d.user.mustChangePassword) await fetch(B + '/auth/change-password', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + d.accessToken }, body: JSON.stringify({ currentPassword: PW, newPassword: PW + 'N' }) });
    if (!T[tags[i]]) console.log('   connexion impossible pour', tags[i], x.status);
  }
  ok(Object.values(T).every(Boolean), 'connexion de chaque compte de test');

  // --- Droits par rôle (échantillon de points sensibles)
  const M = [
    ['GET', '/audit?limit=5', 'dg', 200], ['GET', '/audit?limit=5', 'chf', 403], ['GET', '/audit?limit=5&entities=User', 'stock', 403], ['GET', '/audit?limit=5&entities=StockMovement', 'stock', 200], ['GET', '/audit?limit=5&entity=User', 'flotte', 403],
    ['GET', '/driver-admin/sheets/pending', 'ops', 200], ['GET', '/driver-admin/sheets/pending', 'compta', 403], ['GET', '/driver-admin/sheets/pending', 'chf', 403],
    ['GET', '/driver-admin/expenses', 'compta', 200], ['GET', '/driver-admin/expenses', 'stock', 403],
    ['GET', '/hse/incidents', 'chf', 403], ['GET', '/users', 'chf', 403], ['GET', '/users', 'meca', 403],
  ];
  for (const [m, p, who, want] of M) { r = await api(m, p, undefined, T[who]); ok(r.s === want, `${who} ${m} ${p} → ${want}`, r.s); }
  r = await api('POST', '/downtimes', { vehicleId: crypto.randomUUID(), reason: 'Essai' }, T.stock); ok(r.s === 403, 'le gestionnaire de stock ne déclare pas de panne → 403', r.s);
  r = await api('POST', '/users', { firstName: 'X', lastName: 'Y', email: `f4x${n}@test.gn`, password: PW, role: 'SUPER_ADMIN', siteId: SITE }, T.logi); ok(r.s === 403 || r.s === 400, 'le responsable logistique ne crée pas de Master Admin', r.s);

  // --- Le DG gère uniquement les comptes de ses responsables, et reste en lecture seule ailleurs
  const tel = (k) => '6' + n + String(k).padStart(1, '0');
  r = await api('POST', '/staff', { firstName: 'Awa', lastName: 'Caisse', phone: tel(1), role: 'CAISSIER', siteId: SITE }, T.dg); ok(r.s === 201, 'le DG crée un compte Caissier', r); const cais = r.d && r.d.id;
  r = await api('POST', '/staff', { firstName: 'Ibra', lastName: 'Ventes', phone: tel(2), role: 'RESPONSABLE_COMMERCIAL', siteId: SITE }, T.dg); ok(r.s === 201, 'le DG crée un compte Responsable commercial', r);
  r = await api('POST', '/staff', { firstName: 'Sekou', lastName: 'Ops', phone: tel(3), role: 'RESPONSABLE_OPERATIONS', siteId: SITE }, T.dg); ok(r.s === 201, 'le DG crée un compte Responsable des opérations', r);
  r = await api('POST', '/staff', { firstName: 'Moussa', lastName: 'Stock', phone: tel(4), role: 'MAGASINIER', siteId: SITE }, T.dg); ok(r.s === 403, 'le DG ne crée pas de personnel de terrain (gestionnaire de stock) → 403', r.s);
  r = await api('POST', '/staff', { firstName: 'Autre', lastName: 'DG', phone: tel(5), role: 'DIRECTEUR_GENERAL', siteId: SITE }, T.dg); ok(r.s === 403, 'le DG ne crée pas un autre DG → 403', r.s);
  r = await api('PATCH', `/staff/${cais}`, { firstName: 'Aïssatou' }, T.dg); ok(is2(r), 'le DG modifie le compte du caissier', r);
  r = await api('POST', `/staff/${cais}/status`, { status: 'SUSPENDED' }, T.dg); ok(is2(r), 'le DG suspend le compte du caissier', r);
  r = await api('POST', `/staff/${cais}/status`, { status: 'ACTIVE' }, T.dg); ok(is2(r), 'le DG réactive le compte du caissier', r);
  r = await api('POST', `/staff/${U.stock}/status`, { status: 'SUSPENDED' }, T.dg); ok(r.s === 403 || r.s === 404, 'le DG ne suspend pas un gestionnaire de stock', r.s);
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'TRUCK', internalNumber: 'DG' + n, registrationNumber: 'DG' + n }, T.dg); ok(r.s === 403, 'le DG reste en lecture seule (création de véhicule) → 403', r.s);
  r = await api('POST', '/staff/reports', { date: day, activities: 'Essai de rapport' }, T.dg); ok(r.s === 403, 'le DG ne soumet pas de rapport du personnel → 403', r.s);
  r = await api('POST', '/staff', { firstName: 'Faux', lastName: 'DG', phone: tel(6), role: 'DIRECTEUR_GENERAL', siteId: SITE }, T.logi); ok(r.s === 403, 'le responsable logistique ne crée pas de DG → 403', r.s);
  r = await api('POST', '/staff', { firstName: 'Mamady', lastName: 'Atelier', phone: tel(7), role: 'MECANICIEN', siteId: SITE }, T.logi); ok(r.s === 201, 'le responsable logistique crée un mécanicien', r);

  // --- Circuit d'une panne
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'TRUCK', internalNumber: 'P' + n, registrationNumber: 'P' + n, currentMileage: 5000 }); const vp = r.d && r.d.id; ok(!!vp, 'véhicule pour la panne', r);
  r = await api('POST', '/downtimes', { vehicleId: vp, reason: 'Fuite d’huile moteur', estimatedCost: 300000 }, T.flotte); ok(r.s === 201, 'le gestionnaire de flotte déclare la panne', r); const dt = r.d && r.d.id;
  r = await api('POST', '/downtimes', { vehicleId: vp, reason: 'Deuxième déclaration' }, T.flotte); ok(r.s === 400, 'deuxième panne ouverte sur le même véhicule refusée → 400', r.s);
  r = await api('POST', `/downtimes/${dt}/qualify`, { priority: 'URGENTE', note: 'Camion prioritaire' }, T.flotte); ok(is2(r), 'panne qualifiée urgente', r);
  r = await api('POST', `/downtimes/${dt}/take`, {}, T.flotte); ok(r.s === 403, 'seul un mécanicien prend la réparation en charge → 403', r.s);
  r = await api('POST', `/downtimes/${dt}/take`, {}, T.meca); ok(is2(r), 'le mécanicien prend la réparation en charge', r);
  r = await api('POST', `/downtimes/${dt}/take`, {}, T.meca2); ok(r.s === 409, 'un second mécanicien ne peut pas la reprendre → 409', r.s);
  r = await api('POST', `/downtimes/${dt}/parts`, { lines: [{ designation: 'Joint de carter', quantity: 1 }] }, T.meca); ok(is2(r), 'le mécanicien demande une pièce', r);
  r = await api('POST', `/downtimes/${dt}/resolve`, { actualCost: 0, resolutionNote: 'Essai' }, T.meca); ok(r.s === 400, 'clôture refusée tant que la pièce est attendue → 400', r.s);
  r = await api('POST', `/downtimes/${dt}/parts-received`, { note: 'Pièce remise' }, T.stock); ok(is2(r), 'le gestionnaire de stock confirme la remise de la pièce', r);
  r = await api('POST', `/downtimes/${dt}/resolve`, { resolutionNote: 'Joint changé' }, T.meca); ok(r.s === 400, 'clôture sans coût refusée → 400', r.s);
  r = await api('POST', `/downtimes/${dt}/resolve`, { actualCost: 0, resolutionNote: 'Joint changé, essai routier fait' }, T.meca2); ok(r.s === 403, 'un autre mécanicien ne clôture pas → 403', r.s);
  r = await api('POST', `/downtimes/${dt}/resolve`, { actualCost: 0, resolutionNote: 'Joint changé, essai routier fait' }, T.meca); ok(is2(r), 'le mécanicien clôture la réparation', r);
  r = await api('GET', `/downtimes?siteId=${SITE}&vehicleId=${vp}`); ok(r.s === 200 && rows(r.d).some((x) => x.id === dt && x.endedAt), 'la panne apparaît clôturée dans l’historique', r.s);

  // --- Circuit du chauffeur
  r = await api('POST', '/drivers', { firstName: 'Alpha', lastName: 'Route' + n, phone: '62' + n, licenseNumber: 'PC' + n, licenseExpiryDate: new Date(Date.now() + 365 * 864e5).toISOString(), activity: 'SERVICE_VEHICLE', siteId: SITE }); ok(r.s === 201, 'fiche chauffeur créée', r); const drv = r.d && r.d.id;
  r = await api('POST', '/driver-admin/link', { driverId: drv, email: `f4chf${n}@test.gn` }, T.logi); ok(is2(r), 'compte chauffeur lié à la fiche', r);
  r = await api('POST', '/driver-admin/provision', { driverId: drv }, T.logi); ok(is2(r) && r.d && r.d.otp, 'code d’activation de l’appareil généré', r); const otp = r.d && r.d.otp;
  r = await api('POST', '/driver/activate', { code: '000000', fingerprint: 'fp-' + n }, T.chf); ok(r.s === 400, 'mauvais code d’activation refusé → 400', r.s);
  r = await api('POST', '/driver/activate', { code: String(otp), fingerprint: 'fp-' + n, model: 'Test', os: 'Android' }, T.chf); ok(is2(r) && r.d && r.d.deviceId, 'appareil du chauffeur activé', r); const dev = { 'x-device-id': r.d && r.d.deviceId };
  r = await api('POST', '/driver/sync', { ops: [] }, T.chf); ok(r.s === 403 || r.s === 401, 'sans identifiant d’appareil, la synchronisation est refusée', r.s);
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'SERVICE_VEHICLE', internalNumber: 'S' + n, registrationNumber: 'S' + n, currentMileage: 12000, assignedDriverId: drv }); ok(r.s === 201, 'véhicule de service affecté au chauffeur', r);
  const trip = crypto.randomUUID(), op = (type, payload, extra = {}) => ({ type, clientOpId: `${type}-${n}-${crypto.randomUUID().slice(0, 8)}`, payload, ...extra });
  const start = op('start', { odometer: 12000, purposeType: 'MISSION', destination: 'Kindia', preCondition: 'RAS' }, { tripId: trip });
  r = await api('POST', '/driver/sync', { ops: [start] }, T.chf, dev); ok(is2(r) && r.d.results[0].ok, 'départ de mission enregistré', r.d);
  r = await api('POST', '/driver/sync', { ops: [start] }, T.chf, dev); ok(is2(r) && r.d.results[0].ok && r.d.results[0].duplicate, 'même départ renvoyé après coupure : pas de doublon', r.d);
  r = await api('POST', '/driver/sheet/send', { date: day }, T.chf, dev); ok(r.s === 400, 'fiche refusée tant que la mission est en cours → 400', r.s);
  r = await api('POST', '/driver/sync', { ops: [op('expense', { category: 'PEAGE', amount: 50000 }, { tripId: trip })] }, T.chf, dev); ok(is2(r) && !r.d.results[0].ok, 'dépense sans photo du reçu refusée', r.d);
  r = await api('POST', '/driver/sync', { ops: [op('expense', { category: 'PEAGE', amount: 50000, receiptImageUrl: '/uploads/00000000-0000-0000-0000-000000000000.jpg' }, { tripId: trip })] }, T.chf, dev); ok(is2(r) && !r.d.results[0].ok, 'dépense avec un reçu inexistant (adresse inventée) refusée', r.d);
  const recu1 = await upload(T.chf); ok(!!recu1, 'le chauffeur envoie la photo de son reçu', recu1);
  r = await api('POST', '/driver/sync', { ops: [op('expense', { category: 'PEAGE', amount: 50000, receiptImageUrl: recu1 }, { tripId: trip })] }, T.chf, dev); ok(is2(r) && r.d.results[0].ok, 'dépense de péage avec reçu enregistrée', r.d); const exp = r.d && r.d.results[0].result && r.d.results[0].result.expenseId;
  r = await api('POST', '/driver/sync', { ops: [op('expense', { category: 'PEAGE', amount: 50000, receiptImageUrl: recu1 }, { tripId: trip })] }, T.chf, dev); ok(is2(r) && !r.d.results[0].ok, 'même reçu présenté une seconde fois : refusé (pas de double remboursement)', r.d);
  // Contrôle des montants de la fiche de bord
  r = await api('POST', '/driver/sync', { ops: [op('expense', { category: 'PEAGE', amount: 150000000, receiptImageUrl: await upload(T.chf) }, { tripId: trip })] }, T.chf, dev); ok(is2(r) && !r.d.results[0].ok, 'dépense de 150 millions GNF (au-delà du plafond) refusée', r.d);
  r = await api('POST', '/driver/sync', { ops: [op('expense', { category: 'PEAGE', amount: -5000, receiptImageUrl: await upload(T.chf) }, { tripId: trip })] }, T.chf, dev); ok(is2(r) && !r.d.results[0].ok, 'dépense de montant négatif refusée', r.d);
  r = await api('POST', '/driver/sync', { ops: [op('fuel', { liters: 30, totalCost: 50000000, odometer: 12050, receiptImageUrl: await upload(T.chf) }, { tripId: trip })] }, T.chf, dev); ok(is2(r) && !r.d.results[0].ok && /incohérent/.test(r.d.results[0].error || ''), 'plein de 30 L déclaré à 50 millions GNF refusé (prix au litre incohérent)', r.d);
  r = await api('POST', '/driver/sync', { ops: [op('fuel', { liters: 30, totalCost: 360000, odometer: 12050, receiptImageUrl: await upload(T.chf) }, { tripId: trip })] }, T.chf, dev); ok(is2(r) && r.d.results[0].ok, 'plein de 30 L à 360 000 GNF (12 000 GNF/L) accepté', r.d);
  r = await api('POST', '/driver/sync', { ops: [op('maintenance', { nature: 'VIDANGE', cost: -1000 }, { tripId: trip })] }, T.chf, dev); ok(is2(r) && !r.d.results[0].ok, 'coût de maintenance négatif refusé', r.d);
  r = await api('POST', '/driver/sync', { ops: [op('arrive', { odometer: 11000 }, { tripId: trip })] }, T.chf, dev); ok(is2(r) && !r.d.results[0].ok, 'arrivée avec kilométrage inférieur au départ refusée', r.d);
  r = await api('POST', '/driver/sync', { ops: [op('arrive', { odometer: 12150, endCondition: 'RAS' }, { tripId: trip })] }, T.chf, dev); ok(is2(r) && r.d.results[0].ok, 'arrivée enregistrée (150 km)', r.d);
  r = await api('POST', '/driver/sheet/send', { date: day }, T.chf, dev); ok(is2(r), 'le chauffeur envoie sa fiche de bord', r);
  r = await api('POST', '/driver/sync', { ops: [op('expense', { category: 'PARKING', amount: 1000, receiptImageUrl: await upload(T.chf) })] }, T.chf, dev); ok(is2(r) && !r.d.results[0].ok, 'fiche envoyée : plus aucune saisie possible ce jour-là', r.d);
  r = await api('POST', `/driver-admin/expenses/${exp}/decision`, { decision: 'APPROVED' }, T.compta); ok(r.s === 400, 'la comptabilité ne paie pas avant la validation de la fiche → 400', r.s);
  r = await api('POST', '/driver-admin/sheets/validate', { driverId: drv, date: day }, T.ops); ok(r.s === 400, 'les opérations ne valident pas avant la vérification logistique → 400', r.s);
  r = await api('POST', '/driver-admin/sheets/process', { driverId: drv, date: day, note: 'Conforme' }, T.ops); ok(r.s === 403, 'les opérations ne font pas la vérification logistique → 403', r.s);
  r = await api('POST', '/driver-admin/sheets/process', { driverId: drv, date: day, note: 'Conforme' }, T.logi); ok(is2(r), 'le responsable logistique vérifie la fiche', r);
  r = await api('GET', '/driver-admin/sheets/pending', undefined, T.ops); ok(r.s === 200 && JSON.stringify(r.d).includes(drv), 'la fiche arrive chez le responsable des opérations', r.s);
  r = await api('POST', '/driver-admin/sheets/validate', { driverId: drv, date: day }, T.ops); ok(is2(r), 'le responsable des opérations valide la fiche', r);
  r = await api('POST', `/driver-admin/expenses/${exp}/pay`, {}, T.compta); ok(r.s === 400, 'paiement refusé avant l’accord de la comptabilité → 400', r.s);
  r = await api('POST', `/driver-admin/expenses/${exp}/decision`, { decision: 'APPROVED', note: 'Reçu conforme' }, T.ops); ok(r.s === 403, 'seule la comptabilité accorde la dépense → 403', r.s);
  r = await api('POST', `/driver-admin/expenses/${exp}/decision`, { decision: 'APPROVED', note: 'Reçu conforme' }, T.compta); ok(is2(r), 'la comptabilité accorde la dépense', r);
  r = await api('POST', `/driver-admin/expenses/${exp}/pay`, {}, T.compta); ok(is2(r), 'la comptabilité marque la dépense comme payée', r);
  r = await api('POST', `/driver-admin/expenses/${exp}/pay`, {}, T.compta); ok(r.s === 400, 'double paiement refusé → 400', r.s);
  r = await api('GET', '/audit?limit=200&entities=DriverExpense', undefined, T.dg); ok(r.s === 200 && JSON.stringify(r.d).includes(exp), 'le DG retrouve la dépense dans le journal', r.s);

  // --- Plafonds des montants saisis au bureau : refus clair (400) au lieu d'une erreur serveur (500)
  r = await api('POST', '/expenses', { category: 'OTHER', amount: 1e13, expenseDate: new Date().toISOString(), description: 'Essai plafond' }); ok(r.s === 400, 'dépense de bureau de 10 000 milliards GNF refusée → 400', r.s);
  r = await api('POST', '/expenses', { category: 'OTHER', amount: -10, expenseDate: new Date().toISOString() }); ok(r.s === 400, 'dépense de bureau négative refusée → 400', r.s);
  r = await api('POST', '/payments', { direction: 'IN', method: 'CASH', amount: 1e13, paymentDate: new Date().toISOString() }); ok(r.s === 400, 'paiement de 10 000 milliards GNF refusé → 400', r.s);
  r = await api('POST', '/fuel', { vehicleId: vp, siteId: SITE, transactionDate: new Date().toISOString(), mileage: 5000, quantityLiters: 1e12 }); ok(r.s === 400, 'plein de mille milliards de litres refusé → 400', r.s);

  console.log(fails ? `\n${fails} échec(s)` : '\nTous les tests du circuit sont passés.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
