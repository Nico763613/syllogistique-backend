// Tests fonctionnels n°7 (base de test réelle) : modules qui n'avaient pas encore de test direct.
//  - transferts entre sites : expédition, stock en transit, réception, annulation, refus (même site, stock
//    insuffisant, double réception, site hors périmètre, profil non autorisé) ;
//  - rapports, tableaux de bord, recherche, QR codes, signalements, licence, envoi d'e-mail de test, simulation.
// À lancer après functional6.js (qui garantit un second site dans l'entreprise A). Aucune donnée réelle.
const B = process.env.SMOKE_URL || 'http://localhost:3000';
const SITE = '00000000-0000-0000-0000-000000000002';
let fails = 0;
const ok = (c, m, extra) => { console.log((c ? '✔ ' : '✘ ') + m + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); if (!c) fails++; };
const api = async (method, path, body, token) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const ct = r.headers.get('content-type') || '';
  let data = null, size = 0;
  if (ct.includes('json')) data = await r.json().catch(() => null); else size = (await r.arrayBuffer()).byteLength;
  return { s: r.status, d: data, ct, size };
};
const n = Date.now().toString().slice(-7), PW = 'Test1234x';
const is2 = (r) => r.s === 200 || r.s === 201;
const rows = (d) => (Array.isArray(d) ? d : (d && (d.items || d.data)) || []);
// Connexion ; un mot de passe provisoire est remplacé aussitôt (sinon toutes les données sont refusées).
const login = async (email, password) => {
  const d = (await api('POST', '/auth/login', { email, password })).d || {};
  if (d.accessToken && d.user && d.user.mustChangePassword) {
    const c = await api('POST', '/auth/change-password', { currentPassword: password, newPassword: password + 'N' }, d.accessToken);
    ok(is2(c), `${email} : mot de passe provisoire remplacé`, c);
  }
  return d;
};

(async () => {
  // ---------- Comptes (3 connexions, sous la limite de 5 par minute) ----------
  const T = (await login('admin@syllogistique.local', 'ChangeMoi123!')).accessToken;
  ok(!!T, 'connexion Super administrateur');
  const mk = async (role, tag) => {
    const r = await api('POST', '/users', { firstName: 'F7', lastName: tag, email: `f7${tag}${n}@test.gn`, password: PW, role, siteId: SITE }, T);
    ok(r.s === 201, `compte ${role} créé sur le site principal`, r); return `f7${tag}${n}@test.gn`;
  };
  const mag = (await login(await mk('MAGASINIER', 'mag'), PW)).accessToken;
  const lec = (await login(await mk('LECTEUR', 'lec'), PW)).accessToken;
  ok(!!mag && !!lec, 'connexion magasinier et lecteur');

  // ---------- Transferts entre sites ----------
  const sites = rows((await api('GET', '/sites', undefined, T)).d);
  const SITE2 = (sites.find((x) => x.id !== SITE) || {}).id;
  ok(!!SITE2, 'second site disponible pour les transferts', sites.length);
  const sku = 'TR-' + n;
  let r = await api('POST', '/inventory/items', { siteId: SITE, sku, name: 'Article transfert ' + n, unit: 'pièce', unitPrice: 1000, salePrice: 1500 }, T);
  const item = r.d && r.d.id; ok(!!item, 'article créé sur le site d’origine', r);
  r = await api('POST', '/inventory/movements/in', { itemId: item, siteId: SITE, quantity: 50, reason: 'Stock pour transfert' }, T);
  ok(is2(r), 'entrée de 50 pièces', r);
  const qty = async (id) => { const x = await api('GET', `/inventory/items/${id}`, undefined, T); return x.d ? Number(x.d.currentQuantity) : NaN; };

  r = await api('POST', '/transfers', { fromSiteId: SITE, toSiteId: SITE, lines: [{ itemId: item, quantity: 1 }] }, T);
  ok(r.s === 400, 'transfert vers le même site refusé → 400', r.s);
  r = await api('POST', '/transfers', { fromSiteId: SITE, toSiteId: SITE2, lines: [{ itemId: item, quantity: 999 }] }, T);
  ok(r.s === 400, 'transfert supérieur au stock refusé → 400', r.s);
  ok((await qty(item)) === 50, 'stock inchangé après un transfert refusé (50)');
  r = await api('POST', '/transfers', { fromSiteId: SITE, toSiteId: SITE2, lines: [{ itemId: item, quantity: -5 }] }, T);
  ok(r.s === 400, 'quantité négative refusée → 400', r.s);
  r = await api('POST', '/transfers', { fromSiteId: SITE, toSiteId: SITE2, lines: [{ itemId: item, quantity: 1 }] }, lec);
  ok(r.s === 403, 'le lecteur ne peut pas expédier → 403', r.s);
  r = await api('POST', '/transfers', { fromSiteId: SITE2, toSiteId: SITE, lines: [{ itemId: item, quantity: 1 }] }, mag);
  ok(r.s === 403, 'le magasinier ne peut pas expédier depuis un autre site → 403', r.s);

  r = await api('POST', '/transfers', { fromSiteId: SITE, toSiteId: SITE2, lines: [{ itemId: item, quantity: 20 }] }, mag);
  const tr1 = r.d && r.d.id; ok(r.s === 201 && r.d.status === 'IN_TRANSIT', 'le magasinier expédie 20 pièces (en transit)', r);
  ok(/^TR/.test((r.d && r.d.reference) || ''), 'numéro de transfert attribué', r.d && r.d.reference);
  ok((await qty(item)) === 30, 'stock d’origine diminué de 20 (30)');
  r = await api('POST', `/transfers/${tr1}/receive`, {}, mag);
  ok(r.s === 403, 'le magasinier du site d’origine ne peut pas réceptionner au site de destination → 403', r.s);
  r = await api('POST', `/transfers/${tr1}/receive`, {}, T);
  ok(is2(r), 'réception au site de destination', r);
  r = await api('POST', `/transfers/${tr1}/receive`, {}, T);
  ok(r.s === 400, 'double réception refusée → 400', r.s);
  r = await api('POST', `/transfers/${tr1}/cancel`, { reason: 'Erreur' }, T);
  ok(r.s === 400, 'annulation d’un transfert déjà reçu refusée → 400', r.s);
  const dest = rows((await api('GET', `/inventory/items?siteId=${SITE2}`, undefined, T)).d).find((x) => x.sku === sku);
  ok(dest && Number(dest.currentQuantity) === 20, 'le site de destination a reçu 20 pièces', dest);

  r = await api('POST', '/transfers', { fromSiteId: SITE, toSiteId: SITE2, lines: [{ itemId: item, quantity: 10 }] }, T);
  const tr2 = r.d && r.d.id; ok(r.s === 201, 'second transfert de 10 pièces', r);
  ok((await qty(item)) === 20, 'stock d’origine à 20 pendant le transit');
  r = await api('POST', `/transfers/${tr2}/cancel`, { reason: 'x' }, T);
  ok(r.s === 400, 'annulation sans motif suffisant refusée → 400', r.s);
  r = await api('POST', `/transfers/${tr2}/cancel`, { reason: 'Camion indisponible' }, mag);
  ok(r.s === 403, 'le magasinier ne peut pas annuler → 403', r.s);
  r = await api('POST', `/transfers/${tr2}/cancel`, { reason: 'Camion indisponible' }, T);
  ok(is2(r), 'annulation par l’administrateur', r);
  ok((await qty(item)) === 30, 'stock d’origine rétabli après annulation (30)');
  r = await api('GET', '/transfers', undefined, mag);
  ok(r.s === 200 && rows(r.d).some((x) => x.id === tr1), 'le magasinier voit les transferts de son site', r.s);
  r = await api('GET', `/transfers/${tr1}`, undefined, lec);
  ok(r.s === 200, 'le lecteur consulte un transfert de son site', r.s);

  // ---------- Rapports et tableaux de bord ----------
  for (const p of ['/reports/dashboard', `/reports/daily?siteId=${SITE}`, '/reports/fleet-recap',
    '/dashboards/commercial', '/dashboards/logistics', '/dashboards/stock', '/dashboards/fleet',
    '/dashboards/executive', '/dashboards/direction', '/dashboards/hse']) {
    r = await api('GET', p, undefined, T); ok(r.s === 200, `${p} → 200`, r.s);
  }
  r = await api('GET', '/reports/daily', undefined, T);
  ok(r.s === 400, 'rapport du jour sans site → 400 avec message clair', r.s);
  r = await api('GET', '/dashboards/workspace', undefined, mag);
  ok(r.s === 200, 'espace de travail du magasinier → 200', r.s);
  r = await api('GET', '/dashboards/workspace', undefined, lec);
  ok(r.s === 403, 'espace de travail réservé aux métiers de terrain (lecteur → 403)', r.s);
  const per = `from=2026-01-01&to=2026-12-31&siteId=${SITE}`;
  r = await api('GET', `/reports/period/export/excel?${per}`, undefined, T);
  ok(r.s === 200 && /sheet|excel|octet/.test(r.ct) && r.size > 1000, 'export Excel du rapport de période', { s: r.s, ct: r.ct, size: r.size });
  r = await api('GET', `/reports/period/export/pdf?${per}`, undefined, T);
  ok(r.s === 200 && /pdf/.test(r.ct) && r.size > 1000, 'export PDF du rapport de période', { s: r.s, ct: r.ct, size: r.size });
  r = await api('GET', `/reports/period/whatsapp-link?phone=224620000000&${per}`, undefined, T);
  ok(r.s === 200 && /wa\.me|whatsapp/.test((r.d && r.d.link) || ''), 'lien de partage WhatsApp', r);
  r = await api('GET', `/reports/period/whatsapp-link?phone=12&${per}`, undefined, T);
  ok(r.s === 400, 'numéro WhatsApp invalide refusé → 400', r.s);
  r = await api('GET', '/reports/missions/pdf', undefined, mag);
  ok(r.s === 403, 'le magasinier ne télécharge pas le rapport des missions → 403', r.s);

  // ---------- Recherche et QR codes ----------
  r = await api('GET', `/search?q=${sku}`, undefined, T);
  ok(r.s === 200, 'recherche globale → 200', r.s);
  r = await api('GET', `/search?q=${sku}`, undefined, mag);
  ok(r.s === 403, 'recherche globale refusée au magasinier → 403', r.s);
  r = await api('GET', `/qrcodes/item/${item}?size=200`, undefined, T);
  ok(r.s === 200 && /png/.test(r.ct) && r.size > 100, 'QR code d’un article (image PNG)', { s: r.s, ct: r.ct });
  r = await api('GET', `/qrcodes/item/${item}`);
  ok(r.s === 401, 'QR code sans connexion refusé → 401', r.s);

  // ---------- Signalements ----------
  r = await api('POST', '/support/reports', { message: 'Écran figé test ' + n, screen: 'Stock', network: '3G' }, mag);
  const rep = r.d && r.d.id; ok(r.s === 201 && rep, 'le magasinier envoie un signalement', r);
  r = await api('POST', '/support/reports', { message: 'x'.repeat(600) }, mag);
  ok(r.s === 400, 'signalement trop long refusé → 400', r.s);
  r = await api('GET', '/support/reports', undefined, mag);
  ok(r.s === 403, 'le magasinier ne voit pas la liste des signalements → 403', r.s);
  r = await api('GET', '/support/reports', undefined, T);
  ok(r.s === 200 && rows(r.d).some((x) => x.id === rep), 'l’administrateur voit le signalement', r.s);
  r = await api('PATCH', `/support/reports/${rep}`, { status: 'FERME' }, T);
  ok(r.s === 400, 'statut de signalement inconnu refusé → 400', r.s);
  r = await api('PATCH', `/support/reports/${rep}`, { status: 'SOLVED', note: 'Corrigé' }, T);
  ok(r.s === 200 && r.d.status === 'SOLVED', 'signalement marqué résolu', r);

  // ---------- Licence, e-mail de test, simulation ----------
  r = await api('GET', '/license/status');
  ok(r.s === 200 && r.d && 'state' in r.d, 'état de la licence lisible sans connexion', r.s);
  r = await api('POST', '/messaging/test', { to: 'test@test.gn' }, mag);
  ok(r.s === 403, 'envoi d’e-mail de test refusé au magasinier → 403', r.s);
  r = await api('POST', '/simulation/setup', { appUrl: 'https://exemple.test' }, mag);
  ok(r.s === 403, 'préparation de la simulation refusée au magasinier → 403', r.s);
  r = await api('POST', '/simulation/setup', { appUrl: 'https://exemple.test' }, T);
  ok(r.s === 403, 'préparation de la simulation refusée hors environnement de simulation → 403', r.s);

  console.log(fails === 0 ? '\nTOUS LES TESTS (7) RÉUSSIS' : `\n${fails} ÉCHEC(S)`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
