/* Test d'interface par clics, plusieurs rôles + parcours « client » dans Ventes.
 * Crée des comptes de test via l'API (base de test uniquement), puis se connecte par l'interface
 * avec chacun : parcours des écrans du menu, aucune erreur JS, aucune réponse 5xx.
 * Le responsable commercial crée un client en remplissant le formulaire puis le retrouve dans la liste. */
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
  const roles = [['RESPONSABLE_COMMERCIAL', 'com'], ['MAGASINIER', 'mag'], ['COMPTABLE', 'cpt'], ['LECTEUR', 'lec']];
  for (const [role, tag] of roles) {
    const r = await api('POST', '/users', { firstName: 'Test', lastName: tag, email: `${tag}${n}@test.gn`, password: PW, role, siteId: SITE }, tok);
    check('création du compte ' + role, r.s === 201, String(r.s));
  }
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  for (const [role, tag] of roles) {
    await wait(13000); // limite de connexions : 5 par minute
    await session(browser, `${tag}${n}@test.gn`, PW, role, tag !== 'com' ? null : async (page, errors, http5) => {
      console.log('UI — responsable commercial : création d\'un client');
      const name = 'Client UI ' + n;
      await page.evaluate(() => { vtTab = 'clients'; go('ventes'); });
      await page.waitForSelector('#cu-n', { timeout: 10000 }).catch(() => {});
      const form = await page.$('#cu-n');
      check('formulaire « Nouveau client » affiché', !!form);
      if (form) {
        await page.fill('#cu-n', name);
        await page.fill('#cu-p', '62' + n);
        await page.click('text=Enregistrer');
        await page.waitForTimeout(2000);
        const txt = await page.$eval('#view-root', (e) => e.innerText);
        check('le client créé apparaît dans la liste', txt.includes(name), (await page.textContent('#cu-m').catch(() => '')) || '');
        const list = await api('GET', '/customers?siteId=' + SITE, null, tok);
        const rows = Array.isArray(list.d) ? list.d : (list.d && (list.d.items || list.d.data)) || [];
        check('le client est bien enregistré côté serveur', rows.some((c) => c.name === name));
      }
      for (const t of ['tableau', 'commandes', 'factures', 'catalogue', 'retours', 'caisses']) {
        const b = errors.length, b5 = http5.length;
        await page.evaluate((x) => { vtTab = x; renderVentes(); }, t);
        await page.waitForTimeout(900);
        check('Ventes — onglet « ' + t + ' »', errors.length === b && http5.length === b5, errors.slice(b).concat(http5.slice(b5)).join(' | '));
      }
    });
  }
  await browser.close();
  console.log('\nUI rôles : ' + ok + ' réussis, ' + ko + ' échoués');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
