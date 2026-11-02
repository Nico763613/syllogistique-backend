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

## Alertes et seuils de stock
- Alertes **instantanées** (en plus du contrôle quotidien de 6h00) : rupture (CRITIQUE), passage sous le seuil minimum
  (AVERTISSEMENT), dépassement du seuil maximum (INFO) — une seule alerte par franchissement, aussi pour les mouvements
  synchronisés hors ligne et les corrections.
- `PATCH /inventory/items/:id` : modifier les seuils minimum/maximum, l'entrepôt/emplacement, le prix — motif obligatoire.
- Application : centre d'alertes sur le tableau de bord (bouton « Lu »), colonnes seuil max. et entrepôt dans Stocks,
  bouton « Seuils », champs seuil max. et entrepôt à la création d'un article.
- « Entrepôt » = champ emplacement de l'article (pas encore de gestion multi-entrepôts avec transferts).

## Inventaire physique
- `POST /inventory/counts` (démarrer, par site ou entrepôt/emplacement : le stock théorique est figé),
  `GET /inventory/counts`, `GET /inventory/counts/:id` (écarts et valorisation), `POST /inventory/counts/:id/lines`
  (saisie des quantités comptées), `POST /inventory/counts/:id/validate` (**motif obligatoire**, réservé aux
  administrateurs) et `POST /inventory/counts/:id/cancel`.
- La validation ajuste le stock (variation appliquée au stock courant : les mouvements survenus pendant le comptage
  sont conservés), crée un mouvement `ADJUSTMENT` par écart, déclenche les alertes de seuil et journalise le tout.
- Nouvelles tables `inventory_counts` et `inventory_count_lines` : créées automatiquement au démarrage de l'API.
- Application : panneau « Inventaire physique » dans Stocks.

## Journal des mouvements et analyse du stock
- `GET /inventory/movements?siteId&itemId&type&from&to&limit` : journal (qui, quand, quoi, motif) ;
  `GET /inventory/movements/export/excel` : export Excel avec les mêmes filtres.
- `GET /inventory/analysis?siteId&days=30` : par article, consommation moyenne par jour, **couverture en jours**,
  état (rupture / sous seuil / surstock / OK) et **quantité conseillée à commander** (si sous le seuil minimum
  ou moins de 7 jours de couverture ; cible = seuil maximum, à défaut max(2 × minimum, 30 jours de consommation)).
- Application : « Journal des mouvements » (filtres + export Excel) dans Stocks.

## Départements (Logistique, Carburant, Stock, RH)
- Nouvelle colonne `users.department` (texte, facultative). **Ajoutée automatiquement au démarrage de l'API**
  (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`, idempotent) : aucune commande à lancer sur Neon. Elle est aussi déclarée
  dans `schema.prisma` (compatible `db push` / `migrate`).
- Règle : un utilisateur **sans département n'est pas restreint** (les comptes existants continuent de fonctionner) ;
  le SUPER_ADMIN a toujours un accès global ; un utilisateur rattaché à un département ne peut **modifier** que les
  données de son département. La consultation (GET) reste ouverte (listes de véhicules, chauffeurs…).
- Départements → modules : LOGISTIQUE = véhicules, missions, maintenance, documents, dépenses, chauffeurs ;
  CARBURANT = carburant, missions, dépenses ; STOCK = articles et mouvements, fournisseurs, achats, ventes, clients ;
  RH = chauffeurs et pointage.
- Appliqué aussi à la synchronisation hors ligne (`/sync/push`, entité par entité).
- Affectation : `PATCH /users/:id` `{ "department": "STOCK" }` (ou `null`), ou Paramètres → « Utilisateurs et
  départements ». Effectif à la prochaine connexion (le département est dans le jeton).

## Encore à décider / faire
- Multi-entrepôts avec transferts, bons de commande/livraison/factures.
- Tarif carburant : sans ligne en base, le défaut 12 000 GNF/L s’applique ; la ligne est créée à la première modification.


## Achats & réapprovisionnement automatique
- `GET /purchases/reorder?siteId=` : articles à commander (sous seuil ou < 7 j de couverture), groupés par fournisseur ; les quantités déjà commandées (bons ouverts) sont déduites ; articles sans fournisseur signalés.
- `POST /purchases/reorder/create-drafts` : crée un bon de commande BROUILLON par fournisseur (audit).
- `POST /purchases/orders/:id/confirm` (admins) : validation d'un brouillon.
- `POST /purchases/orders/:id/cancel` (admins, motif obligatoire) : refusé si marchandise déjà reçue.
- `GET /purchases/orders/:id/pdf` : bon de commande imprimable (en-tête organisation, fournisseur, lignes, total, « Établi par » automatique, zone de signature).
- PWA : nouvelle vue « Achats » (à commander, bons de commande, fournisseurs).

## Pannes et immobilisations de véhicules
- Table `vehicle_downtimes` (créée automatiquement au démarrage + déclarée dans `schema.prisma`).
- `POST /downtimes` (motif obligatoire, catégorie, coût estimé) : le véhicule passe en IMMOBILISÉ ; une seule immobilisation ouverte par véhicule.
- `POST /downtimes/:id/resolve` : remise en service (coût réel, observation), durée calculée, véhicule redevient DISPONIBLE.
- `GET /downtimes?siteId=&vehicleId=&open=true` : historique + indicateurs (en cours, jours cumulés, coût).
- Chaque étape est tracée dans le journal d'audit avec le motif. PWA : section dans la vue Véhicules.

## Véhicules IT (Immatriculation Temporaire)
- Véhicules de service sous plaque IT : champs `registrationType` (NORMALE | IT) et `itExpiryDate` (colonnes ajoutées automatiquement au démarrage).
- Formulaire véhicule : choix du type d'immatriculation + fin de validité ; badge « IT → date » dans la liste du parc.
- Alerte automatique (contrôle quotidien 06:00 + centre d'alertes) 15 jours avant l'expiration de la plaque IT, puis tant qu'elle est expirée.

## Permis des chauffeurs
- Le n° de permis (et catégorie, date d'expiration) se saisit à la création du chauffeur et se corrige par le bouton ✏️ de la colonne « Permis ».
- Il figure aussi dans le rapport du jour (trajets et absences) à côté du nom du chauffeur.
- Le parc de départ est de 10 véhicules : aucune limite en dur, on ajoute les véhicules au fur et à mesure.

## Objectif de parc
- Réglage `FLEET_TARGET` (10 par défaut), modifiable par les administrateurs depuis la vue Véhicules (« ✏️ Objectif ») ; affichage « Parc (x / 10 prévus) » et nombre restant à enregistrer. Aucune limite bloquante.

## Documents des véhicules (interface)
- Nouvelle section dans la vue Véhicules : assurance, visite technique, carte grise, contrat (référence + échéance), triés par échéance avec état (valide / expire dans X j / expiré). Alerte automatique 30 jours avant (service existant).

## Fiche de bord et bon de sortie (PDF)
- `GET /trips/:id/pdf` : fiche de bord (véhicule/plaque IT, chauffeur + n° de permis, destination, heures, km départ/retour, carburant du jour, signatures). PWA : section « Missions et fiches de bord » (démarrer, clôturer, imprimer) dans la vue Véhicules.
- `GET /inventory/delivery-note?siteId&from&to&beneficiary` : bon de sortie/livraison des sorties de stock de la période, « Établi par » automatique + signature du bénéficiaire. PWA : bouton « Bon de sortie (PDF) » dans le journal des mouvements.
- Socle commun `src/common/pdf-doc.ts` (en-tête, signatures) pour les prochains documents.

## Transferts entre entrepôts / sites
- `POST /inventory/transfers` {itemId, toSiteId, quantity, motif} : sortie à la source + entrée à destination en une seule transaction (annulée si stock insuffisant). L'article est créé à destination avec le même code s'il n'existe pas. Deux mouvements TRANSFER liés par une référence TR-…, visibles dans le journal ; alertes de seuil sur les deux sites ; audit avec motif.
- Les transferts ne sont pas comptés comme consommation dans l'analyse de réapprovisionnement.
- PWA : panneau « Transfert vers un autre entrepôt / site » dans la vue Stocks (les entrepôts = sites de l'organisation).

## Deux entrepôts
- Limite à 2 entrepôts (sites) actifs, réglage `MAX_SITES` (2 par défaut) ; le Super Admin crée le 2e entrepôt depuis la vue Stocks (panneau Transfert). Au-delà : message de limite.

## Sélecteur d'entrepôt
- Liste déroulante dans l'en-tête dès qu'il y a 2 entrepôts : change l'entrepôt actif (stocks, journal, achats, rapport) sans manipuler d'identifiant. Si le site mémorisé n'existe plus, le premier entrepôt actif est choisi automatiquement.
