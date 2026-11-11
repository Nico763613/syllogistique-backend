# SYLLOGISTIQUE MASTER — étape 1 : accès propriétaire

Tableau de bord **privé** de Naby Moussa SYLLA. Il est indépendant des installations clientes (autre serveur, autre base).
Cette étape contient : connexion par mot de passe + code à 2 étapes (obligatoire), codes de secours, verrouillage après erreurs, journal d'audit.
Les clients, les licences et les appareils arrivent aux étapes 2 à 6.

## Mise en ligne (gratuite)

### 1. Base de données (Neon)
1. Sur Neon, créez un **nouveau projet** nommé `SYLLOGISTIQUE-MASTER` (pas dans le projet des clients).
2. Copiez sa chaîne de connexion (bouton **Connect**, elle commence par `postgresql://`).

### 2. Serveur (Render)
1. Render → **New +** → **Web Service** → dépôt `syllogistique-backend`.
2. Nom : `syllogistique-master` · **Root Directory** : `master` · Runtime : **Docker** · Plan : **Free**.
3. Variables d'environnement (vous les saisissez vous-même, je ne les vois jamais) :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | la chaîne de connexion Neon du projet MASTER |
| `MASTER_SESSION_SECRET` | une longue suite aléatoire (au moins 32 caractères) |
| `MASTER_ADMIN_EMAIL` | votre e-mail de propriétaire |
| `MASTER_ADMIN_PASSWORD` | un mot de passe solide (12 caractères minimum, majuscules, minuscules, chiffres) |

4. Lancez le déploiement. Quand Render affiche **Live**, ouvrez l'adresse du service.

### 3. Première connexion
1. Connectez-vous avec l'e-mail et le mot de passe ci-dessus.
2. Activez la double authentification : appuyez sur « Ouvrir mon application d'authentification » (Google Authenticator, Microsoft Authenticator…), puis saisissez le code à 6 chiffres.
3. **Notez les 8 codes de secours** : ils ne s'affichent qu'une fois.
4. Retirez ensuite `MASTER_ADMIN_PASSWORD` de Render (il n'est plus utile) et changez votre mot de passe depuis le tableau de bord.

## Sécurité en bref
- Mot de passe haché (scrypt) ; code à 2 étapes standard (compatible avec toutes les applications d'authentification).
- 5 erreurs de mot de passe = compte verrouillé 15 minutes ; limitation des tentatives par adresse.
- Cookie de session protégé (HttpOnly, Secure, SameSite=Strict), 8 heures ; refus des requêtes venant d'un autre site.
- Toutes les connexions, échecs et changements sont écrits dans le journal d'audit.
- Aucune dépendance externe en dehors du client PostgreSQL (`pg`) : surface d'attaque réduite.

## Tests (développeurs)
`npm test` — nécessite une base PostgreSQL locale (variables `PGHOST_TEST`, `PGPORT_TEST`, `PGDB_TEST`) : un simulateur du paquet `pg` (dossier `test/shim_modules`) est utilisé uniquement pour les tests.

## Étape 3 — relier une installation cliente au Master

Sur le service Render de l'installation du client, ajouter la variable :
- `MASTER_URL` = l'adresse de votre Master (ex. https://syllogistique-master.onrender.com)
- (facultatif, recommandé) `MASTER_PUBLIC_KEY` = la clé publique affichée par `MASTER_URL/v1/public-key`

Sans `MASTER_URL`, l'installation fonctionne comme avant (c'est le cas de la vôtre : licence permanente, rien à faire).
Avec `MASTER_URL` : écran d'activation « Syllogistique » → le client saisit le code reçu → l'application prend son nom, son logo et sa couleur.
Vérification toutes les heures ; avertissement dès 3 jours sans contact, blocage à 7 jours ; suspension/révocation/expiration = blocage dès la prochaine vérification.

## Étape 4 — confort et gestion (PWA, suppression, appareils)
- **Application installable** : « Ajouter à l'écran d'accueil » (manifest + service worker minimal, rien de sensible en cache).
- **Flèche ←** sur chaque écran secondaire et bouton Retour du téléphone : retour à l'accueil sans déconnexion.
- **Code d'activation** : fenêtre avec le code complet, « Copier » et « Retour ».
- **Durée de licence** : Essai 14 jours, 3 mois, 6 mois, 1 an, Permanente (ou date personnalisée) ; l'année est affichée en toutes lettres.
- **Suppression** : client (ses licences et appareils sont supprimés) ou licence révoquée/expirée ; une licence active se révoque d'abord ; tout est écrit dans le journal d'audit, jamais effacé.
- **Tout réinitialiser (mode test)** : mot SUPPRIMER + code à 6 chiffres de la double authentification ; clients et licences supprimés, administrateur, clé de signature et journal conservés.
- **Recherche/filtres, badges de statut, alerte « expire dans moins de 30 jours », Modifier le client, Prolonger la licence, export CSV** (clients et licences, ouverture directe dans Excel).
- **Sécurité** : déconnexion automatique après 15 minutes d'inactivité ; 5 mots de passe faux = verrouillage 15 minutes.
- **Appareils** : l'installation cliente peut joindre `devices: [{id, name, lastSeenAt}]` à son contrôle `/v1/check` ; le Master répond avec `blockedDevices` et `disconnectDevices`. Tant que l'application cliente n'envoie pas cette liste, l'écran « Appareils » reste vide.
