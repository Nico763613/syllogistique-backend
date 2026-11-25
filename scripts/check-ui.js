// Contrôle anti-doublons de l'interface : node scripts/check-ui.js
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(pub + '/index.html', 'utf8');
// JS = toutes les sources modulaires (public/src/<groupe>/*.js) ; CSS = public/css/app.css
const srcJs = fs.readdirSync(pub + '/src').filter((d) => fs.statSync(pub + '/src/' + d).isDirectory()).sort()
  .flatMap((d) => fs.readdirSync(pub + '/src/' + d).filter((f) => f.endsWith('.js')).sort().map((f) => fs.readFileSync(pub + '/src/' + d + '/' + f, 'utf8'))).join('\n');
const bad = [];
const count = (arr) => arr.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
// 1. une fonction = une seule entrée de menu
const markup = html; // menus = balisage (le JS est dans public/src)
const views = [...markup.matchAll(/data-view="([\w-]+)"/g)].map((m) => m[1]);
Object.entries(count(views)).filter(([, n]) => n > 1).forEach(([v, n]) => bad.push(`Menu en double : "${v}" ×${n}`));
const COMMUNS = ['dashboard', 'stock', 'purchases', 'needs', 'sync', 'settings']; // menus communs : masqués pour les rôles départementaux par applyRoleNav()
// 2. chaque entrée de menu a une liste de rôles (ce qui est interdit reste invisible)
[...markup.matchAll(/<(?:a|button|div)[^>]*data-view="([\w-]+)"[^>]*>/g)].forEach((m) => { if (!/data-roles=/.test(m[0]) && !COMMUNS.includes(m[1])) bad.push(`Menu sans data-roles : "${m[1]}"`); });
// 3. un seul menu « Rapports »
const rep = views.filter((v) => /^reports?(-|$)/.test(v));
if (rep.length > 1) bad.push('Plusieurs menus Rapports : ' + rep.join(', '));
// 4. fonctions JS déclarées deux fois
const scripts = srcJs;
const fns = [...scripts.matchAll(/^(?:async )?function (\w+)\(/gm)].map((m) => m[1]);
Object.entries(count(fns)).filter(([, n]) => n > 1).forEach(([f, n]) => bad.push(`Fonction déclarée ${n} fois : ${f}()`));
// 5. couleurs en dur dans le CSS (utiliser les variables)
const css = fs.readFileSync(pub + '/css/app.css', 'utf8');
const hard = [...css.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toUpperCase());
const tokens = ['#2E8B57', '#C0392B', '#163A5F', '#E0A72E', '#E1F4E8', '#FDF1D6', '#FDE8E4', '#E3EEFB', '#9A6A0C', '#B4372F', '#1747A8'];
const root = (css.match(/:root\{[^}]*\}/) || [''])[0].toUpperCase();
hard.filter((c) => tokens.includes(c) && !root.includes(c)).forEach((c) => bad.push('Couleur en dur à remplacer par une variable : ' + c));
console.log(`${views.length} entrées de menu, ${fns.length} fonctions, ${hard.length} couleurs CSS.`);
if (bad.length) { console.log('\n' + bad.map((b) => '✗ ' + b).join('\n')); process.exit(1); } else console.log('✓ Aucun doublon détecté.');
