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
