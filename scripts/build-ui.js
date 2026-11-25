// Assemble les sources de l'interface (public/src/<groupe>/NN-*.js) en un fichier par groupe (public/<groupe>.js).
// Chaque groupe reproduit un <script> de l'application : les fonctions d'un groupe se voient entre elles (hoisting),
// exactement comme dans l'ancien fichier unique. Lancé automatiquement par « npm run build ».
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'public'), src = path.join(root, 'src');
let total = 0;
for (const g of fs.readdirSync(src).filter((d) => fs.statSync(path.join(src, d)).isDirectory()).sort()) {
  const files = fs.readdirSync(path.join(src, g)).filter((f) => f.endsWith('.js')).sort();
  const code = files.map((f) => fs.readFileSync(path.join(src, g, f), 'utf8').replace(/\n$/, '')).join('\n');
  new (require('vm').Script)(code, { filename: g + '.js' }); // refuse un assemblage invalide
  fs.writeFileSync(path.join(root, g + '.js'), code + '\n');
  console.log(`public/${g}.js ← ${files.length} fichier(s), ${code.split('\n').length} lignes`); total += files.length;
}
console.log(`Interface assemblée : ${total} modules sources.`);
