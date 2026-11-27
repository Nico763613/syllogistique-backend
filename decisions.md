
## 2026-11-27 — Un seul endroit par action, menus sans doublon
- Décision : l'ajout d'un chauffeur se fait uniquement dans « Appareils chauffeurs » ; chaque écran n'apparaît qu'une fois par menu ; recherche générale remplacée par un slogan.
- Raison : demande du client, éviter que l'utilisateur ajoute la même personne à plusieurs endroits.
- Risque accepté : les anciens raccourcis vers « Ajouter un chauffeur » dans Chauffeurs renvoient désormais vers Appareils chauffeurs ; la recherche générale est masquée (code conservé).

## 2026-11-27 — Messages d'erreur toujours en français
- Décision : tout message renvoyé par le serveur en anglais (messages par défaut du framework, validation des champs, coupure réseau) est traduit dans l'application avant affichage ; un message anglais non reconnu est remplacé par un message français clair selon le type d'erreur.
- Raison : les utilisateurs ne lisent pas l'anglais.
- Risque accepté : un message anglais très particulier peut être remplacé par un message plus général.

## 2026-11-27 — Un menu = un seul contenu
- Décision : un écran ouvert depuis une rubrique précise du menu (Entrées, Sorties, Chauffeurs camion, Carburant par camion…) n'affiche que cette rubrique ; la barre d'onglets qui répétait le menu est masquée. Le bandeau « Ressources humaines » qui doublait le menu est désactivé. Chauffeurs camion, Chauffeurs véhicule de service et Archives sont trois rubriques séparées du menu.
- Raison : éviter les doublons et le mélange d'informations demandés par le client.
- Risque accepté : ouvert autrement que par le menu (lien interne), l'écran garde sa barre d'onglets complète.

## 2026-11-27 — Plus aucune rubrique « bientôt disponible »
- Décision : le DG consulte le journal d'activité (lecture seule, `GET /audit` ouvert au rôle DIRECTEUR_GENERAL) ; le gestionnaire de stock a un écran « Répertoire fournisseurs » séparé des Achats.
- Raison : consigne n° 23 du client (pas de page vide ni de rubrique inachevée).
- Risque accepté : le journal affiche au plus les 300 opérations les plus récentes par recherche (réduire la période pour remonter plus loin).

## 2026-11-27 — Reprise de session après chargement complet
- Décision : la reconnexion automatique (session déjà ouverte) attend que tous les scripts de l'interface soient chargés.
- Raison : elle s'arrêtait sur l'erreur « spaceApply is not defined » et pouvait laisser le menu du rôle non appliqué.
- Risque accepté : aucun (quelques millisecondes de plus au démarrage).

## 2026-11-27 — Entrée/sortie de stock : message visible
- Décision : toute erreur de « Nouvelle entrée / Nouvelle sortie » (aucun article, réseau) s'affiche à l'écran.
- Raison : le bouton semblait ne rien faire quand aucun article n'existait.

## 2026-11-27 — Le DG gère les comptes de ses responsables
- Décision : le DG reste en lecture seule, sauf pour créer, modifier, suspendre et inviter les comptes qu'il encadre (POST /staff, PATCH /staff/:id, POST /staff/:id/status, POST /staff/invite). Les rapports du personnel restent interdits en écriture.
- Raison : l'écran « Gestion des responsables » échouait à chaque enregistrement (le garde global bloquait toute écriture du DG).
- Risque accepté : surface d'écriture du DG élargie, limitée par la hiérarchie serveur (canManageRole) et testée dans scripts/functional4.js.

## 2026-11-27 — Responsable commercial et Caissier ajoutés aux comptes créés par le DG
- Décision : ajout de RESPONSABLE_COMMERCIAL et CAISSIER à la liste des postes de bureau (staff.dto) et à l'écran du DG.
- Raison : la hiérarchie les plaçait déjà sous le DG, mais aucun écran ne permettait de les créer.
- Risque accepté : aucun nouveau droit, seulement un formulaire qui manquait.

## 2026-11-27 — Test automatique des circuits sur base réelle
- Décision : scripts/functional4.js (droits par rôle, comptes du DG, circuit panne, circuit chauffeur jusqu'au paiement) ajouté à l'intégration continue.
- Raison : prouver les circuits de bout en bout sur une vraie base PostgreSQL de test, sans toucher aux données réelles.

## 2026-11-27 — Journal limité au domaine pour le stock et la flotte
- Décision : GET /audit filtre côté serveur les entités lisibles par le gestionnaire de stock (stock, achats, besoins, fournisseurs) et le gestionnaire de flotte (véhicules, chauffeurs, carburant, maintenance, fiches, missions).
- Raison : le test des droits a montré que le gestionnaire de stock pouvait lire tout le journal, y compris les comptes utilisateurs.
- Risque accepté : un nouvel écran d'historique d'un autre domaine resterait vide pour ces rôles tant que la liste n'est pas complétée.

## 2026-11-27 — Cloisonnement par site : identifiants, listes, comptes suspendus, mot de passe provisoire
- Décision : (1) la base refuse l'accès par identifiant à un élément d'un autre site (contexte de requête + contrôle Prisma) ; (2) le site de l'utilisateur est réellement imposé dans les listes sans ?siteId (Express 5 recalculait req.query, l'ancienne affectation était perdue) ; (3) un compte suspendu ou supprimé perd l'accès en 20 s maximum ; (4) le changement du mot de passe provisoire est imposé par le serveur.
- Raison : contrôle final de sécurité ; défauts prouvés par scripts/functional5.js sur base de test.
- Risque accepté : les opérations dans une transaction Prisma ne passent pas par le contrôle par identifiant (elles restent protégées par les contrôles métier existants) ; cache d'état de compte de 20 s.

## 2026-11-27 — Plateforme multi-entreprises : filtre central entreprise / site
- Décision : un filtre unique (src/common/tenant-scope.ts) s'applique à toute requête Prisma d'un utilisateur connecté : lectures, comptages, modifications et suppressions groupées, créations (y compris imbriquées) et transactions. Toute référence donnée (véhicule, article, client…) doit appartenir au même périmètre. Une table non classée est refusée par défaut.
- Décision : le Super administrateur est limité à SA propre entreprise (la supervision de toutes les entreprises reste dans la console Master, serveur séparé).
- Décision : catégories de stock et types de maintenance sans entreprise = catalogue commun en lecture seule ; chaque entreprise modifie seulement les siennes.
- Décision : requêtes SQL directes revues une à une (appareils, demandes de prix, paiements mobiles en attente, inscriptions chauffeur, numérotation, types de clients).
- Raison : exigence « plateforme multi-entreprises et multi-sites sécurisée dès la conception ».
- Risques acceptés : (1) numérotation des documents commune à la plateforme (réglable seulement par l'entreprise principale) — bloquant pour vendre la facturation à plusieurs entreprises sur un même serveur ; (2) inscriptions publiques de chauffeurs rattachées à l'entreprise principale ; (3) fichiers joints protégés par lien non devinable seulement.

## 2026-11-27 — Conflits de synchronisation par numéro de version
- Décision : 11 types de fiches portent un numéro de version. Une modification envoyée avec une version dépassée par la modification d'une AUTRE personne n'écrase rien : elle devient un conflit à arbitrer par un responsable (jamais par l'auteur, jamais par le DG). Un même compte sur deux appareils n'entre pas en conflit avec lui-même.
- Risque accepté : un conflit venant de l'écran (et non d'une saisie hors ligne) ne peut être arbitré qu'en gardant la valeur du serveur : la personne ressaisit si besoin.

## 2026-11-27 — Migrations numérotées
- Décision : prisma/migrations-sql/NNNN_nom.up.sql / .down.sql, appliquées au démarrage avec verrou, sauvegarde préalable, transaction, historique (schema_migrations) et retour arrière de la dernière migration. Procédure : docs/MIGRATIONS.md.

## 2026-11-27 — Récupération du mot de passe par code
- Décision : code à 6 chiffres, 15 minutes, 5 essais, usage unique, stocké sous forme d'empreinte HMAC ; réponse identique que le compte existe ou non ; 3 demandes par compte et 10 par adresse IP par heure. Tant que l'envoi d'e-mails n'est pas disponible, les responsables sont prévenus et remettent le code en main propre après vérification d'identité (Utilisateurs → « Code de récupération »).
- Risque accepté : la vérification d'identité par le responsable repose sur sa vigilance (rappel affiché à chaque remise de code).

## 2026-11-27 — Accès plateforme pour créer une entreprise
- Décision : POST /platform/organizations, protégé par la variable PLATFORM_ADMIN_KEY (comparaison en temps constant, 5 essais/minute). Sans la variable, la route répond « introuvable ».
