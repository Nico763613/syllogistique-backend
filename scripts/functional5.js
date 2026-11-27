// Tests fonctionnels n°5 (base de test réelle) : sécurité et circuits restants.
// Cloisonnement entre sites, sessions (suspension, déconnexion, jetons), mot de passe provisoire imposé,
// invitation de bout en bout, caisse (caissier → commercial → opérations), paiement mobile à confirmer,
// et droits des profils non couverts ailleurs (lecteur, pointeur, HSE, commercial, caissier).
const B = process.env.SMOKE_URL || 'http://localhost:3000';
const SITE = '00000000-0000-0000-0000-000000000002';
let fails = 0, tok = '';
const ok = (c, m, extra) => { console.log((c ? '✔ ' : '✘ ') + m + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); if (!c) fails++; };
const api = async (method, path, body, ...rest) => {
  const token = rest.length ? (rest[0] || 'jeton-absent') : tok;
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; const ct = r.headers.get('content-type') || ''; if (ct.includes('json')) data = await r.json().catch(() => null); else await r.arrayBuffer();
  return { s: r.status, d: data };
};
const pause = () => { console.log('… pause de 61 s (limite de 5 connexions par minute)'); return new Promise((res) => setTimeout(res, 61000)); };
const login = async (email, password) => { const r = await api('POST', '/auth/login', { email, password }, ''); return r.d || {}; };
const n = Date.now().toString().slice(-7), PW = 'Test1234x', now = new Date().toISOString();
const is2 = (r) => r.s === 200 || r.s === 201;

(async () => {
  tok = (await login('admin@syllogistique.local', 'ChangeMoi123!')).accessToken; ok(!!tok, 'connexion administrateur'); // connexion 1
  const mk = async (tag, role, siteId = SITE) => { const r = await api('POST', '/users', { firstName: 'Test', lastName: tag, email: `f5${tag}${n}@test.gn`, password: PW, role, siteId }); ok(r.s === 201, `compte ${role} (${tag})`, r); return r.d && r.d.id; };

  // --- Cloisonnement entre sites (deux sites, même logique que deux entreprises)
  let r = await api('POST', '/sites', { name: 'Site B ' + n, location: 'Kamsar' }); ok(r.s === 201, 'second site créé', r); const SITEB = r.d && r.d.id;
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'TRUCK', internalNumber: 'A' + n, registrationNumber: 'A' + n }); const vehA = r.d && r.d.id; ok(!!vehA, 'véhicule du site A');
  r = await api('POST', '/vehicles', { siteId: SITEB, vehicleType: 'TRUCK', internalNumber: 'B' + n, registrationNumber: 'B' + n }); const vehB = r.d && r.d.id; ok(!!vehB, 'véhicule du site B');
  r = await api('POST', '/customers', { siteId: SITE, name: 'Client A ' + n, phone: '62' + n }); const custA = r.d && r.d.id; ok(!!custA, 'client du site A');
  r = await api('POST', '/inventory/items', { siteId: SITE, sku: 'F5-' + n, name: 'Article A ' + n, unit: 'pièce', unitPrice: 700, salePrice: 1000 }); const itemA = r.d && r.d.id; ok(!!itemA, 'article du site A');
  await mk('logib', 'ADMIN_LOGISTIQUE', SITEB);
  const usrA = await mk('maga', 'MAGASINIER');
  const usrPw = await mk('pw', 'COMPTABLE');
  await mk('lect', 'LECTEUR'); await mk('poin', 'POINTEUR'); await mk('ghse', 'GESTIONNAIRE_HSE'); await mk('com', 'RESPONSABLE_COMMERCIAL'); await mk('ops', 'RESPONSABLE_OPERATIONS');
  const T = {};
  for (const t of ['logib', 'maga', 'lect', 'com']) T[t] = (await login(`f5${t}${n}@test.gn`, PW)).accessToken; // connexions 2 à 5
  ok(Object.values(T).every(Boolean), 'connexion des comptes (lot 1)');
  r = await api('GET', `/vehicles/${vehB}`, undefined, T.logib); ok(r.s === 200, 'site B lit son propre véhicule', r.s);
  r = await api('GET', `/vehicles/${vehA}`, undefined, T.logib); ok(r.s === 404, 'site B ne lit pas un véhicule du site A par son identifiant → 404', r.s);
  r = await api('PATCH', `/vehicles/${vehA}`, { observations: 'piratage' }, T.logib); ok(r.s === 404, 'site B ne modifie pas un véhicule du site A → 404', r.s);
  r = await api('GET', `/customers/${custA}`, undefined, T.logib); ok(r.s === 404 || r.s === 403, 'site B ne lit pas un client du site A', r.s);
  r = await api('GET', `/inventory/items/${itemA}`, undefined, T.logib); ok(r.s === 404 || r.s === 403, 'site B ne lit pas un article du site A', r.s);
  r = await api('GET', `/vehicles?siteId=${SITE}`, undefined, T.logib); ok(r.s === 403, 'site B ne filtre pas sur le site A → 403', r.s);
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'TRUCK', internalNumber: 'X' + n, registrationNumber: 'X' + n }, T.logib); ok(r.s === 403, 'site B ne crée rien sur le site A → 403', r.s);
  r = await api('GET', '/vehicles', undefined, T.logib); ok(r.s === 200 && !JSON.stringify(r.d).includes(vehA), 'la liste du site B ne contient aucun véhicule du site A', r.s);
  r = await api('GET', `/vehicles/${vehA}`); ok(r.s === 200, 'le Master Admin garde la vue sur tous les sites', r.s);

  // --- Lecteur : consultation seulement
  r = await api('GET', '/vehicles', undefined, T.lect); ok(r.s === 200, 'le lecteur consulte la flotte', r.s);
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'TRUCK', internalNumber: 'L' + n, registrationNumber: 'L' + n }, T.lect); ok(r.s === 403, 'le lecteur ne crée pas de véhicule → 403', r.s);
  r = await api('POST', '/customers', { siteId: SITE, name: 'Lecteur ' + n }, T.lect); ok(r.s === 403, 'le lecteur ne crée pas de client → 403', r.s);
  r = await api('POST', '/payments', { direction: 'IN', method: 'CASH', amount: 1000, paymentDate: now }, T.lect); ok(r.s === 403, 'le lecteur n’enregistre pas de paiement → 403', r.s);

  // --- Sessions : suspension immédiate, jetons de renouvellement révoqués
  r = await api('GET', '/inventory/items', undefined, T.maga); ok(r.s === 200, 'le gestionnaire de stock travaille normalement', r.s);
  r = await api('PATCH', `/users/${usrA}`, { status: 'SUSPENDED' }); ok(is2(r), 'administrateur suspend le compte', r);
  r = await api('GET', '/inventory/items', undefined, T.maga); ok(r.s === 401, 'compte suspendu : accès coupé immédiatement → 401', r.s);
  r = await api('PATCH', `/users/${usrA}`, { status: 'ACTIVE' }); ok(is2(r), 'compte réactivé', r);

  await pause();
  const mg = await login(`f5maga${n}@test.gn`, PW); ok(!!mg.accessToken && !!mg.refreshToken, 'nouvelle connexion après réactivation'); // 1
  r = await api('POST', '/auth/refresh', { refreshToken: mg.refreshToken }, ''); ok(is2(r) && r.d.accessToken, 'renouvellement de session', r.s); const ref2 = r.d && r.d.refreshToken;
  r = await api('POST', '/auth/logout', {}, mg.accessToken); ok(is2(r), 'déconnexion', r.s);
  r = await api('POST', '/auth/refresh', { refreshToken: ref2 || mg.refreshToken }, ''); ok(r.s === 401 || r.s === 403, 'après déconnexion, le jeton de renouvellement est refusé', r.s);
  r = await api('GET', '/vehicles', undefined, 'faux.jeton.signature'); ok(r.s === 401, 'jeton falsifié refusé → 401', r.s);

  // --- Mot de passe provisoire imposé par le serveur
  r = await api('POST', `/users/${usrPw}/reset-password`, { newPassword: 'Provisoire9' }); ok(is2(r), 'administrateur réinitialise un mot de passe', r);
  const pw = await login(`f5pw${n}@test.gn`, 'Provisoire9'); ok(!!pw.accessToken, 'connexion avec le mot de passe provisoire'); // 2
  r = await api('GET', '/driver-admin/expenses', undefined, pw.accessToken); ok(r.s === 403, 'tant que le mot de passe provisoire n’est pas changé : accès bloqué → 403', r.s);
  r = await api('GET', '/auth/me', undefined, pw.accessToken); ok(r.s === 200 || r.s === 404, 'les routes du compte restent accessibles', r.s);
  r = await api('POST', '/auth/change-password', { currentPassword: 'Provisoire9', newPassword: 'Nouveau2026x' }, pw.accessToken); ok(is2(r), 'l’utilisateur choisit son mot de passe', r);
  r = await api('GET', '/driver-admin/expenses', undefined, pw.accessToken); ok(r.s === 200, 'accès rétabli après le changement', r.s);

  // --- Invitation de bout en bout (compte créé sans mot de passe connu)
  const tel = '6' + n + '7';
  r = await api('POST', '/staff', { firstName: 'Fanta', lastName: 'Caisse', phone: tel, role: 'CAISSIER', siteId: SITE }); ok(r.s === 201, 'compte caissier créé (mot de passe inconnu)', r); const caiId = r.d && r.d.id;
  r = await api('POST', '/staff/invite', { userId: caiId, appUrl: 'https://exemple.test/app/' }); ok(is2(r) && /invite=/.test(JSON.stringify(r.d)), 'invitation individuelle générée', r);
  const token = (JSON.stringify(r.d).match(/invite=([A-Za-z0-9_-]+)/) || [])[1];
  r = await api('POST', '/auth/invite/info', { token: token + 'x' }, ''); ok(r.s >= 400 && r.s < 500, 'invitation modifiée refusée', r.s);
  r = await api('POST', '/auth/invite/info', { token }, ''); ok(is2(r), 'invitation reconnue', r.s);
  r = await api('POST', '/auth/invite/accept', { token, password: 'Caisse2026x' }, ''); ok(is2(r), 'le caissier crée son mot de passe', r);
  r = await api('POST', '/auth/invite/accept', { token, password: 'Autre2026x' }, ''); ok(r.s >= 400 && r.s < 500, 'une invitation ne sert qu’une fois', r.s);
  const cai = (await login(`${tel.slice(-9)}@staff.local`, 'Caisse2026x')).accessToken; ok(!!cai, 'le caissier se connecte avec son mot de passe'); // 3

  // --- Caisse : caissier → responsable commercial → responsable des opérations
  r = await api('POST', '/cash-sessions/open', { siteId: SITE, openingFloat: 100000 }, cai); ok(is2(r), 'ouverture de caisse', r); const cs = r.d && r.d.id;
  r = await api('POST', `/cash-sessions/${cs}/expenses`, { amount: 500000, reason: 'Trop' }, cai); ok(r.s === 400, 'décaissement supérieur aux espèces refusé → 400', r.s);
  r = await api('POST', `/cash-sessions/${cs}/expenses`, { amount: 10000, reason: 'Carburant groupe' }, cai); ok(is2(r), 'décaissement enregistré', r);
  r = await api('POST', `/cash-sessions/${cs}/close`, { countedCash: 88000 }, cai); ok(is2(r), 'clôture avec un écart de 2 000', r);
  r = await api('POST', `/cash-sessions/${cs}/ops-validate`, {}, T.com); ok(r.s === 403, 'le commercial ne fait pas la validation finale → 403', r.s);
  r = await api('POST', `/cash-sessions/${cs}/validate`, {}, T.com); ok(r.s === 400, 'écart non justifié : validation refusée → 400', r.s);
  r = await api('POST', `/cash-sessions/${cs}/validate`, { note: 'Écart expliqué : monnaie rendue en trop' }, T.com); ok(is2(r), 'le commercial vérifie la caisse avec justification', r);
  const ops = (await login(`f5ops${n}@test.gn`, PW)).accessToken; // 4
  r = await api('POST', `/cash-sessions/${cs}/ops-validate`, {}, ops); ok(is2(r), 'le responsable des opérations valide la caisse', r);
  r = await api('POST', `/cash-sessions/${cs}/ops-validate`, {}, ops); ok(r.s === 400, 'double validation refusée → 400', r.s);

  // --- Paiement mobile déclaré par le caissier, confirmé par la comptabilité
  r = await api('POST', '/inventory/movements/in', { itemId: itemA, siteId: SITE, quantity: 10, reason: 'Stock test' }); ok(is2(r), 'entrée de stock', r);
  r = await api('POST', '/sales/orders', { siteId: SITE, customerId: custA, orderDate: now, status: 'CONFIRMED', saleType: 'CREDIT', lines: [{ itemId: itemA, quantityOrdered: 4, unitPrice: 1000 }] }); const ord = r.d && r.d.id; ok(!!ord, 'commande client', r);
  r = await api('GET', '/sales/orders/' + ord); const line = r.d && r.d.lines && r.d.lines[0];
  r = await api('POST', `/sales/orders/${ord}/deliver`, { lines: [{ lineId: line && line.id, quantityDelivered: 4 }], receiverName: 'Client' }); ok(is2(r), 'livraison', r);
  r = await api('POST', `/sales/orders/${ord}/invoice`, { paymentTerm: 'CREDIT', dueDate: new Date(Date.now() + 30 * 864e5).toISOString() }); ok(is2(r), 'facture à crédit', r); const inv = r.d && r.d.id;
  r = await api('POST', '/payments/pending', { salesInvoiceId: inv, method: 'CASH', amount: 1000, externalRef: 'X' }, cai); ok(r.s === 400, 'seul un paiement mobile peut être mis en attente → 400', r.s);
  r = await api('POST', '/payments/pending', { salesInvoiceId: inv, method: 'ORANGE_MONEY', amount: 99999999, externalRef: 'OM' + n }, cai); ok(r.s === 400, 'montant supérieur au reste à payer refusé → 400', r.s);
  r = await api('POST', '/payments/pending', { salesInvoiceId: inv, method: 'ORANGE_MONEY', amount: 2000, externalRef: 'OM' + n, paymentDate: now }, cai); ok(is2(r), 'le caissier déclare un paiement Orange Money', r); const pend = r.d && r.d.id;
  r = await api('POST', '/payments/pending', { salesInvoiceId: inv, method: 'ORANGE_MONEY', amount: 1000, externalRef: 'OM' + n, paymentDate: now }, cai); ok(r.s === 400, 'même numéro de transaction refusé → 400', r.s);
  r = await api('POST', `/payments/pending/${pend}/confirm`, {}, cai); ok(r.s === 403, 'le caissier ne confirme pas son propre encaissement → 403', r.s);
  r = await api('POST', `/payments/pending/${pend}/confirm`, {}, pw.accessToken); ok(is2(r), 'la comptabilité confirme le paiement', r);
  r = await api('GET', '/sales/invoices/' + inv); ok(r.s === 200 && Number(r.d.amountPaid) === 2000, 'la facture affiche 2 000 payés', r.d && r.d.amountPaid);

  // --- Profils terrain restants
  await pause();
  const poin = (await login(`f5poin${n}@test.gn`, PW)).accessToken, ghse = (await login(`f5ghse${n}@test.gn`, PW)).accessToken; // 1-2
  r = await api('GET', '/pointer/day', undefined, poin); ok(r.s === 200, 'le pointeur ouvre son comptage du jour', r.s);
  r = await api('GET', '/sales/invoices', undefined, poin); ok(r.s === 403, 'le pointeur ne voit pas les factures → 403', r.s);
  r = await api('GET', '/hse/incidents', undefined, ghse); ok(r.s === 200, 'le responsable HSE consulte les incidents', r.s);
  r = await api('POST', '/staff', { firstName: 'Agent', lastName: 'Hse', phone: '6' + n + '8', role: 'AGENT_HSE', siteId: SITE }, ghse); ok(r.s === 201, 'le responsable HSE crée un agent HSE', r);
  r = await api('POST', '/staff', { firstName: 'Agent', lastName: 'Stock', phone: '6' + n + '9', role: 'MAGASINIER', siteId: SITE }, ghse); ok(r.s === 403, 'le responsable HSE ne crée pas de gestionnaire de stock → 403', r.s);
  r = await api('GET', '/sales/invoices', undefined, T.com); ok(r.s === 200, 'le commercial consulte les factures', r.s);
  r = await api('POST', '/purchases/orders/x/confirm', {}, T.com); ok(r.s === 403, 'le commercial ne confirme pas d’achat → 403', r.s);
  r = await api('GET', '/users', undefined, cai); ok(r.s === 403, 'le caissier ne voit pas les comptes → 403', r.s);

  console.log(fails ? `\n${fails} échec(s)` : '\nTous les tests de sécurité et de circuits sont passés.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
