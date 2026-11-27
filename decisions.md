
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
