---
name: conception-multiplateforme
description: Conception d'applications qui fonctionnent sur téléphone, tablette et ordinateur (Android, iOS, web) : choix entre application web installable, multiplateforme ou native, mode hors-ligne et synchronisation, responsive, performance sur connexion lente, publication. À utiliser dès qu'une application doit tourner sur plusieurs appareils ou qu'on hésite sur la technologie à choisir.
---

# Conception multiplateforme

## 1. Choisir l'approche
| Besoin | Approche conseillée |
|---|---|
| Outil de gestion, formulaires, tableaux, rapports | Application web installable (PWA) : un seul code, mise à jour instantanée, pas de boutique obligatoire |
| Accès poussé à l'appareil (Bluetooth, capteurs, notifications avancées) ou présence en boutique exigée | Multiplateforme (un code pour Android et iOS) |
| Performances graphiques extrêmes, fonctions système très spécifiques | Natif, seulement si c'est indispensable |

Toujours justifier le choix dans `decisions.md` avec le coût, le délai et la maintenance.

## 2. Hors-ligne et synchronisation
- Lister les tâches qui doivent marcher sans connexion (saisie de vente, fiche de bord, inventaire).
- Stocker localement, mettre en file d'attente, synchroniser dès que le réseau revient.
- Prévoir la gestion des conflits (deux personnes modifient la même fiche) : règle claire, par exemple « la modification la plus récente gagne, l'ancienne est conservée dans l'historique ».
- Montrer à l'utilisateur l'état : hors-ligne, en attente d'envoi, synchronisé.

## 3. Affichage sur tous les écrans
- Conception mobile d'abord, puis tablette, puis ordinateur.
- Zones tactiles d'au moins 44 px, textes lisibles en plein soleil.
- Tableaux larges : défilement horizontal ou cartes sur petit écran.
- Tester sur un petit écran, un grand écran et un ancien téléphone.

## 4. Performance
Peu de poids par page, images compressées, chargement progressif, cache. Mesurer avant et après sur connexion lente.

## 5. Publication
Icône 1024 × 1024, écrans de démarrage, description, politique de confidentialité, procédure de mise à jour. Pour une PWA : consigne d'installation sur l'écran d'accueil expliquée à l'utilisateur.

## 6. Contrôle avant livraison
- Le parcours principal marche sans connexion.
- Aucune perte de saisie si la connexion coupe.
- Les droits par rôle sont les mêmes sur tous les appareils.
- Ce qui a réellement été testé est écrit, avec l'appareil ou le navigateur.
