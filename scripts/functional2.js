// Tests fonctionnels n°2 : utilisateurs et droits, achats, chauffeurs et transports, dépenses, caisse, documents, notifications, audit.
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
const now = new Date().toISOString(), later = new Date(Date.now() + 3600e3).toISOString();
const is2 = (r) => r.s === 200 || r.s === 201, is4 = (r) => r.s >= 400 && r.s < 500;
(async () => {
  let r = await api('POST', '/auth/login', { email: 'admin@syllogistique.local', password: 'ChangeMoi123!' }, '');
  tok = r.d && r.d.accessToken; const admin = tok; ok(!!admin, 'connexion administrateur');

  // --- Utilisateurs et droits
  const mk = async (role, tag) => api('POST', '/users', { firstName: 'Test', lastName: tag, email: `${tag}${n}@test.gn`, password: PW, role, siteId: SITE });
  r = await api('POST', '/users', { firstName: 'A', lastName: 'B', email: 'faible' + n + '@test.gn', password: 'court', role: 'LECTEUR' }); ok(r.s === 400, 'mot de passe faible refusé → 400', r.s);
  r = await mk('MAGASINIER', 'mag'); ok(r.s === 201, 'création utilisateur magasinier', r);
  r = await mk('MAGASINIER', 'mag'); ok(is4(r), 'e-mail déjà utilisé refusé (4xx)', r.s);
  r = await mk('LECTEUR', 'lec'); ok(r.s === 201, 'création utilisateur lecteur', r);
  r = await mk('CAISSIER', 'cai'); ok(r.s === 201, 'création utilisateur caissier', r);
  r = await api('GET', '/users'); ok(r.s === 200 && rows(r.d).length >= 4, 'liste des utilisateurs');
  const login = async (tag) => { const x = await api('POST', '/auth/login', { email: `${tag}${n}@test.gn`, password: PW }, ''); return x.d && x.d.accessToken; };
  const mag = await login('mag'), lec = await login('lec'), cai = await login('cai'); ok(!!mag && !!lec && !!cai, 'connexion des trois nouveaux comptes');
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'TRUCK', internalNumber: 'L' + n, registrationNumber: 'L' + n }, lec); ok(r.s === 403, 'lecteur ne peut pas créer un véhicule → 403', r.s);
  r = await api('GET', '/vehicles', undefined, lec); ok(r.s === 200, 'lecteur peut consulter les véhicules');
  r = await api('POST', '/users', { firstName: 'A', lastName: 'B', email: 'x' + n + '@test.gn', password: PW, role: 'LECTEUR' }, mag); ok(r.s === 403, 'magasinier ne peut pas créer un utilisateur → 403', r.s);
  r = await api('GET', '/audit', undefined, mag); ok(r.s === 403, 'magasinier ne peut pas lire le journal d’audit → 403', r.s);

  // --- Achats : fournisseur → commande → confirmation → réception → stock
  r = await api('POST', '/suppliers', { name: 'Fournisseur ' + n, phone: '62' + n, email: 'f' + n + '@test.gn' }); ok(r.s === 201, 'création fournisseur', r); const sup = r.d && r.d.id;
  r = await api('POST', '/inventory/items', { siteId: SITE, sku: 'ACH-' + n, name: 'Article achat ' + n, unitPrice: 500, salePrice: 900 }); const item = r.d && r.d.id; ok(!!item, 'article pour achat');
  r = await api('POST', '/purchases/orders', { siteId: SITE, supplierId: sup, orderDate: now, lines: [{ itemId: item, quantityOrdered: 20, unitPrice: 500 }] }, mag); ok(r.s === 201, 'commande d’achat créée par le magasinier', r); const po = r.d && r.d.id;
  r = await api('POST', '/purchases/orders', { siteId: SITE, supplierId: sup, orderDate: now, lines: [{ itemId: item, quantityOrdered: -2, unitPrice: 500 }] }); ok(r.s === 400, 'quantité d’achat négative refusée → 400', r.s);
  r = await api('POST', `/purchases/orders/${po}/confirm`, {}); ok(is2(r), 'confirmation de la commande', r);
  r = await api('GET', `/purchases/orders/${po}`); const pl = r.d && r.d.lines && r.d.lines[0]; ok(!!pl, 'lecture lignes de commande');
  r = await api('POST', `/purchases/orders/${po}/receive`, { lines: [{ lineId: pl.id, quantityReceived: 20, quantityRejected: 0 }], deliveryNoteNo: 'BL-' + n }); ok(is2(r), 'réception de 20 unités', r);
  r = await api('GET', '/inventory/items/' + item); ok(Number(r.d.currentQuantity) === 20, 'stock après réception = 20', r.d && r.d.currentQuantity);
  r = await api('POST', `/purchases/orders/${po}/invoice`, { paymentTerm: 'CREDIT', dueDate: later }); ok(is2(r), 'facture fournisseur à crédit', r); const pinv = r.d && r.d.id;
  r = await api('POST', '/payments', { direction: 'OUT', method: 'CASH', amount: 1000, paymentDate: now, purchaseInvoiceId: pinv }); ok(is2(r), 'paiement partiel de la facture fournisseur', r);
  r = await api('POST', '/payments', { direction: 'OUT', method: 'CASH', amount: -5, paymentDate: now }); ok(r.s === 400, 'paiement négatif refusé → 400', r.s);
  r = await api('GET', '/purchases/orders/' + po + '/pdf'); ok(r.s === 200 && r.ct.includes('pdf'), 'bon de commande PDF');
  r = await api('GET', '/purchases/reorder?siteId=' + SITE); ok(r.s === 200, 'suggestions de réapprovisionnement');
  r = await api('POST', '/needs', { siteId: SITE, title: 'Besoin test', lines: [{ designation: 'Pneus', quantity: 4 }] }); ok(is2(r) || is4(r), 'état des besoins : réponse maîtrisée (' + r.s + ')');

  // --- Chauffeurs et transports
  r = await api('POST', '/drivers', { siteId: SITE, firstName: 'Mamadou', lastName: 'Test' + n, licenseNumber: 'P' + n, activity: 'TRUCK' }); ok(r.s === 201, 'création chauffeur', r); const drv = r.d && r.d.id;
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'TRUCK', internalNumber: 'TR' + n, registrationNumber: 'TR' + n, currentMileage: 1000 }); const veh = r.d && r.d.id;
  r = await api('POST', '/trips', { vehicleId: veh, driverId: drv, siteId: SITE, tripDate: now, startTime: now, startMileage: 1000, destination: 'Kankan' }); ok(r.s === 201, 'création du transport', r); const trip = r.d && r.d.id;
  r = await api('PATCH', `/trips/${trip}/close`, { endTime: later, endMileage: 500 }); ok(is4(r), 'clôture avec compteur inférieur au départ refusée (4xx)', r.s);
  r = await api('PATCH', `/trips/${trip}/close`, { endTime: later, endMileage: 1250, endCondition: 'RAS' }); ok(is2(r), 'clôture du transport (250 km)', r);
  r = await api('GET', '/vehicles/' + veh); ok(Number(r.d.currentMileage) === 1250, 'compteur du véhicule mis à jour = 1250', r.d && r.d.currentMileage);
  r = await api('GET', `/trips/${trip}/pdf`); ok(r.s === 200 && r.ct.includes('pdf'), 'fiche de transport PDF');
  r = await api('POST', '/drivers/attendance', { driverId: drv, siteId: SITE, date: now, status: 'PRESENT' }); ok(is2(r), 'pointage du chauffeur', r);

  // --- Dépenses, carburant, documents, maintenance
  r = await api('POST', '/expenses', { vehicleId: veh, category: 'FUEL', amount: 150000, expenseDate: now, description: 'Plein' }); ok(is2(r), 'dépense carburant', r);
  r = await api('POST', '/expenses', { category: 'INVENTE', amount: 10, expenseDate: now }); ok(r.s === 400, 'catégorie de dépense invalide → 400', r.s);
  r = await api('GET', '/costs/summary'); ok(r.s === 200, 'synthèse des coûts');
  r = await api('POST', '/documents', { vehicleId: veh, type: 'ASSURANCE', fileUrl: '/uploads/test.pdf', expiryDate: new Date(Date.now() + 10 * 864e5).toISOString() }); ok(is2(r), 'document véhicule (assurance)', r);
  r = await api('GET', '/documents/compliance'); ok(r.s === 200, 'conformité des documents');
  r = await api('GET', '/maintenance/types'); ok(r.s === 200, 'types de maintenance');
  r = await api('GET', '/maintenance/alerts'); ok(r.s === 200, 'alertes de maintenance');

  // --- Caisse
  r = await api('POST', '/cash-sessions/open', { siteId: SITE, openingFloat: 50000 }, cai); ok(is2(r), 'ouverture de caisse', r); const cs = r.d && r.d.id;
  r = await api('POST', '/cash-sessions/open', { siteId: SITE, openingFloat: 1 }, cai); ok(is4(r), 'deuxième caisse ouverte refusée (4xx)', r.s);
  r = await api('POST', `/cash-sessions/${cs}/expenses`, { amount: 5000, reason: 'Fournitures' }, cai); ok(is2(r), 'dépense de caisse', r);
  r = await api('POST', `/cash-sessions/${cs}/close`, { countedCash: 45000 }, cai); ok(is2(r), 'clôture de caisse', r);
  r = await api('POST', `/cash-sessions/${cs}/validate`, {}, cai); ok(r.s === 403, 'le caissier ne peut pas valider sa propre caisse → 403', r.s);
  r = await api('POST', `/cash-sessions/${cs}/validate`, { note: 'ok' }); ok(is2(r) || is4(r), 'validation hiérarchique de la caisse : réponse maîtrisée (' + r.s + ')');

  // --- Notifications et audit
  r = await api('GET', '/notifications'); ok(r.s === 200, 'liste des notifications');
  r = await api('GET', '/audit'); const au = rows(r.d); ok(r.s === 200 && au.length > 0, 'journal d’audit non vide (' + au.length + ' lignes)');
  console.log(fails ? `\n${fails} échec(s)` : '\nTests fonctionnels n°2 réussis'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
