# Mise en production et retour arrière — SYL Logistique

Constat du 28/11/2026 (lecture seule) :
- Service Render **`syllogistique-backend`** (offre gratuite, région Oregon, Docker), adresse
  `https://syllogistique-backend.onrender.com`, application installable sur `/app/`.
- **Déploiement automatique activé sur la branche `main`** : toute fusion dans `main` part en production en quelques minutes.
  La règle est donc simple : **aucune fusion dans `main` sans l'accord écrit du propriétaire.**
- Base Neon, projet SYLLOGISTIQUE, branche `production`. Neon : 10 branches sur 10 (aucune place libre).
- Production actuelle : commit `e739bfa` (PR #194). Livraison candidate : PR #195, branche `fix/plateforme-multi-entreprises`.

## 1. Ce que la livraison change dans la base

Cinq migrations numérotées (`prisma/migrations-sql/0001` à `0005`), appliquées **automatiquement au démarrage** du
serveur, une seule fois, dans une transaction, avec copie préalable des tables touchées (schéma `migration_backups`) :

| N° | Contenu | Nature |
|---|---|---|
| 0001 | Colonnes `organization_id` / `site_id` de cloisonnement, remplies à partir des données existantes | Ajout de colonnes |
| 0002 | Colonnes `version` (conflits hors ligne) et file d'arbitrage | Ajout |
| 0003 | Codes de récupération du mot de passe | Nouvelle table |
| 0004 | Code d'entreprise et compteurs de numérotation par entreprise | Ajout |
| 0005 | Rattachement des inscriptions de chauffeurs à l'entreprise | Ajout |

Toutes sont **additives** : aucune colonne ni table existante n'est supprimée. L'ancienne version de l'application
fonctionne donc encore avec la base migrée, ce qui rend le retour arrière simple. Chaque migration a son fichier
d'annulation (`.down.sql`), testé à chaque version par l'intégration continue (annulation 0005 → 0003, puis réapplication).

## 2. Variables d'environnement (Render → Environment)

| Variable | Obligatoire | Rôle | Si absente |
|---|---|---|---|
| `DATABASE_URL` | Oui | Adresse de la base Neon | Le serveur ne démarre pas |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Oui | Signature des sessions | Le serveur ne démarre pas |
| `CORS_ORIGINS` | Recommandée | Sites autorisés à appeler l'API | Voir configuration actuelle |
| `FILES_SIGNING_KEY` | Non | Signature des liens de fichiers | `JWT_ACCESS_SECRET` est utilisé |
| `RESET_CODE_SECRET` | Non | Codes de récupération du mot de passe | `JWT_ACCESS_SECRET` est utilisé |
| `PLATFORM_ADMIN_KEY` | Non | Création d'entreprises clientes par l'accès plateforme | Accès plateforme fermé (refus) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Non | Envoi d'e-mails | Envoi simulé (bloqué sur l'offre gratuite Render) |
| `NODE_ENV` | Oui | `production` | — |

Aucune nouvelle variable n'est **indispensable** pour la livraison 195. `PLATFORM_ADMIN_KEY` ne sera nécessaire qu'au
moment d'ouvrir une deuxième entreprise cliente : le propriétaire la saisira lui-même dans Render (jamais dans un message).

## 3. Contrôles avant le déploiement (liste à cocher)

1. ☐ Intégration continue **au vert** sur le commit exact à déployer (3 étapes : build, master, smoke).
2. ☐ Accord écrit du propriétaire, avec le numéro du commit.
3. ☐ Sauvegarde quotidienne lancée **à la main** et réussie (`docs/SAUVEGARDE.md` § 5.1) ; numéro d'exécution noté.
4. ☐ Heure exacte notée (point de retour Neon, valable 6 heures).
5. ☐ Empreinte des données relevée sur la production : `psql "$DATABASE_URL" -f scripts/boot-check.sql > avant.txt`
   (lecture seule).
6. ☐ Aucun chauffeur en mission avec des saisies hors ligne en attente (prévenir les chauffeurs ; leurs téléphones
   renverront de toute façon les saisies à la reprise).
7. ☐ Prévoir le déploiement en dehors des heures de travail (le service redémarre, environ 1 minute de coupure).

## 4. Déploiement

1. Sur GitHub, PR #195 : passer de « brouillon » à « prête », puis **Merge** (fusion dans `main`).
2. Render lance automatiquement la construction (5 à 10 minutes). Suivre l'onglet **Events / Logs** du service.
3. Dans les journaux, vérifier les lignes des migrations : `0001` à `0005` appliquées, aucune erreur.
   En cas d'échec d'une migration, le serveur **ne démarre pas** et la base reste dans l'état précédent : passer au § 6.

## 5. Contrôles après le déploiement

1. ☐ `https://syllogistique-backend.onrender.com/health` répond `{"status":"ok", ...}`.
2. ☐ Empreinte des données : `psql "$DATABASE_URL" -f scripts/boot-check.sql > apres.txt`, puis comparer les lignes
   `DONNEES` avec `avant.txt` : elles doivent être **identiques** (les lignes `INFO` peuvent changer).
3. ☐ `node dist/migrations/cli.js status` (depuis le Shell Render) : 5 migrations appliquées.
4. ☐ Connexion Super administrateur ; ouverture de l'accueil, des véhicules, des chauffeurs, du stock.
5. ☐ Connexion du compte chauffeur de test (664201220) : l'application chauffeur s'ouvre, la fiche du jour s'affiche.
6. ☐ Une photo de reçu s'affiche (lien signé), puis ne s'ouvre plus si on retire la signature de l'adresse.
7. ☐ Journaux Render : aucune erreur 500 pendant 30 minutes.
8. ☐ Le lendemain : la sauvegarde quotidienne est passée au vert.

Si l'un de ces contrôles échoue, appliquer le § 6 sans attendre.

## 6. Retour arrière

Toujours dans cet ordre, du plus léger au plus lourd. Chaque étape suffit en général.

### 6.1 Revenir à la version précédente de l'application (sans toucher à la base)
Render → service `syllogistique-backend` → **Events** → déploiement précédent (commit `e739bfa`) → **Rollback**.
Si ce bouton n'est pas proposé : **Manual Deploy** → « Deploy a specific commit » → `e739bfa`.
Les migrations étant additives, l'ancienne version fonctionne avec la base migrée. Durée : 5 à 10 minutes.
Ensuite, pour éviter un redéploiement automatique de la version fautive, annuler la fusion sur GitHub
(**Revert** de la PR #195), ce qui crée un commit de retour dans `main`.

### 6.2 Annuler les migrations (seulement si la base elle-même pose problème)
Depuis le Shell Render, une à une, de la plus récente à la plus ancienne :
`node dist/migrations/cli.js down 0005`, puis `0004`, `0003`, … Chaque annulation est journalisée.
Attention : une annulation supprime les données saisies **depuis** dans les colonnes retirées.

### 6.3 Restaurer la base (dernier recours, accord du propriétaire obligatoire)
- Moins de 6 heures après le déploiement : retour dans le temps Neon à l'heure notée au § 3.4 (`docs/SAUVEGARDE.md` § 5.2).
- Au-delà : copie quotidienne de la veille ou copie manuelle du § 3.3 (`docs/SAUVEGARDE.md` § 5.3).

## 7. Après une mise en production réussie (avec accord, séparément)
- Création des 4 profils manquants : **rien à faire**. Le profil s'enregistre automatiquement à la création du premier
  compte Mécanicien, Pointeur, Comptable ou Responsable des opérations. Ces créations de comptes réels se font avec votre accord.
- Comptes à mot de passe provisoire et doublon du compte DG : voir `docs/COMMUNICATIONS_COMPTES_PROVISOIRES.md`.
- Nettoyage des branches Neon de test : voir `docs/SAUVEGARDE.md` § 4.

## 8. Ancien guide
L'ancien guide `DEPLOY.md` (Netlify, création initiale du service) décrit la première installation de septembre 2026.
Il reste valable pour **installer SYL sur un nouveau serveur** (`docs/GUIDE_INSTALLATION_EXPLOITATION.md`), pas pour les
mises à jour.
