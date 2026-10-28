# SYLLOGISTIQUE — Ajouts V8 (comparaison avec le cahier des charges)

⚠️ Ces ajouts n'ont PAS été compilés ni testés (pas d'accès npm lors de leur écriture). La syntaxe est
vérifiée ; avant mise en production, lancer `npm install && npm run build` (Render le fait au déploiement :
surveiller les journaux du build).
Aucune modification du schéma de base de données : toutes les tables utilisées existent déjà.

## Nouveaux endpoints
| Endpoint | Rôle | Cahier des charges |
|---|---|---|
| GET /settings, PUT /settings/:key | modif. : SUPER_ADMIN, ADMIN_LOGISTIQUE | §40 tarifs carburant (10 000 / 12 000 GNF), seuils d'alerte modifiables |
| GET/PATCH /settings/organization | idem | §40 nom, logo, coordonnées de l'entreprise |
| GET/POST/PATCH /sites | création : SUPER_ADMIN | §39 multi-site |
| POST/GET/PATCH /documents (+ ?expiringInDays=30) | flotte | §28 carte grise, assurance, visite technique… |
| POST/GET /expenses | flotte | §30 autres dépenses |
| GET /costs/summary?siteId&from&to | lecture | §30 coût par véhicule, par période, par km, par mission |
| GET /search?q= | tous | §31 recherche globale (véhicule, plaque, chauffeur, article, fournisseur, mission) |
| GET /maintenance/types, GET /inventory/categories | tous | listes pour les formulaires |
| POST /users/:id/reset-password | SUPER_ADMIN, ADMIN_LOGISTIQUE | §6 mot de passe oublié (par l'administrateur) |

## Comportements modifiés
- **Alertes (§27)** : documents/assurances expirés ou bientôt expirés, carburant anormalement élevé
  (> moyenne + 50 %, réglable via FUEL_ANOMALY_PERCENT), kilométrage incohérent entre deux pleins.
  Réglages : DOCUMENT_ALERT_DAYS (30 par défaut), FUEL_ANOMALY_PERCENT (50 par défaut).
- **Synchronisation (§26)** : champ optionnel `baseUpdatedAt` ; si la fiche a changé sur le serveur depuis,
  l'opération est refusée avec le statut `CONFLICT` et la version serveur est renvoyée (plus d'écrasement
  silencieux). Les champs système (id, createdAt, updatedAt, deletedAt) ne peuvent plus être imposés par le client.

## Encore manquant (nécessite une décision ou une migration de base)
- Département (Organisation → Site → Département → Utilisateur) : pas de table.
- Permissions configurables par rôle : tables présentes mais aucune route ni application (les rôles sont codés en dur).
- Inventaire physique (comptage / écarts de stock), sauvegarde/restauration et export complet des données.
- « Mot de passe oublié » en libre-service par e-mail (nécessite un service d'envoi d'e-mails configuré).
- Isolation par site : plusieurs routes acceptent `siteId` envoyé par le client sans le comparer à celui de
  l'utilisateur connecté (à durcir avant d'ouvrir à plusieurs entreprises).
- Synchronisation : un mouvement de stock synchronisé ne recalcule pas le stock courant (à corriger côté serveur).
- Tableaux de bord séparés camions / véhicules de service avec graphiques, rapport quotidien : à compléter
  côté API (`/reports/dashboard` donne déjà le total) et côté application.
- Application mobile native, biométrie, scan QR avec caméra : hors périmètre de l'API.
