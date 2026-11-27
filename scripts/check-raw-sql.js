// Contrôle des requêtes SQL directes ($queryRaw, $executeRaw…).
// Ces requêtes ne passent pas par le cloisonnement automatique (src/common/tenant-scope.ts) : chacune doit
// filtrer elle-même l'entreprise ou le site. Ce script échoue si un fichier contenant du SQL direct n'a pas
// été relu et ajouté à la liste ci-dessous (avec la raison pour laquelle il est sûr).
// Relecture complète : 28/11/2026 (voir docs/DOCUMENTATION_TECHNIQUE.md §3.3).
const fs = require('fs');
const path = require('path');

const RELUS = {
  'src/prisma.service.ts': 'démarrage uniquement (schéma)',
  'src/migrations/migration-runner.ts': 'migrations au démarrage, sans utilisateur',
  'src/common/doc-numbers.ts': 'compteurs de numérotation, clés par entreprise',
  'src/sales/sales.service.ts': 'commande vérifiée par Prisma avant ; numéro de bon de livraison',
  'src/sales/sales-pdfs.service.ts': 'bon de livraison : la commande liée est relue avec cloisonnement',
  'src/purchases/price-requests.service.ts': 'checkSite() : site du demandeur et sites de l’entreprise',
  'src/customers/customers.service.ts': 'doublons : site contrôlé par allowedSiteIds() ; autres requêtes après lecture cloisonnée',
  'src/payments/pending-payments.service.ts': 'allowedSiteIds() en liste et en décision',
  'src/settings/settings.service.ts': 'numérotation : clés par entreprise',
  'src/sync/conflicts.service.ts': 'filtre de périmètre construit pour chaque requête',
  'src/sync/versioning.ts': 'versions des fiches déjà lues avec cloisonnement',
  'src/uploads/file-links.ts': 'fichier par nom aléatoire, lu seulement avec lien signé',
  'src/uploads/uploads.controller.ts': 'envoi et lecture par lien signé',
  'src/auth/auth.service.ts': 'appareils de l’utilisateur connecté',
  'src/auth/user-devices.controller.ts': 'filtre organization_id de l’administrateur',
  'src/auth/invitations.ts': 'jeton d’invitation (empreinte)',
  'src/auth/password-reset.ts': 'codes de récupération de l’utilisateur',
  'src/auth/password-reset.service.ts': 'limitation des demandes',
  'src/signup/signup.controller.ts': 'filtre organization_id',
  'src/vehicles/assignments.ts': 'véhicule vérifié avec cloisonnement avant appel',
  'src/license/license.service.ts': 'journal technique des e-mails (aucune donnée métier)',
  'src/messaging/messaging.service.ts': 'journal technique des e-mails',
};

const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
walk('src');
const RAW = /\$(queryRaw|executeRaw)(Unsafe)?\b/;
const found = files.filter((f) => RAW.test(fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, ''))).map((f) => f.split(path.sep).join('/'));
const nouveaux = found.filter((f) => !RELUS[f]);
for (const f of found) console.log(`${nouveaux.includes(f) ? '✘ NON RELU' : '✔'} ${f}${RELUS[f] ? ' — ' + RELUS[f] : ''}`);
if (nouveaux.length) {
  console.log(`\n${nouveaux.length} fichier(s) avec du SQL direct non relu : vérifier le filtrage entreprise/site puis l'ajouter à la liste.`);
  process.exit(1);
}
console.log(`\n${found.length} fichiers avec du SQL direct, tous relus.`);
