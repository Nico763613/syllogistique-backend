
## 2026-11-27 — Un seul endroit par action, menus sans doublon
- Décision : l'ajout d'un chauffeur se fait uniquement dans « Appareils chauffeurs » ; chaque écran n'apparaît qu'une fois par menu ; recherche générale remplacée par un slogan.
- Raison : demande du client, éviter que l'utilisateur ajoute la même personne à plusieurs endroits.
- Risque accepté : les anciens raccourcis vers « Ajouter un chauffeur » dans Chauffeurs renvoient désormais vers Appareils chauffeurs ; la recherche générale est masquée (code conservé).

## 2026-11-27 — Messages d'erreur toujours en français
- Décision : tout message renvoyé par le serveur en anglais (messages par défaut du framework, validation des champs, coupure réseau) est traduit dans l'application avant affichage ; un message anglais non reconnu est remplacé par un message français clair selon le type d'erreur.
- Raison : les utilisateurs ne lisent pas l'anglais.
- Risque accepté : un message anglais très particulier peut être remplacé par un message plus général.
