
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
