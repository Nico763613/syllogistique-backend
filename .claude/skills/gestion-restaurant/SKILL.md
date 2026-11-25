---
name: gestion-restaurant
description: Connaissances métier pour concevoir une application de gestion de restaurant, maquis, snack, hôtel, traiteur ou boulangerie-pâtisserie : commandes, cuisine, caisse, stock de denrées, fiches recettes et coût matière, réservations, chambres, rapports. À utiliser dès qu'il est question de restaurant, de café, de cuisine, de service en salle, d'hôtel ou de restauration.
---

# Gestion de restaurant et d'hôtel

## Modules recommandés
1. **Menu et fiches recettes** : plats, ingrédients, quantités, coût matière, prix, marge, catégories.
2. **Prise de commande** : par table ou à emporter, notes spéciales, envoi à la cuisine ou au bar, modification avant envoi.
3. **Cuisine** : bons de préparation par poste, état « en cours » et « prêt », temps d'attente.
4. **Caisse** : addition, partage de l'addition, remises, paiement en espèces et mobile, ticket, annulations tracées, clôture quotidienne avec écart.
5. **Stock de denrées** : entrées, sorties automatiques selon les recettes, pertes avec motif, alertes de seuil et de péremption, inventaire.
6. **Achats et fournisseurs** : commandes, réceptions, factures, dettes.
7. **Réservations et salle** : plan des tables, réservations, liste d'attente.
8. **Hôtel (si besoin)** : planning des chambres, arrivées et départs, tarifs, ménage, facture du séjour.
9. **Personnel** : planning, présences, droits par rôle.
10. **Rapports** : ventes par plat et par heure, coût matière réel, pertes, marges, rentabilité par jour.

## Règles de gestion
- La vente d'un plat décompte automatiquement ses ingrédients.
- Toute annulation ou remise exige un rôle autorisé et laisse une trace.
- Le coût matière se recalcule quand le prix d'achat change.

## Vigilance
Pic de service : saisie très rapide, plusieurs serveurs en même temps. Connexion instable : la commande ne doit jamais être bloquée, elle se synchronise ensuite. Fraude de caisse : journal et droits stricts.

## Écrans clés
Prise de commande (grands boutons), écran cuisine, caisse, tableau de bord du gérant.
