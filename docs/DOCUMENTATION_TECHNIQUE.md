# Documentation technique — SYL Logistique

Date : 28/11/2026. Public visé : un développeur ou un prestataire qui reprend le projet.

## 1. Vue d'ensemble

| Élément | Choix |
|---|---|
| Serveur (API) | NestJS 10 sur Node.js 20, en TypeScript |
| Accès aux données | Prisma 5.19 (outil qui traduit le code en requêtes SQL) |
| Base de données | PostgreSQL hébergé chez Neon (projet `cool-unit-24426965`, branche de production `br-wild-math-aex86ntt`) |
| Application | Application web installable (PWA) servie par le même serveur à l'adresse `/app`, utilisable hors connexion |
| Hébergement | Render, service `syllogistique-backend` (offre gratuite, région Oregon), image Docker |
| Mise en ligne | Automatique à chaque modification de la branche `main` (autoDeploy) |
| Sauvegarde | Copie quotidienne chiffrée hors de Neon (dépôt privé `syllogistique-sauvegardes-`), voir `SAUVEGARDE.md` |
| Tests | GitHub Actions : compilation, 21 tests de base, puis tests fonctionnels sur une vraie base PostgreSQL |

Adresse de production : https://syllogistique-backend.onrender.com (application : `/app`).

## 2. Organisation du code

```
src/
  main.ts                 démarrage, en-têtes de sécurité, CORS, validation, migrations
  app.module.ts           assemblage des modules, gardes globales
  common/                 éléments partagés : gardes, cloisonnement, plafonds, numérotation, contexte de requête
  migrations/             exécution des migrations SQL au démarrage + outil en ligne de commande
  <module>/               un dossier par module (contrôleur = routes, service = règles, dto = données reçues)
prisma/
  schema.prisma           modèle de données
  migrations-sql/         migrations numérotées 0001 à 0005 (+ fichiers .down.sql de retour arrière)
  seed.ts                 données de départ (uniquement pour une installation neuve ou la CI)
public/src/               sources de l'application ; scripts/build-ui.js produit public/*.js
scripts/                  tests fonctionnels, tests d'interface, contrôle de démarrage, audit comptable
docs/                     documentation
```

La liste des 37 modules et de leurs tests est dans `MODULES.md`.

## 3. Sécurité

### 3.1 Connexion et sessions

- Mot de passe stocké uniquement sous forme d'empreinte bcrypt (jamais en clair).
- Jeton d'accès valable 15 minutes, jeton de renouvellement 30 jours, conservé en base sous forme d'empreinte : la déconnexion ou un changement de mot de passe l'annule.
- Mot de passe provisoire : tant qu'il n'est pas changé, toutes les données sont refusées (403).
- Limites d'essais : connexion 5 par minute, demande de code de récupération 3 par minute, saisie du code 5 par minute ; limite générale de 200 requêtes par minute.
- Appareils : un appareil inconnu peut être refusé puis bloqué après 3 essais (comptes chauffeurs).

### 3.2 Droits par profil (côté serveur)

- Garde globale `JwtAuthGuard` : toute route exige une connexion, sauf celles marquées publiques (liste dans `MODULES.md` §2).
- `RolesGuard` avec `@Roles(...)` et `@Departments(...)` : le profil est vérifié par le serveur, pas seulement par l'interface.
- Les 162 routes d'écriture ont été relues : toutes sont protégées par un profil ou limitées à l'utilisateur lui-même (ses notifications, ses signalements, son mot de passe…).
- Compte Chauffeur : n'accède qu'à l'application chauffeur et à la déclaration d'incident HSE (`JwtAuthGuard.driverAllowed`).
- La matrice des 15 profils est vérifiée automatiquement par `scripts/profils15.js` (voir `MATRICE_15_PROFILS.md`).

### 3.3 Cloisonnement entre entreprises et entre sites

Fichier `src/common/tenant-scope.ts`. Chaque accès à la base fait par un utilisateur connecté est filtré automatiquement :

- un utilisateur ne voit et ne modifie que les données de son entreprise ;
- s'il est rattaché à un site, uniquement celles de son site ;
- toute référence envoyée (identifiant d'un véhicule, d'un article, d'un client…) doit appartenir au même périmètre, sinon 403 ;
- une table sans règle de cloisonnement est refusée (contrôle au démarrage et en test) ;
- les rares requêtes SQL directes filtrent elles-mêmes et sont listées par `scripts/check-raw-sql.js`.

Vérifié par `functional6.js` (deux entreprises, plusieurs sites, lectures, écritures et références croisées refusées) et `functional5.js`.

### 3.4 Données reçues et montants

- Validation stricte (`ValidationPipe` : champs inconnus refusés, types vérifiés).
- Plafonds centralisés dans `src/common/limits.ts` : 10 milliards GNF par montant, 100 millions par dépense chauffeur, 1 milliard par prix unitaire, 1 million par litre de carburant, 2 000 litres par plein.
- Carburant déclaré par un chauffeur : le prix au litre doit rester entre 50 % et 200 % du tarif de l'entreprise.
- Reçus (carburant, dépenses) : la photo doit exister réellement sur le serveur et ne peut pas servir deux fois.

### 3.5 Fichiers

Les fichiers sont stockés dans la base (table `uploaded_files`). Ils ne sont lisibles que par un lien signé et temporaire (`src/uploads/file-links.ts`) : sans signature valable, le fichier est introuvable même si son nom est connu.

### 3.6 Numérotation des opérations

Les numéros (transferts `TR…`, commandes, factures…) sont attribués par `src/common/doc-numbers.ts`, séparément pour chaque entreprise.

### 3.7 En-têtes et origine des appels

- En-têtes de sécurité HTTP par `helmet`.
- CORS : seuls les sites listés dans `CORS_ORIGINS` peuvent appeler l'API. Si la variable est vide, tous les sites sont autorisés (un avertissement s'affiche au démarrage). L'application étant servie par le même serveur (`/app`), il est recommandé de renseigner `CORS_ORIGINS` avec l'adresse de production : à vérifier dans les variables de Render.

## 4. Migrations de la base

Les migrations sont des fichiers SQL numérotés, uniquement additifs (ajout de colonnes ou de tables), appliqués automatiquement au démarrage par `src/migrations/migration-runner.ts`. Chaque migration a son fichier de retour arrière `.down.sql`.

```
node dist/migrations/cli.js status      # liste des migrations appliquées
node dist/migrations/cli.js up          # applique celles qui manquent
node dist/migrations/cli.js down 0005   # annule la migration 0005
```

Détails : `MIGRATIONS.md`. Le retour arrière et la réapplication sont testés à chaque passage de la CI.

## 5. Tests automatiques

Fichier `.github/workflows/ci.yml`, trois étapes :

1. **build** : installation et compilation.
2. **master** : 21 tests sur une vraie base PostgreSQL.
3. **smoke** : le serveur démarre sur une base PostgreSQL neuve, puis :

| Script | Ce qu'il vérifie |
|---|---|
| functional.js | Véhicules, stock, ventes, missions, carburant, entretien |
| functional2.js | Comptes, achats, fournisseurs, paiements, caisse, documents, audit |
| functional3.js | Besoins, HSE, personnel, rapports d'activité, notifications |
| functional4.js | Circuits complets, droits, Directeur général, panne, application chauffeur, plafonds et reçus |
| functional5.js | Sites, sessions, invitations, caisse, cloisonnement entre sites |
| ui-click.js, ui-roles.js, ui-livraison.js | Interface dans Chrome sans écran : clics, profils, livraison |
| functional6.js | Plusieurs entreprises et plusieurs sites, synchronisation, conflits, récupération du mot de passe |
| functional7.js | Transferts entre sites, rapports et exports, recherche, QR codes, signalements, licence |
| profils15.js | Matrice des 15 profils (écrans autorisés et refusés) |
| smoke.js | Parcours rapide de bout en bout |
| migrations | Retour arrière de 0005, 0004, 0003 puis réapplication |
| audit-comptable.js | Cohérence comptable (lecture seule) |

Les pauses de 61 secondes entre les scripts respectent la limite de 5 connexions par minute. Un passage complet dure environ 20 minutes.

Les tests ne peuvent pas tourner dans l'environnement de travail de l'assistant (téléchargement du moteur Prisma bloqué) : la CI GitHub fait foi.

## 6. Variables d'environnement

Voir `.env.example` et `DEPLOIEMENT_ET_RETOUR_ARRIERE.md` §3. Aucune valeur secrète n'est écrite dans le dépôt. Les secrets (adresse de la base, clés des jetons, clé plateforme) sont saisis uniquement dans Render par le propriétaire.

## 7. Risques résiduels techniques

| N° | Risque | Conséquence | Mesure |
|---|---|---|---|
| T1 | Offre gratuite Render : mise en veille après inactivité | Premier accès lent (30 à 60 s) | Offre payante (décision du propriétaire) |
| T2 | Offre gratuite Render : pas d'envoi d'e-mail | Rapports par e-mail et récupération par e-mail indisponibles ; récupération par code administrateur disponible | Offre payante ou service d'e-mail par API |
| T3 | Pas de test sur téléphone réel | Comportement à confirmer sur Android, iPhone et PC | `PROTOCOLE_TEST_TELEPHONES.md` |
| T4 | `CORS_ORIGINS` à vérifier dans Render | Si vide, n'importe quel site peut appeler l'API (la connexion reste obligatoire) | Renseigner l'adresse de production |
| T5 | Neon : 10 branches sur 10 utilisées | Impossible de créer une branche de sauvegarde avant mise en production | Supprimer 3 branches de test (accord requis) |
| T6 | Pas de vérification indépendante de sécurité (test d'intrusion) | Des failles non détectées restent possibles | Audit externe avant commercialisation large |
