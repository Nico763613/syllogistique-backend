# SYLLOGISTIQUE — Backend API

API REST NestJS + PostgreSQL + Prisma pour le progiciel de gestion logistique,
transport, flotte et stocks (Offline-First, cf. cahier des charges).

## 1. Installation locale (développement)

```bash
# 1. Installer les dépendances
npm install

# 2. Copier la configuration
cp .env.example .env
# → adapter DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET

# 3. Démarrer PostgreSQL (via Docker)
docker compose up -d postgres

# 4. Générer le client Prisma et créer les tables
npm run prisma:generate
npm run prisma:migrate

# 5. Charger les données de départ (rôles, organisation, site, admin, types de maintenance)
npm run prisma:seed

# 6. Démarrer l'API en mode développement
npm run start:dev
```

L'API démarre sur `http://localhost:3000`.
Documentation interactive (Swagger) : `http://localhost:3000/docs`.

Compte administrateur créé par le seed :
- Email : `admin@syllogistique.local`
- Mot de passe : `ChangeMoi123!` (à changer immédiatement via `/auth/change-password`)

## 2. Déploiement production (Docker)

```bash
cp .env.example .env
# → renseigner un DATABASE_URL de production et des secrets JWT forts

docker compose up -d --build
```

Le conteneur `api` applique automatiquement les migrations (`prisma migrate deploy`)
au démarrage puis lance le serveur.

## 3. Structure du projet

```
src/
├── auth/            → connexion, JWT + refresh token, changement de mot de passe
├── users/            → utilisateurs et rôles (RBAC)
├── drivers/          → chauffeurs + pointage (présence/absence)
├── vehicles/          → camions et véhicules de service (table unifiée)
├── trips/             → fiche de bord / missions, calcul auto de distance
├── fuel/               → ravitaillements, tarifs configurables, consommation
├── maintenance/        → entretiens, historique, alertes d'échéance
├── inventory/          → articles, entrées/sorties de stock
├── suppliers/          → fournisseurs
├── notifications/      → centre d'alertes (stock, permis, entretien)
├── reports/            → tableau de bord global, rapports par période
├── audit/              → journal de traçabilité (qui/quoi/quand)
└── common/              → guards RBAC, décorateurs @Roles/@Public/@CurrentUser
prisma/
├── schema.prisma        → schéma complet de la base de données
└── seed.ts               → données de départ
```

## 4. Points clés déjà implémentés

- **Authentification** : JWT (access 15 min + refresh 30 jours), mots de passe hashés (bcrypt).
- **RBAC** : 6 rôles (`SUPER_ADMIN`, `ADMIN_LOGISTIQUE`, `GESTIONNAIRE_FLOTTE`, `MAGASINIER`,
  `CHAUFFEUR`, `LECTEUR`), permissions appliquées via `@Roles()` + `RolesGuard`.
- **Traçabilité** : chaque création/modification/suppression critique est journalisée dans `audit_logs`
  (utilisateur, ancienne/nouvelle valeur, date).
- **Validations métier** : kilométrage arrivée < départ refusé, sortie de stock > disponible refusée
  (sauf `allowNegative`), quantités/prix négatifs refusés, véhicule/chauffeur inexistant refusé.
- **Carburant** : tarif par défaut configurable par organisation (10 000 GNF camions /
  12 000 GNF véhicules de service), coût calculé automatiquement, statistiques de consommation
  (L/100km, coût/km).
- **Stocks** : règle `stock final = stock initial + entrées − sorties`, mouvements tracés,
  valorisation du stock, alerte sous seuil minimum.
- **Multi-site** : modèle `Organization → Site → Vehicles/Drivers/...` prêt pour plusieurs sites.

## 5. Synchronisation Offline (`/sync`)

- `POST /sync/push` — le client envoie un lot d'opérations enregistrées hors connexion
  (`{ operations: [{ entity, entityId, operation, payload, deviceId }] }`). Chaque opération
  est rejouée côté serveur, historisée dans `sync_queue`, et déduplicable par
  `(entity, entityId, deviceId)`. Réponse : `"Synchronisation terminée — X/Y"` + détail par opération.
- `GET /sync/pending-count?deviceId=...` — nombre d'opérations en attente/échouées.
- `GET /sync/log?deviceId=...` — historique des synchronisations.
- Entités actuellement synchronisables : `Trip`, `FuelTransaction`, `Maintenance`,
  `DriverAttendance`, `InventoryItem`, `StockMovement`, `Vehicle`, `Driver`.

## 6. Export des rapports (`/reports`)

- `GET /reports/dashboard?siteId=...` — indicateurs temps réel (flotte, stock, activité du jour).
- `GET /reports/period?siteId=&from=&to=` — rapport JSON sur une période.
- `GET /reports/period/export/excel?siteId=&from=&to=` — même rapport en `.xlsx`.
- `GET /reports/period/export/pdf?siteId=&from=&to=` — même rapport en `.pdf`.

## 7. Achats & Ventes (inspiré d'Odoo)

Nouveaux modules `/customers`, `/purchases`, `/sales`, `/payments`.

**Achats**
- `POST /purchases/orders` — bon de commande fournisseur (BC-AAAA-NNNN), plusieurs lignes
- `POST /purchases/orders/:id/receive` — réception (partielle ou totale) : met à jour le stock
  automatiquement (entrée + prix d'achat de référence), passe le statut en `PARTIALLY_RECEIVED`/`RECEIVED`
- `POST /purchases/orders/:id/invoice` — facture fournisseur (FA-AAAA-NNNN), comptant ou à crédit
- `GET /purchases/invoices` — liste des factures fournisseurs

**Ventes**
- `POST /sales/orders` — devis (DEV-…) ou commande confirmée (BCC-…), remise et taxe en %
- `POST /sales/orders/:id/confirm` — transforme un devis en commande
- `POST /sales/orders/:id/deliver` — livraison : sortie de stock automatique, **bloquée si stock
  insuffisant** (sauf `allowNegative`)
- `POST /sales/orders/:id/invoice` — facture client (FV-…), calcule sous-total/remise/taxe/total
- `GET /sales/invoices/:id/pdf` — **facture PDF téléchargeable**, avec zone dédiée signature/tampon
  (à imprimer, signer/tamponner à la main, puis rescanner — ou à joindre telle quelle par email/WhatsApp)

**Paiements**
- `POST /payments` — encaissement client (`IN`) ou décaissement fournisseur (`OUT`), espèces/virement/
  mobile money/chèque ; met à jour automatiquement le statut de la facture (`UNPAID` → `PARTIALLY_PAID` →
  `PAID`)

**Clients**
- `POST /customers`, `GET /customers`, `GET /customers/:id` (avec solde dû calculé)

Après avoir modifié `prisma/schema.prisma`, exécuter `npx prisma migrate dev --name achats-ventes`
(ou `migrate deploy` en production) puis `npx prisma generate` avant de redémarrer l'API.

## 8. Fichiers, QR Codes, notifications automatiques, email & WhatsApp (V6)

**Upload de fichiers** (`POST /uploads?category=...`, multipart/form-data, champ `file`)
- Stockage local dans `/uploads`, servi sur `/uploads/<fichier>`
- Catégories suggérées : `vehicle_photo`, `fuel_receipt`, `maintenance_invoice`, `driver_license`,
  `document`, `signature`
- Formats acceptés : jpg, jpeg, png, webp, pdf, heic — 15 Mo max
- ⚠️ Sur un hébergeur à disque éphémère (Render en offre gratuite, par ex.), les fichiers uploadés
  disparaissent au redéploiement — prévoir un disque persistant ou basculer vers un stockage
  S3-compatible (le point d'entrée du code est indiqué dans `uploads.controller.ts`)

**QR Codes** (`GET /qrcodes/vehicle/:id` ou `/qrcodes/item/:id`)
- Retourne une image PNG encodant `VEHICLE:<id>` ou `ITEM:<id>`, à imprimer et coller sur le
  véhicule/l'article ; un scan côté client redirige vers la fiche correspondante

**Notifications automatiques**
- Un job planifié (`@nestjs/schedule`) exécute les vérifications d'alerte chaque jour à 06h00
  (permis bientôt expirés, stock sous seuil, entretiens en retard) pour tous les sites actifs —
  `/notifications/run-checks` reste disponible pour un déclenchement manuel
- Déduplication : une même alerte n'est pas recréée si elle a déjà été émise dans les dernières 24h

**Email** (`POST /sales/invoices/:id/send-email`, `POST /reports/period/send-email`)
- Envoie la facture ou le rapport (PDF) en pièce jointe via SMTP
- Configurer `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, etc. dans `.env` (Gmail, Outlook, ou un
  fournisseur transactionnel comme Brevo/SendGrid conviennent)
- **Sans configuration SMTP, l'envoi est simulé** (juste loggé) — l'API reste utilisable en attendant

**WhatsApp** (`GET /sales/invoices/:id/whatsapp-link?phone=...`, `GET /reports/period/whatsapp-link`)
- Génère un lien `wa.me` avec message pré-rempli ; l'API ne peut pas joindre le PDF automatiquement
  sans un compte WhatsApp Business API payant — le lien ouvre WhatsApp, le PDF (déjà téléchargé) est
  à joindre manuellement en un tap

## 9. Reste à construire (prochaines étapes)

- Passage du stockage de fichiers local vers un stockage S3-compatible pour la production (disque
  persistant sinon requis).
- Résolution manuelle des conflits de synchronisation par un administrateur (l'historique complet
  est déjà conservé dans `sync_queue`, il reste l'écran de résolution côté client/admin).
- Application Flutter (mobile/desktop/web) consommant cette API — c'est le seul chantier qui reste
  entièrement à faire ; tout le reste (données, logique métier, sécurité, documents, notifications)
  est déjà opérationnel côté API.
