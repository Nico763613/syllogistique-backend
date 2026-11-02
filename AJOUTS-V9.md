# SYLLOGISTIQUE — Ajouts V9 (fondations : tarif carburant, motifs, rôles)

⚠️ Ces ajouts n'ont PAS été compilés ni testés (pas d'accès npm lors de leur écriture). Avant fusion dans
`main` : `npm install && npm run build`. Aucune modification du schéma de base de données (pas de migration).

## Tarif carburant unique, modifiable (12 000 GNF/L)
- Clé `FUEL_PRICE_PER_LITER` (défaut 12 000 si absente). Les anciennes clés `TRUCK_FUEL_PRICE` /
  `SERVICE_VEHICLE_FUEL_PRICE` ne sont plus utilisées.
- `GET /settings/fuel-price` : tarif actuel (tous les rôles).
- `PUT /settings/FUEL_PRICE_PER_LITER` `{ "value": "12500", "reason": "…" }` : SUPER_ADMIN / ADMIN_LOGISTIQUE,
  **motif obligatoire**, journalisé (ancien/nouveau prix + motif).
- Le tarif est relu à chaque opération : tout nouveau calcul (saisie en ligne ou synchronisation hors ligne)
  l'utilise aussitôt. Le prix envoyé par le client est ignoré. L'historique garde le prix de sa date.
- L'application (onglet Carburant) affiche le tarif et permet de le modifier (Administrateurs).

## Motif obligatoire et Audit Trail
- `AuditService.log` accepte `reason` : conservé dans `newValue.motif` (aucune migration).
- `GET /audit?entity=&entityId=&userId=&from=&to=&limit=` : consultation du journal (SUPER_ADMIN, ADMIN_LOGISTIQUE).
- Corrections avec motif obligatoire (≥ 3 caractères), ancien/nouveau enregistrés :
  `PATCH /fuel/:id`, `PATCH /trips/:id/correct`, `POST /inventory/movements/:id/correct`
  (le stock est recalculé), nouveau pointage sur un jour déjà saisi (`correctionReason`).
- Entrées et sorties de stock : champ `reason` désormais obligatoire.

## Rôles
- Le rôle LECTEUR ne peut plus écrire : carburant, missions, maintenance, synchronisation, envoi de rapport,
  téléversement et contrôles quotidiens sont protégés par `@Roles`.

## Synchronisation
- Un mouvement de stock créé hors ligne met maintenant à jour le stock de l'article (une seule fois).
- Les ravitaillements synchronisés sont recalculés avec le tarif central.

## Rapport journalier (PDF + WhatsApp)
- `GET /reports/daily?siteId&date=AAAA-MM-JJ` : flotte (disponibles/en mission/maintenance/immobilisés), missions du jour,
  carburant du jour par véhicule + **cumul lundi→vendredi**, mouvements de stock et articles sous seuil, pointage des chauffeurs.
  Renvoie aussi le texte prêt pour WhatsApp et l'émetteur (nom, téléphone, fonction de l'agent connecté).
- `GET /reports/daily/export/pdf` : PDF du rapport (bleu nuit / or, bloc « Établi par »).
- `GET /reports/daily/whatsapp` : liens `wa.me` vers la hiérarchie (paramètre `REPORT_WHATSAPP_NUMBERS`, numéros
  internationaux séparés par des virgules ; sans numéro, WhatsApp laisse choisir le contact).
- Application : onglet « Rapport du jour » (date, indicateurs, PDF, partage du PDF via le menu de partage du téléphone,
  envoi du texte sur WhatsApp, numéros modifiables par l'Administrateur).
- `POST /reports/daily/send-email` `{ to, siteId, date }` : e-mail avec le PDF en pièce jointe (1 à 10 destinataires).
  Nécessite `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` sur Render ; sans SMTP l'envoi est
  simulé et l'application l'indique. Destinataires habituels : paramètre `REPORT_EMAIL_RECIPIENTS`.
- « Enregistrer dans un dossier » : sélecteur de dossier sur PC (Chrome/Edge) ; sur téléphone, dossier Téléchargements.
- Limite : la fonction de partage de fichier dépend du téléphone/navigateur ; sinon télécharger le PDF ou envoyer le texte.
  Aucun envoi automatique sans service WhatsApp Business (API) configuré.

## Encore à décider / faire
- **Départements** (Logistique, Carburant, Stock, RH) : nécessite une migration (colonne département sur l'utilisateur).
- Bons de commande/livraison/factures, inventaire physique (écarts).
- Base déjà en ligne : ajouter la ligne `FUEL_PRICE_PER_LITER` = `12000` (ou la créer via l'application).
