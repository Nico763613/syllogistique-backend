/* Test d'interface par clics réels (Chrome sans écran) contre le backend démarré sur vraie base.
 * Connexion → parcours de tous les écrans du menu visibles pour le rôle → vérifie :
 *  aucune erreur JavaScript, aucune réponse serveur 5xx, écran non vide.
 * Usage : BASE=http://localhost:3000 node scripts/ui-click.js */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@syllogistique.local';
const PASS = process.env.ADMIN_PASSWORD || 'ChangeMoi123!';
let ok = 0, ko = 0;
const check = (name, cond, extra) => { if (cond) { ok++; console.log('  ✓ ' + name); } else { ko++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); } };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((u) => { try { localStorage.setItem('syllo_api_url', u); } catch (e) {} }, BASE);
  const page = await ctx.newPage();
  let errors = [], http5 = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('response', (r) => { if (r.status() >= 500) http5.push(r.status() + ' ' + r.url()); });

  console.log('UI — connexion');
  await page.goto(BASE + '/app/', { waitUntil: 'load' });
  await page.fill('#login-email', EMAIL);
  await page.fill('#login-password', PASS);
  await page.click('text=Se connecter');
  const logged = await page.waitForSelector('#app', { state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  check('connexion : l\'application s\'affiche', logged);
  if (!logged) { console.log('  message : ' + (await page.textContent('#login-msg').catch(() => ''))); await browser.close(); process.exit(1); }
  const who = (await page.textContent('#side-name').catch(() => '')) || '';
  check('nom de l\'utilisateur affiché dans le menu', who.trim().length > 1 && who.trim() !== '—', who);

  const views = await page.$$eval('.nav-item[data-view]', (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.dataset.view));
  check('le menu propose au moins 5 écrans', views.length >= 5, String(views.length));
  console.log('UI — parcours de ' + views.length + ' écrans');
  for (const v of views) {
    const before = errors.length, b5 = http5.length;
    await page.evaluate((x) => { try { go(x); } catch (e) { window.__goErr = String(e); } }, v);
    await page.waitForTimeout(900);
    const len = await page.$eval('#view-root', (e) => e.innerText.trim().length).catch(() => 0);
    const good = errors.length === before && http5.length === b5 && len > 10;
    check('écran « ' + v + ' »', good, errors.slice(before).concat(http5.slice(b5)).join(' | ') || (len <= 10 ? 'écran vide' : ''));
  }
  await browser.close();
  console.log('\nUI : ' + ok + ' réussis, ' + ko + ' échoués');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
