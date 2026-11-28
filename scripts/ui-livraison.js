/* Test d'interface : parcours livraison (mission de transport) + rôles terrain.
 * Une mission est créée puis clôturée via l'API ; l'interface (connectée) doit l'afficher dans l'historique et le suivi.
 * Ensuite 4 rôles terrain se connectent par l'interface et parcourent leur menu. */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const SITE = '00000000-0000-0000-0000-000000000002';
const PW = 'Passe-Test-2026x1';
const n = Date.now().toString().slice(-7);
let ok = 0, ko = 0;
const check = (name, cond, extra) => { if (cond) { ok++; console.log('  ✓ ' + name); } else { ko++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, path, body, token) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d };
}

async function session(browser, email, pass, label, fn) {
  console.log('UI — ' + label);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((u) => { try { localStorage.setItem('syllo_api_url', u); } catch (e) {} }, BASE);
  const page = await ctx.newPage();
  const errors = [], http5 = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('response', (r) => { if (r.status() >= 500) http5.push(r.status() + ' ' + r.url()); });
  await page.goto(BASE + '/app/', { waitUntil: 'load' });
  await page.fill('#login-email', email);
  await page.fill('#login-password', pass);
  await page.click('text=Se connecter');
  // Compte créé par un administrateur : l'application impose d'abord un mot de passe personnel.
  await page.waitForSelector('#app:visible, #force-pw', { timeout: 20000 }).catch(() => {});
  if (await page.$('#force-pw')) {
    if (await page.$('#fp-old')) await page.fill('#fp-old', pass);
    await page.fill('#fp-new', pass + 'N'); await page.fill('#fp-new2', pass + 'N');
    await page.click('#force-pw button');
    check(label + ' : mot de passe provisoire remplacé à la première connexion', true);
  }
  const logged = await page.waitForSelector('#app', { state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  check(label + ' : connexion par l\'interface', logged, logged ? '' : await page.textContent('#login-msg').catch(() => ''));
  if (logged) {
    const views = await page.$$eval('.nav-item[data-view]', (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.dataset.view));
    check(label + ' : le menu propose des écrans', views.length >= 1, String(views.length));
    for (const v of views) {
      const b = errors.length, b5 = http5.length;
      await page.evaluate((x) => { try { go(x); } catch (e) {} }, v);
      await page.waitForTimeout(800);
      const len = await page.$eval('#view-root', (e) => e.innerText.trim().length).catch(() => 0);
      check(label + ' : écran « ' + v + ' »', errors.length === b && http5.length === b5 && len > 10, errors.slice(b).concat(http5.slice(b5)).join(' | '));
    }
    if (fn) await fn(page, errors, http5);
  }
  await ctx.close();
}

(async () => {
  const lg = await api('POST', '/auth/login', { email: 'admin@syllogistique.local', password: 'ChangeMoi123!' });
  const tok = lg.d && lg.d.accessToken;
  check('connexion administrateur (API)', !!tok);
  const now = new Date().toISOString(), later = new Date(Date.now() + 3600e3).toISOString();
  const dest = 'Destination UI ' + n;
  let r = await api('POST', '/drivers', { siteId: SITE, firstName: 'Mamadou', lastName: 'UI' + n, licenseNumber: 'U' + n, activity: 'TRUCK' }, tok); check('création du chauffeur', r.s === 201, String(r.s)); const drv = r.d && r.d.id;
  r = await api('POST', '/vehicles', { siteId: SITE, vehicleType: 'TRUCK', internalNumber: 'UI' + n, registrationNumber: 'UI' + n, currentMileage: 1000 }, tok); check('création du camion', r.s === 201, String(r.s)); const veh = r.d && r.d.id;
  r = await api('POST', '/trips', { vehicleId: veh, driverId: drv, siteId: SITE, tripDate: now, startTime: now, startMileage: 1000, destination: dest }, tok); check('création de la mission', r.s === 201, String(r.s)); const trip = r.d && r.d.id;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  await wait(13000);
  await session(browser, 'admin@syllogistique.local', 'ChangeMoi123!', 'administrateur (livraison)', async (page, errors, http5) => {
    console.log('UI — livraison : mission visible dans l\'historique');
    await page.evaluate(() => { go('driver-missions'); });
    await page.waitForTimeout(2500);
    let txt = await page.$eval('#view-root', (e) => e.innerText);
    check('la mission en cours apparaît dans l\'historique des missions', txt.includes(dest) && txt.includes('UI' + n), txt.slice(0, 120));
    await page.evaluate((id) => { try { tripTimeline(id); } catch (e) {} }, trip);
    await page.waitForTimeout(1500);
    check('le détail (chronologie) de la mission s\'ouvre sans erreur', errors.length === 0 && http5.length === 0, errors.concat(http5).join(' | '));
    await page.keyboard.press('Escape');
    await page.evaluate(() => { go('driver-board'); });
    await page.waitForTimeout(2000);
    txt = await page.$eval('#view-root', (e) => e.innerText);
    check('le suivi des chauffeurs affiche le chauffeur', txt.includes('UI' + n) || txt.includes('Mamadou'), txt.slice(0, 120));
    await page.evaluate(() => { go('trucks'); });
    await page.waitForTimeout(1500);
    txt = await page.$eval('#view-root', (e) => e.innerText);
    check('la flotte affiche le camion créé', txt.includes('UI' + n));
    r = await api('PATCH', `/trips/${trip}/close`, { endTime: later, endMileage: 1250, endCondition: 'RAS' }, tok);
    check('clôture de la mission (250 km)', r.s >= 200 && r.s < 300, String(r.s));
    await page.evaluate(() => { go('driver-missions'); });
    await page.waitForTimeout(2500);
    txt = await page.$eval('#view-root', (e) => e.innerText);
    check('l\'historique affiche les 250 km après clôture', txt.includes('250'), '');
  });
  const roles = [['MECANICIEN', 'mec'], ['POINTEUR', 'poi'], ['GESTIONNAIRE_FLOTTE', 'flo'], ['RESPONSABLE_OPERATIONS', 'ops']];
  for (const [role, tag] of roles) {
    const u = await api('POST', '/users', { firstName: 'Test', lastName: tag, email: `${tag}${n}@test.gn`, password: PW, role, siteId: SITE }, tok);
    check('création du compte ' + role, u.s === 201, String(u.s));
  }
  for (const [role, tag] of roles) {
    await wait(13000);
    await session(browser, `${tag}${n}@test.gn`, PW, role, null);
  }
  await browser.close();
  console.log('\nUI livraison et rôles terrain : ' + ok + ' réussis, ' + ko + ' échoués');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
