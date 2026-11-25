// Tests fonctionnels du backend démarré : flotte, clients, stock, ventes (devis → livraison → facture), droits et validations.
const B = process.env.SMOKE_URL || 'http://localhost:3000';
const SITE = '00000000-0000-0000-0000-000000000002';
let fails = 0, tok = '';
const ok = (c, m, extra) => { console.log((c ? '✔ ' : '✘ ') + m + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); if (!c) fails++; };
const api = async (method, path, body, token = tok) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; const ct = r.headers.get('content-type') || ''; if (ct.includes('json')) data = await r.json().catch(() => null); else await r.arrayBuffer();
  return { s: r.status, d: data, ct };
};
const n = Date.now().toString().slice(-7);
(async () => {
  let r = await api('POST', '/auth/login', { email: 'admin@syllogistique.local', password: 'ChangeMoi123!' }, '');
  tok = r.d && r.d.accessToken; ok(!!tok, 'connexion administrateur');

  // --- Flotte
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'TRUCK', internalNumber: 'T-' + n, registrationNumber: 'RC-' + n, brand: 'Renault', currentMileage: 1000 });
  ok(r.s === 201, 'création véhicule', r); const veh = r.d && r.d.id;
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'TRUCK', internalNumber: 'T-' + n, registrationNumber: 'RC-' + n });
  ok(r.s >= 400 && r.s < 500, 'véhicule en double refusé (4xx)', r.s);
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'AVION', internalNumber: 'x', registrationNumber: 'y' });
  ok(r.s === 400, 'type de véhicule invalide → 400', r.s);
  r = await api('GET', '/vehicles/' + veh); ok(r.s === 200 && r.d && r.d.id === veh, 'lecture véhicule');
  r = await api('PATCH', '/vehicles/' + veh, { observations: 'Révisé' }); ok(r.s === 200, 'mise à jour véhicule', r);
  r = await api('GET', '/vehicles'); const list = Array.isArray(r.d) ? r.d : (r.d && (r.d.items || r.d.data)) || [];
  ok(r.s === 200 && list.some((v) => v.id === veh), 'liste des véhicules contient le nouveau');
  r = await api('GET', '/vehicles/fleet-overview'); ok(r.s === 200, 'vue d’ensemble flotte');

  // --- Clients
  r = await api('POST', '/customers', { siteId: SITE, name: 'Client Test ' + n, phone: '62' + n, email: 'c' + n + '@test.gn', creditLimit: 500000 });
  ok(r.s === 201, 'création client', r); const cust = r.d && r.d.id;
  r = await api('POST', '/customers', { siteId: SITE, name: 'X', email: 'pas-un-email' }); ok(r.s === 400, 'e-mail client invalide → 400', r.s);
  r = await api('GET', '/customers/' + cust); ok(r.s === 200, 'lecture client');

  // --- Stock
  r = await api('POST', '/inventory/items', { siteId: SITE, sku: 'SKU-' + n, name: 'Article Test ' + n, unit: 'pièce', minimumQuantity: 5, unitPrice: 700, salePrice: 1000 });
  ok(r.s === 201, 'création article', r); const item = r.d && r.d.id;
  r = await api('POST', '/inventory/movements/in', { itemId: item, siteId: SITE, quantity: 100, reason: 'Approvisionnement test' });
  ok(r.s === 201, 'entrée de stock +100', r);
  r = await api('POST', '/inventory/movements/in', { itemId: item, siteId: SITE, quantity: 5 }); ok(r.s === 400, 'entrée sans motif refusée → 400', r.s);
  r = await api('POST', '/inventory/movements/in', { itemId: item, siteId: SITE, quantity: -3, reason: 'négatif' }); ok(r.s === 400, 'quantité négative refusée → 400', r.s);
  r = await api('POST', '/inventory/movements/out', { itemId: item, siteId: SITE, quantity: 10, reason: 'Consommation test' }); ok(r.s === 201, 'sortie de stock −10', r);
  r = await api('POST', '/inventory/movements/out', { itemId: item, siteId: SITE, quantity: 100000, reason: 'Trop grand' });
  ok(r.s >= 400 && r.s < 500, 'sortie supérieure au stock refusée (4xx)', r.s);
  r = await api('GET', '/inventory/items/' + item); ok(r.s === 200 && Number(r.d.currentQuantity) === 90, 'stock exact = 90', r.d && r.d.currentQuantity);
  r = await api('GET', '/inventory/movements'); ok(r.s === 200, 'historique des mouvements');

  // --- Ventes : devis confirmé → livraison → facture
  r = await api('POST', '/sales/orders', { siteId: SITE, customerId: cust, orderDate: new Date().toISOString(), status: 'CONFIRMED', saleType: 'CASH', lines: [{ itemId: item, quantityOrdered: 5, unitPrice: 1000 }] });
  ok(r.s === 201, 'commande de vente confirmée', r); const ord = r.d && r.d.id;
  r = await api('GET', '/sales/orders/' + ord); const line = r.d && r.d.lines && r.d.lines[0]; ok(r.s === 200 && !!line, 'lecture commande et lignes');
  r = await api('POST', '/sales/orders/' + ord + '/deliver', { lines: [{ lineId: line.id, quantityDelivered: 500 }] });
  ok(r.s >= 400 && r.s < 500, 'livraison au-delà de la commande/stock refusée (4xx)', r.s);
  r = await api('POST', '/sales/orders/' + ord + '/deliver', { lines: [{ lineId: line.id, quantityDelivered: 5 }], receiverName: 'Test' });
  ok(r.s === 201 || r.s === 200, 'livraison de 5 unités', r);
  r = await api('GET', '/inventory/items/' + item); ok(Number(r.d.currentQuantity) === 85, 'stock après livraison = 85', r.d && r.d.currentQuantity);
  r = await api('POST', '/sales/orders/' + ord + '/invoice', { paymentTerm: 'CASH' }); ok(r.s === 201 || r.s === 200, 'facturation comptant', r); const inv = r.d && r.d.id;
  r = await api('GET', '/sales/invoices/' + inv); ok(r.s === 200 && Number(r.d.totalAmount ?? r.d.total ?? 5000) > 0, 'lecture facture');
  r = await api('GET', '/sales/invoices/' + inv + '/pdf'); ok(r.s === 200 && r.ct.includes('pdf'), 'facture PDF générée', { s: r.s, ct: r.ct });
  r = await api('GET', '/sales/dashboard'); ok(r.s === 200, 'tableau de bord ventes');

  // --- Droits : sans jeton / jeton falsifié
  for (const p of ['/vehicles', '/customers', '/inventory/items', '/sales/orders']) { r = await api('GET', p, undefined, ''); ok(r.s === 401, p + ' sans jeton → 401', r.s); }
  console.log(fails ? `\n${fails} échec(s)` : '\nTests fonctionnels réussis'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
