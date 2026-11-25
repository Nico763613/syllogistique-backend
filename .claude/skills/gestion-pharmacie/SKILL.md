---
name: gestion-pharmacie
description: Connaissances métier pour concevoir une application de gestion de pharmacie, officine ou dépôt pharmaceutique : stock par lot et péremption, ventes et caisse, ordonnances, commandes fournisseurs, produits contrôlés, assurances et tiers payant, rapports. À utiliser dès qu'il est question de pharmacie, médicaments, officine ou stock de produits pharmaceutiques.
---

# Gestion de pharmacie

## Modules recommandés
1. **Produits** : fiche (nom, forme, dosage, catégorie, fournisseur, prix d'achat et de vente, seuil d'alerte, produit contrôlé oui/non, ordonnance obligatoire oui/non).
2. **Stock par lot** : chaque entrée a un numéro de lot et une date de péremption. Sortie selon premier périmé, premier sorti. Inventaire avec écarts justifiés.
3. **Ventes et caisse** : recherche rapide, ventes en espèces, mobile et assurance, ticket, annulation tracée, clôture de caisse.
4. **Ordonnances** : enregistrement, vérification de l'obligation d'ordonnance, historique par patient avec accès restreint.
5. **Commandes et fournisseurs** : propositions de commande selon les seuils, réception avec contrôle des lots, factures et dettes fournisseurs.
6. **Produits contrôlés** : registre dédié, entrées et sorties numérotées, non modifiable sans trace.
7. **Assurances et tiers payant** : taux de prise en charge, part du patient, états de facturation.
8. **Rapports** : ventes, marges, ruptures, péremptions proches, produits dormants, rentabilité par catégorie.
9. **Utilisateurs et droits** : titulaire, préparateur, caissier, comptable avec droits distincts.

## Alertes utiles
Rupture, seuil bas, lot qui expire dans 90, 60 et 30 jours, écart de caisse, produit contrôlé sorti sans ordonnance.

## Règles à confirmer avec l'utilisateur
Réglementation locale sur les prix et marges, produits contrôlés, durée de conservation des ordonnances et registres.

## Vigilance
Données de santé sensibles : accès par rôle, journal des consultations de dossier, sauvegardes. Ne pas inventer de posologies ni d'interactions : utiliser une base reconnue ou laisser la décision au pharmacien.

## Écrans clés
Caisse (très rapide), alertes du jour, entrée de stock avec lots, inventaire, tableau de bord du titulaire.
