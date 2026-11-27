// Tests fonctionnels n°6 (base de test réelle) : plateforme multi-entreprises et multi-sites.
//  - deux entreprises (A = jeu de test, B = créée par l'accès plateforme), plusieurs sites, plusieurs utilisateurs ;
//  - lectures, écritures, opérations groupées et références croisées refusées d'une entreprise à l'autre ;
//  - un même compte sur deux appareils, deux comptes qui modifient la même fiche (versions et conflits, arbitrage) ;
//  - récupération du mot de passe par code (expiration, essais limités, usage unique, procédure administrateur).
// Aucune donnée réelle n'est utilisée : à lancer uniquement sur la base de test (CI).
const B = process.env.SMOKE_URL || 'http://localhost:3000';
const SITE_A = '00000000-0000-0000-0000-000000000002';
const PKEY = process.env.PLATFORM_ADMIN_KEY || '';
let fails = 0;
const ok = (c, m, extra) => { console.log((c ? '✔ ' : '✘ ') + m + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); if (!c) fails++; };
const api = async (method, path, body, token, headers = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; const ct = r.headers.get('content-type') || ''; if (ct.includes('json')) data = await r.json().catch(() => null); else await r.arrayBuffer();
  return { s: r.status, d: data };
};
const pause = (why) => { console.log(`… pause de 61 s (${why})`); return new Promise((res) => setTimeout(res, 61000)); };
const n = Date.now().toString().slice(-7), PW = 'Test1234x';
const is2 = (r) => r.s === 200 || r.s === 201;
const refused = (r) => [400, 403, 404, 409].includes(r.s);
const login = async (email, password) => {
  const r = await api('POST', '/auth/login', { email, password }); const d = r.d || {};
  if (d.accessToken && d.user && d.user.mustChangePassword) {
    const blocked = await api('GET', '/vehicles', undefined, d.accessToken);
    ok(blocked.s === 403, `${email} : données refusées tant que le mot de passe provisoire n'est pas changé`, blocked.s);
    const c = await api('POST', '/auth/change-password', { currentPassword: password, newPassword: password + 'N' }, d.accessToken);
    ok(is2(c), `${email} : mot de passe provisoire remplacé`, c);
    return { ...d, password: password + 'N' };
  }
  return { ...d, password };
};
const ids = (r) => (Array.isArray(r.d) ? r.d : (r.d && (r.d.items || r.d.data)) || []).map((x) => x.id);

(async () => {
  if (!PKEY) { console.log('✘ PLATFORM_ADMIN_KEY absent : test multi-entreprises impossible'); process.exit(1); }

  // ================= 1. Deux entreprises =================
  const A = await login('admin@syllogistique.local', 'ChangeMoi123!'); // connexion 1
  ok(!!A.accessToken, 'connexion Super administrateur de l’entreprise A');
  let r = await api('POST', '/platform/organizations', { name: 'Entreprise B ' + n, siteName: 'Dépôt B1', adminFirstName: 'Admin', adminLastName: 'Bah', adminEmail: `adminb${n}@test.gn`, adminTemporaryPassword: PW });
  ok(r.s === 403, 'accès plateforme sans clé : refusé', r.s);
  r = await api('POST', '/platform/organizations', { name: 'X', siteName: 'X', adminFirstName: 'Xx', adminLastName: 'Xx', adminEmail: `x${n}@test.gn`, adminTemporaryPassword: PW }, null, { 'x-platform-key': 'mauvaise-cle-mauvaise-cle-123' });
  ok(r.s === 403, 'accès plateforme avec une mauvaise clé : refusé', r.s);
  r = await api('POST', '/platform/organizations', { name: 'Entreprise B ' + n, siteName: 'Dépôt B1', siteLocation: 'Kamsar', adminFirstName: 'Admin', adminLastName: 'Bah', adminEmail: `adminb${n}@test.gn`, adminTemporaryPassword: PW }, null, { 'x-platform-key': PKEY });
  ok(r.s === 201 && r.d && r.d.organizationId, 'entreprise B créée par l’accès plateforme', r);
  const ORG_B = r.d && r.d.organizationId, SITE_B1 = r.d && r.d.siteId;
  const Bx = await login(`adminb${n}@test.gn`, PW); // connexion 2 (mot de passe provisoire imposé)
  const tB = Bx.accessToken; ok(!!tB, 'connexion Super administrateur de l’entreprise B');
  const tA = A.accessToken;

  // Sites : chaque entreprise ne voit que les siens ; B ouvre un second site
  r = await api('POST', '/sites', { name: 'Dépôt B2 ' + n, location: 'Boké' }, tB); ok(r.s === 201, 'entreprise B : second site créé', r); const SITE_B2 = r.d && r.d.id;
  // A a peut-être déjà atteint la limite de sites de son offre : on réutilise alors son second site existant.
  let sitesA = (await api('GET', '/sites', undefined, tA)).d || [];
  let SITE_A2 = (sitesA.find((x) => x.id !== SITE_A) || {}).id;
  if (!SITE_A2) { r = await api('POST', '/sites', { name: 'Site A2 ' + n, location: 'Kindia' }, tA); SITE_A2 = r.d && r.d.id; }
  ok(!!SITE_A2, 'entreprise A : second site disponible', SITE_A2);
  r = await api('GET', '/sites', undefined, tB); let s = ids(r);
  ok(s.includes(SITE_B1) && s.includes(SITE_B2) && !s.includes(SITE_A) && !s.includes(SITE_A2), 'B ne voit que ses deux sites', s);
  r = await api('GET', '/sites', undefined, tA); s = ids(r);
  ok(s.includes(SITE_A) && s.includes(SITE_A2) && !s.includes(SITE_B1), 'A ne voit pas les sites de B', s.length);
  r = await api('GET', '/sites/' + SITE_A, undefined, tB); ok(r.s === 404 || r.s === 403, 'B ne peut pas ouvrir un site de A', r.s);

  // Données de chaque entreprise
  r = await api('POST', '/vehicles', { siteId: SITE_A, vehicleType: 'TRUCK', internalNumber: 'MA' + n, registrationNumber: 'MA' + n, brand: 'Volvo' }, tA); const vehA = r.d && r.d.id; ok(!!vehA, 'véhicule de A', r);
  r = await api('POST', '/vehicles', { siteId: SITE_B1, vehicleType: 'TRUCK', internalNumber: 'MB' + n, registrationNumber: 'MB' + n }, tB); const vehB = r.d && r.d.id; ok(!!vehB, 'véhicule de B', r);
  r = await api('POST', '/customers', { siteId: SITE_A, name: 'Client A ' + n, phone: '621' + n }, tA); const custA = r.d && r.d.id; ok(!!custA, 'client de A', r);
  r = await api('POST', '/inventory/items', { siteId: SITE_A, sku: 'M6A-' + n, name: 'Article A ' + n, unit: 'pièce', unitPrice: 700, salePrice: 1000 }, tA); const itemA = r.d && r.d.id; ok(!!itemA, 'article de A', r);
  r = await api('POST', '/inventory/items', { siteId: SITE_B1, sku: 'M6B-' + n, name: 'Article B ' + n, unit: 'pièce', unitPrice: 500 }, tB); const itemB = r.d && r.d.id; ok(!!itemB, 'article de B', r);
  r = await api('POST', '/inventory/movements/in', { itemId: itemB, siteId: SITE_B1, quantity: 10, reason: 'Stock initial test' }, tB); ok(is2(r), 'entrée de stock initiale de B', r);

  // ================= 2. Lectures croisées refusées =================
  for (const [p, label] of [['/vehicles/' + vehA, 'véhicule'], ['/customers/' + custA, 'client'], ['/inventory/items/' + itemA, 'article'], ['/vehicles/' + vehA + '/dossier', 'dossier du véhicule'], ['/vehicles/' + vehA + '/assignments', 'affectations du véhicule']]) {
    r = await api('GET', p, undefined, tB); ok(r.s === 404 || r.s === 403, `B ne lit pas le ${label} de A (${r.s})`, r.s);
  }
  r = await api('GET', '/vehicles?siteId=' + SITE_A, undefined, tB); ok(!ids(r).includes(vehA), 'liste des véhicules de B : aucun véhicule de A, même en demandant le site de A', ids(r).length);
  r = await api('GET', '/customers?siteId=' + SITE_A, undefined, tB); ok(!ids(r).includes(custA), 'liste des clients de B : aucun client de A', ids(r).length);
  r = await api('GET', '/inventory/items?siteId=' + SITE_A, undefined, tB); ok(!ids(r).includes(itemA), 'liste des articles de B : aucun article de A', ids(r).length);
  r = await api('GET', '/users', undefined, tB); ok(!JSON.stringify(r.d || '').includes('admin@syllogistique.local'), 'liste des utilisateurs de B : aucun compte de A', r.s);
  r = await api('GET', '/user-devices', undefined, tB); ok(r.s === 200 && Array.isArray(r.d) && r.d.every((d) => d.lastName === 'B'), 'appareils des comptes : B ne voit que ceux de ses comptes', r.d && r.d.length);
  r = await api('GET', '/vehicles/' + vehB, undefined, tA); ok(r.s === 404 || r.s === 403, 'A ne lit pas le véhicule de B (le cloisonnement vaut dans les deux sens)', r.s);

  // ================= 3. Écritures croisées refusées =================
  r = await api('PATCH', '/vehicles/' + vehA, { brand: 'Piraté' }, tB); ok(refused(r), 'B ne modifie pas le véhicule de A', r.s);
  r = await api('PATCH', '/customers/' + custA, { name: 'Piraté' }, tB); ok(refused(r), 'B ne modifie pas le client de A', r.s);
  r = await api('PATCH', '/inventory/items/' + itemA, { name: 'Piraté' }, tB); ok(refused(r), 'B ne modifie pas l’article de A', r.s);
  r = await api('POST', '/vehicles', { siteId: SITE_A, vehicleType: 'TRUCK', internalNumber: 'X' + n, registrationNumber: 'X' + n }, tB); ok(refused(r), 'B ne crée pas de véhicule dans un site de A', r.s);
  r = await api('POST', '/customers', { siteId: SITE_A, name: 'Intrus ' + n }, tB); ok(refused(r), 'B ne crée pas de client dans un site de A', r.s);
  r = await api('POST', '/users', { firstName: 'Intrus', lastName: 'B', email: `intrus${n}@test.gn`, password: PW, role: 'MAGASINIER', siteId: SITE_A }, tB); ok(refused(r), 'B ne crée pas de compte rattaché à un site de A', r.s);
  const fuel = (vehicleId) => ({ vehicleId, siteId: SITE_B1, quantityLiters: 10, mileage: 1000, transactionDate: new Date().toISOString() });
  r = await api('POST', '/fuel', fuel(vehB), tB); ok(is2(r), 'témoin : B enregistre du carburant pour son propre véhicule', r);
  r = await api('POST', '/fuel', fuel(vehA), tB); ok(refused(r), 'B ne rattache pas une dépense carburant au véhicule de A (référence croisée)', r);
  r = await api('POST', '/inventory/transfers', { itemId: itemB, toSiteId: SITE_A, quantity: 1, reason: 'Test intrusion' }, tB); ok(refused(r), 'B ne transfère pas de stock vers un site de A', r.s);
  r = await api('POST', '/inventory/transfers', { itemId: itemA, toSiteId: SITE_B1, quantity: 1, reason: 'Test intrusion' }, tB); ok(refused(r), 'B ne prélève pas le stock de A', r.s);
  r = await api('POST', '/inventory/transfers', { itemId: itemB, toSiteId: SITE_B2, quantity: 2, reason: 'Réassort B2' }, tB); ok(is2(r), 'transfert entre les deux sites de B : autorisé', r);
  r = await api('GET', '/vehicles/' + vehA, undefined, tA); ok(r.d && r.d.brand === 'Volvo', 'le véhicule de A est intact après les tentatives de B', r.d && r.d.brand);
  r = await api('GET', '/customers/' + custA, undefined, tA); ok(r.d && r.d.name === 'Client A ' + n, 'le client de A est intact', r.d && r.d.name);

  // Opérations groupées (synchronisation par lot) : suppression et modification d'une fiche de A envoyées par B
  r = await api('POST', '/sync/push', { operations: [
    { entity: 'Vehicle', entityId: vehA, operation: 'DELETE', payload: {} },
    { entity: 'Customer', entityId: custA, operation: 'UPDATE', payload: { name: 'Piraté par lot' } },
  ] }, tB);
  ok(r.s < 500, 'lot de synchronisation de B traité sans erreur serveur', r.s);
  r = await api('GET', '/vehicles/' + vehA, undefined, tA); ok(r.s === 200 && !r.d.deletedAt, 'suppression groupée envoyée par B : le véhicule de A n’est pas supprimé', r.d && r.d.deletedAt);
  r = await api('GET', '/customers/' + custA, undefined, tA); ok(r.d && r.d.name === 'Client A ' + n, 'modification groupée envoyée par B : le client de A est intact', r.d && r.d.name);

  // ================= 4. Plusieurs utilisateurs et appareils (versions, conflits, arbitrage) =================
  const mk = async (tag, role, siteId) => { const q = await api('POST', '/users', { firstName: 'Test', lastName: tag, email: `f6${tag}${n}@test.gn`, password: PW, role, siteId }, tA); ok(q.s === 201, `compte ${role} (${tag}) créé dans A`, q); return q.d && q.d.id; };
  const idU1 = await mk('flotte1', 'GESTIONNAIRE_FLOTTE', SITE_A), idU2 = await mk('flotte2', 'GESTIONNAIRE_FLOTTE', SITE_A);
  const U1 = await login(`f6flotte1${n}@test.gn`, PW); // connexion 3
  const U2 = await login(`f6flotte2${n}@test.gn`, PW); // connexion 4
  const U1bis = await login(`f6flotte1${n}@test.gn`, U1.password); // connexion 5 : 2e appareil du même compte
  ok(!!(U1.accessToken && U2.accessToken && U1bis.accessToken), 'deux gestionnaires connectés, dont un sur deux appareils');
  r = await api('GET', '/vehicles/' + vehA, undefined, U1.accessToken); const v0 = r.d && r.d.version; ok(Number.isInteger(v0), 'la fiche véhicule porte un numéro de version', v0);
  r = await api('PATCH', '/vehicles/' + vehA, { brand: 'Volvo FH' }, U1.accessToken, { 'If-Match': String(v0) });
  ok(is2(r) && r.d && r.d.version === v0 + 1, 'gestionnaire 1 modifie la fiche : version augmentée', r.d && r.d.version);
  r = await api('PATCH', '/vehicles/' + vehA, { brand: 'Volvo FMX' }, U2.accessToken, { 'If-Match': String(v0) });
  ok(r.s === 409 && r.d && r.d.code === 'SYNC_CONFLICT' && r.d.conflictId, 'gestionnaire 2 (version dépassée) : conflit détecté, rien n’est écrasé', r);
  const conflictId = r.d && r.d.conflictId;
  r = await api('GET', '/vehicles/' + vehA, undefined, tA); ok(r.d && r.d.brand === 'Volvo FH', 'la valeur du gestionnaire 1 est conservée', r.d && r.d.brand);
  r = await api('PATCH', '/vehicles/' + vehA, { model: 'FH16' }, U1bis.accessToken, { 'If-Match': String(v0) });
  ok(is2(r), 'même compte sur un 2e appareil avec une version ancienne : pas de conflit avec soi-même', r.s);
  r = await api('GET', '/sync/conflicts', undefined, tA); ok(is2(r) && JSON.stringify(r.d).includes(conflictId), 'le conflit apparaît dans la file d’arbitrage du responsable', r.s);
  r = await api('GET', '/sync/conflicts', undefined, tB); ok(!JSON.stringify(r.d || '').includes(conflictId), 'l’entreprise B ne voit pas les conflits de A', r.s);
  r = await api('POST', `/sync/conflicts/${conflictId}/resolve`, { choice: 'SERVEUR', note: 'test' }, tB); ok(refused(r), 'l’entreprise B ne peut pas arbitrer un conflit de A', r.s);
  r = await api('POST', `/sync/conflicts/${conflictId}/resolve`, { choice: 'SERVEUR', note: 'test' }, U2.accessToken); ok(refused(r), 'l’auteur de la saisie ne peut pas arbitrer son propre conflit', r.s);
  r = await api('POST', `/sync/conflicts/${conflictId}/resolve`, { choice: 'SERVEUR', note: 'Valeur du gestionnaire 1 confirmée' }, tA); ok(is2(r), 'le responsable arbitre : valeur du serveur conservée', r);
  r = await api('POST', `/sync/conflicts/${conflictId}/resolve`, { choice: 'SAISIE', note: 'double' }, tA); ok(refused(r), 'un conflit déjà arbitré ne peut pas l’être une 2e fois', r.s);
  r = await api('GET', '/vehicles/' + vehA, undefined, tA); const vNow = r.d && r.d.version;
  r = await api('POST', '/sync/push', { operations: [{ entity: 'Vehicle', entityId: vehA, operation: 'UPDATE', baseVersion: vNow, payload: { model: 'Hors ligne U2' }, deviceId: 'tel-u2-' + n }] }, U2.accessToken);
  r = await api('POST', '/sync/push', { operations: [{ entity: 'Vehicle', entityId: vehA, operation: 'UPDATE', baseVersion: vNow, payload: { model: 'Hors ligne U1' }, deviceId: 'tel-u1-' + n }] }, U1.accessToken);
  const res = r.d && (r.d.results || r.d)[0]; ok(res && res.status === 'CONFLICT' && res.conflictId, 'synchronisation hors ligne sur une version dépassée : conflit enregistré', res);
  r = await api('GET', '/vehicles/' + vehA, undefined, tA); const vAfter = r.d && r.d.version;
  ok(r.d && r.d.model === 'Hors ligne U2' && vAfter === vNow + 1, 'la modification hors ligne du gestionnaire 2 est appliquée (version +1)', r.d && [r.d.model, r.d.version]);
  r = await api('POST', '/sync/push', { operations: [{ entity: 'Vehicle', entityId: vehA, operation: 'UPDATE', baseVersion: vNow, payload: { model: 'Hors ligne U2' }, deviceId: 'tel-u2-' + n }] }, U2.accessToken);
  r = await api('GET', '/vehicles/' + vehA, undefined, tA);
  ok(r.d && r.d.version === vAfter, 'renvoi à l’identique du même appareil : ignoré, aucune double écriture', r.d && r.d.version);
  r = await api('POST', '/sync/push', { operations: [{ entity: 'Vehicle', entityId: vehA, operation: 'UPDATE', baseVersion: vAfter, payload: { model: 'Hors ligne U2 bis' }, deviceId: 'tel-u2-' + n }] }, U2.accessToken);
  r = await api('GET', '/vehicles/' + vehA, undefined, tA);
  ok(r.d && r.d.model === 'Hors ligne U2 bis', 'seconde modification différente du même appareil : bien appliquée (rien n’est perdu)', r.d && r.d.model);

  // ================= 5. Récupération du mot de passe par code =================
  await pause('limite de connexions par minute');
  r = await api('POST', '/auth/password-reset/request', { identifier: `inconnu${n}@test.gn` });
  const generic = r.d && r.d.message; ok(r.s === 201 && /Si ce compte existe/.test(generic || ''), 'demande pour un compte inexistant : réponse générique', r);
  r = await api('POST', '/auth/password-reset/request', { identifier: `f6flotte1${n}@test.gn` });
  ok(r.s === 201 && r.d && r.d.message === generic, 'demande pour un compte existant : réponse strictement identique (aucune information divulguée)', r);
  r = await api('GET', '/notifications', undefined, tA); ok(JSON.stringify(r.d || '').includes('Mot de passe oublié'), 'sans service d’envoi : le responsable est prévenu', r.s);
  r = await api('POST', `/users/${idU1}/reset-code`, undefined, tB); ok(r.s === 404 || r.s === 403, 'B ne peut pas produire un code pour un compte de A', r.s);
  r = await api('POST', `/users/${idU1}/reset-code`, undefined, U2.accessToken); ok(r.s === 403, 'un gestionnaire ne peut pas produire de code (réservé aux administrateurs)', r.s);
  r = await api('POST', `/users/${idU1}/reset-code`, undefined, tA); const code1 = r.d && r.d.code;
  ok(r.s === 201 && /^\d{6}$/.test(code1 || ''), 'procédure administrateur : code à 6 chiffres remis par l’administrateur', r.s);
  const wrong = code1 === '000000' ? '111111' : '000000';
  r = await api('POST', '/auth/password-reset/confirm', { identifier: `f6flotte1${n}@test.gn`, code: wrong, newPassword: 'Nouveau1234' });
  ok(r.s === 400 && /Essais restants : 4/.test(JSON.stringify(r.d)), 'code faux : refusé, essais restants affichés', r.d);
  r = await api('POST', '/auth/password-reset/confirm', { identifier: `f6flotte1${n}@test.gn`, code: code1, newPassword: 'Nouveau1234' });
  ok(is2(r), 'bon code : mot de passe changé', r);
  r = await api('POST', '/auth/password-reset/confirm', { identifier: `f6flotte1${n}@test.gn`, code: code1, newPassword: 'Autre12345' });
  ok(r.s === 400, 'le même code ne sert qu’une seule fois', r.s);
  r = await api('POST', '/auth/refresh', { refreshToken: U1bis.refreshToken }); ok(r.s === 401, 'après récupération, les sessions ouvertes ne peuvent plus être prolongées', r.s);
  r = await api('POST', '/auth/login', { email: `f6flotte1${n}@test.gn`, password: 'Nouveau1234' }); ok(r.s === 201 && r.d && r.d.accessToken, 'connexion avec le nouveau mot de passe', r.s);
  r = await api('POST', `/users/${idU2}/reset-code`, undefined, tA); const code2 = r.d && r.d.code; ok(/^\d{6}$/.test(code2 || ''), 'nouveau code pour le gestionnaire 2');
  r = await api('POST', `/users/${idU2}/reset-code`, undefined, tA); const code3 = r.d && r.d.code;
  await pause('limite de saisies de code par minute');
  r = await api('POST', '/auth/password-reset/confirm', { identifier: `f6flotte2${n}@test.gn`, code: code2, newPassword: 'Nouveau1234' });
  ok(code2 === code3 || r.s === 400, 'un nouveau code remplace le précédent (l’ancien ne marche plus)', r.s);
  for (let i = 0; i < 4; i++) {
    const w = code3 === '000000' ? '222222' : String((Number(code3) + 1 + i) % 1000000).padStart(6, '0');
    r = await api('POST', '/auth/password-reset/confirm', { identifier: `f6flotte2${n}@test.gn`, code: w, newPassword: 'Nouveau1234' });
  }
  ok(r.s === 400 && /bloqué/.test(JSON.stringify(r.d)), 'au 5e essai faux, le code est bloqué', r.d);
  await pause('limite de saisies de code par minute');
  r = await api('POST', '/auth/password-reset/confirm', { identifier: `f6flotte2${n}@test.gn`, code: code3, newPassword: 'Nouveau1234' });
  ok(r.s === 400, 'code bloqué : même le bon code est refusé ensuite', r.s);
  r = await api('POST', '/auth/password-reset/request', { identifier: `f6flotte2${n}@test.gn` });
  r = await api('POST', '/auth/password-reset/request', { identifier: `f6flotte2${n}@test.gn` });
  r = await api('POST', '/auth/password-reset/request', { identifier: `f6flotte2${n}@test.gn` });
  r = await api('POST', '/auth/password-reset/request', { identifier: `f6flotte2${n}@test.gn` });
  ok(r.s === 429 || (r.d && r.d.message === generic), 'demandes répétées : limitées (anti-abus), toujours sans divulgation', r.s);

  // ================= Livraison 195 : fichiers protégés, numérotation et inscriptions par entreprise =================
  await pause('limite de requêtes par minute');
  // Fichiers : lien signé et temporaire, jamais lisible par la seule adresse
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a0b00000000049454e44ae426082', 'hex');
  const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'photo.png');
  let up = await fetch(B + '/uploads?category=vehicle_photo', { method: 'POST', headers: { authorization: 'Bearer ' + tA }, body: fd });
  const upd = await up.json().catch(() => ({}));
  ok(up.status === 201 && /^\/uploads\/[0-9a-f-]{36}\.png\?e=\d+&t=[\w-]{32}$/.test(upd.url || ''), 'envoi de photo : adresse signée renvoyée', upd);
  const bare = (upd.url || '').split('?')[0];
  let g = await fetch(B + upd.url); ok(g.status === 200 && (await g.arrayBuffer()).byteLength === png.length, 'lien signé : fichier lu, contenu intact', g.status);
  g = await fetch(B + bare); ok(g.status === 403, 'adresse sans signature : refusée', g.status);
  g = await fetch(B + (upd.url || '').replace(/t=[\w-]{4}/, 't=AAAA')); ok(g.status === 403, 'signature modifiée : refusée', g.status);
  g = await fetch(B + bare + '?e=1000000000&t=' + 'A'.repeat(32)); ok(g.status === 403, 'lien expiré : refusé', g.status);
  g = await fetch(B + '/uploads/../../etc/passwd'); ok(g.status === 403 || g.status === 404, 'nom de fichier invalide : refusé', g.status);
  // Une adresse signée renvoyée par l'application est enregistrée sans sa signature, puis re-signée à la lecture
  r = await api('PATCH', '/branding', { logoUrl: upd.url }, tB);
  ok(r.s === 200 || r.s === 403, 'logo de B : adresse signée acceptée (ou licence non payée)', r);
  if (r.s === 200) {
    const row = await api('GET', '/branding', undefined, tB);
    ok(row.d && /\?e=\d+&t=/.test(row.d.logoUrl || ''), 'logo relu avec une signature neuve', row.d);
    const rowA = await api('GET', '/branding', undefined, tA);
    ok(rowA.d && rowA.d.logoUrl !== row.d.logoUrl, 'A ne reçoit pas le logo de B', rowA.d);
  }

  // Numérotation : chaque entreprise a son code et ses propres compteurs
  const numA = await api('GET', '/settings/numbering', undefined, tA), numB = await api('GET', '/settings/numbering', undefined, tB);
  const codeA = JSON.stringify(numA.d || {}).match(/"companyCode":"([A-Z0-9]+)"/), codeB = JSON.stringify(numB.d || {}).match(/"companyCode":"([A-Z0-9]+)"/);
  ok(is2(numA) && is2(numB) && codeA && codeB && codeA[1] !== codeB[1], 'numérotation : un code distinct par entreprise', { a: codeA && codeA[1], b: codeB && codeB[1] });

  // Inscriptions de chauffeurs : rattachées à l'entreprise du lien partagé
  const lnk = await api('GET', '/driver-signup/link', undefined, tB);
  ok(is2(lnk) && lnk.d && lnk.d.code && lnk.d.path === '/?entreprise=' + lnk.d.code, 'lien d’inscription propre à B', lnk.d);
  const tel = '62' + n;
  r = await api('POST', '/driver-signup', { firstName: 'Mamadou', lastName: 'Test', phone: tel, company: lnk.d && lnk.d.code });
  ok(is2(r), 'demande d’inscription envoyée avec le lien de B', r);
  const lb = await api('GET', '/driver-signup', undefined, tB), la = await api('GET', '/driver-signup', undefined, tA);
  const has = (x) => (Array.isArray(x.d) ? x.d : []).some((y) => y.phone === tel);
  ok(has(lb) && !has(la), 'la demande apparaît chez B et pas chez A', { b: has(lb), a: has(la) });
  const sid = (Array.isArray(lb.d) ? lb.d : []).find((y) => y.phone === tel);
  if (sid) { r = await api('POST', `/driver-signup/${sid.id}/reject`, {}, tA); ok(refused(r), 'A ne peut pas traiter une demande de B', r.s); }

  // Rattachement des chauffeurs : un compte ne se lie qu'à une fiche du même site et de la même entreprise
  const em2 = `chf2site${n}@test.gn`, emB = `chfb${n}@test.gn`;
  r = await api('POST', '/users', { firstName: 'Kaba', lastName: 'Site2', email: em2, password: PW, role: 'CHAUFFEUR', siteId: SITE_A2 }, tA); ok(r.s === 201, 'A : compte chauffeur créé sur son second site', r);
  r = await api('POST', '/users', { firstName: 'Diallo', lastName: 'EntB', email: emB, password: PW, role: 'CHAUFFEUR', siteId: SITE_B1 }, tB); ok(r.s === 201, 'B : compte chauffeur créé', r);
  r = await api('POST', '/drivers', { firstName: 'Fiche', lastName: 'SiteA' + n, phone: '64' + n, licenseNumber: 'RA' + n, licenseExpiryDate: new Date(Date.now() + 365 * 864e5).toISOString(), activity: 'TRUCK', siteId: SITE_A }, tA); ok(r.s === 201, 'A : fiche chauffeur sur le site principal', r); const drvA = r.d && r.d.id;
  r = await api('POST', '/driver-admin/link', { driverId: drvA, email: em2 }, tA); ok(r.s === 400, 'compte d’un autre site lié à la fiche : refusé → 400', r);
  r = await api('POST', '/driver-admin/link', { driverId: drvA, email: emB }, tA); ok(r.s === 400 || r.s === 404, 'compte d’une autre entreprise lié à la fiche : refusé', r.s);

  console.log(fails ? `\n${fails} échec(s)` : '\nTous les contrôles multi-entreprises sont passés.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
