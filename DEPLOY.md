# Déploiement 100 % gratuit de SYLLOGISTIQUE

Aucune carte bancaire nécessaire pour aucune de ces étapes. Temps estimé : 10-15 minutes.

---

## Étape 1 — Créer la base de données (Neon.tech, gratuit à vie)

1. Va sur **[neon.tech](https://neon.tech)** → *Sign up* (avec GitHub ou Google, le plus rapide)
2. *Create a project* → nom : `syllogistique`, région : Europe (Frankfurt de préférence, proche de la Guinée)
3. Une fois créé, Neon affiche une **Connection string** du type :
   ```
   postgresql://user:password@ep-xxxx.eu-central-1.aws.neon.tech/syllogistique?sslmode=require
   ```
4. **Copie cette chaîne complète** — tu en auras besoin à l'étape 3.

## Étape 2 — Mettre le code sur GitHub

1. Crée un compte sur **[github.com](https://github.com)** si tu n'en as pas
2. *New repository* → nom : `syllogistique-backend` → *Create*
3. Sur la page du dépôt vide → **uploading an existing file** → glisse tout le contenu du dossier
   `syllogistique-backend` (extrait du zip) → *Commit changes*

## Étape 3 — Déployer l'API (Render.com, tier gratuit)

1. Va sur **[render.com](https://render.com)** → *Sign up* avec GitHub (autorise l'accès à tes dépôts)
2. **New +** → **Blueprint**
3. Sélectionne ton dépôt `syllogistique-backend`
4. Render détecte automatiquement le fichier `render.yaml` déjà inclus dans le projet et propose de
   créer le service `syllogistique-api`
5. Avant de valider, Render te demande de renseigner deux variables (marquées `sync: false`) :
   - `DATABASE_URL` → colle la chaîne de connexion Neon copiée à l'étape 1
   - `CORS_ORIGINS` → laisse vide pour l'instant ; tu la renseigneras à l'étape 4 bis (adresse Netlify)
6. **Apply** → le déploiement démarre (5-10 minutes la première fois)
7. Une fois terminé, Render affiche l'URL de ton API, du type :
   ```
   https://syllogistique-api.onrender.com
   ```
8. Charger les données de départ (rôles, site, compte admin) : onglet **Shell** du service sur Render →
   ```
   npx prisma db seed
   ```

⚠️ **Limite du tier gratuit Render** : le service s'endort après 15 minutes sans requête, et met
~30 secondes à se réveiller au premier appel suivant. C'est normal, pas une panne.

## Étape 4 — Publier le client web (Netlify Drop, instantané)

L'application est une **PWA (Progressive Web App)** : installable sur l'écran d'accueil (PC, Android,
iOS) directement depuis le navigateur, sans Play Store ni App Store.

1. Crée un compte gratuit sur **[netlify.com](https://netlify.com)** (pour avoir un lien fixe et
   pouvoir remettre à jour le site plus tard — avec le dépôt anonyme sur app.netlify.com/drop, le
   lien expire après quelques heures)
2. Une fois connecté, va sur ton tableau de bord → glisse-dépose **le dossier complet**
   `syllogistique-pwa` (celui qui contient `index.html`, `manifest.json`, `sw.js` et les icônes —
   pas juste le fichier HTML seul, sinon l'installation ne fonctionnera pas)
3. Netlify génère immédiatement un lien public, du type :
   ```
   https://syllogistique-xxxx.netlify.app
   ```
4. Ce lien est ton **lien d'application**. Depuis ce lien :
   - **Android / Chrome (PC ou mobile)** : un bouton "⬇ Installer l'application" apparaît
     automatiquement — l'app s'ajoute à l'écran d'accueil / au menu Démarrer, en plein écran
   - **iPhone/iPad (Safari)** : bouton Partager 􀈂 → "Sur l'écran d'accueil"
   - **Windows/macOS (Chrome/Edge)** : icône d'installation dans la barre d'adresse

## Étape 4 bis — Verrouiller l'API sur ton site (sécurité, obligatoire)

Dans Render > ton service > **Environment** > `CORS_ORIGINS` = l'adresse Netlify de l'application
(ex. `https://syllogistique-xxxx.netlify.app`, sans `/` final). Si tu as plusieurs adresses, sépare-les par
des virgules. Sauvegarde : Render redéploie. Sans cela, n'importe quel site pourrait appeler ton API.

Contrôle de santé : `https://ton-api.onrender.com/health` doit répondre `{"status":"ok"}`.
La documentation Swagger (`/docs`) est désactivée en production ; pour la réactiver temporairement :
variable `ENABLE_DOCS=true`.

## Étape 5 — Connecter le client à l'API

1. Ouvre ton lien Netlify
2. Au premier écran de connexion, renseigne :
   - **URL de l'API** : `https://syllogistique-api.onrender.com` (celle de l'étape 3)
   - **Email** : `admin@syllogistique.local`
   - **Mot de passe** : `ChangeMoi123!`
3. Connecte-toi, puis **change IMMÉDIATEMENT le mot de passe** (`ChangeMoi123!` est public : quiconque
   connaît l'adresse de ton API peut l'essayer). Tu as 5 essais de connexion par minute par adresse IP.

---

## Résultat

- Ton **lien d'application** : celui donné par Netlify à l'étape 4 (`https://syllogistique-xxxx.netlify.app`)
- Ton **API** tourne gratuitement sur Render, connectée à ta base Neon
- Tu peux partager le lien Netlify avec ton équipe — chacun se connecte avec son propre compte
  (à créer via **Utilisateurs** dans l'app, ou directement en base)

## Si tu bloques quelque part

Dis-moi à quelle étape exactement (1 à 5) et ce que tu vois à l'écran — je t'aide à débloquer.
