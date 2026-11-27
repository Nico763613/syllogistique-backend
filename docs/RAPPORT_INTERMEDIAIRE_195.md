# Rapport intermédiaire — livraison n°195 (avant toute intervention en production)

Date : 27/11/2026. Branche : `fix/plateforme-multi-entreprises` (PR #195). Commit vérifié : voir § 9.

**Aucune intervention n'a eu lieu en production.** Aucun déploiement, aucune création de rôle réel, aucune modification de compte réel, aucune suppression. La production tourne toujours sur l'ancienne version (Render, branche `main`).

Ce rapport répond à la condition 10 de votre validation du 27/11 à 19 h 06. SYL n'est pas déclarée « prête à la commercialisation » : plusieurs points restent à faire ou à décider (§ 7 et § 8).

## 1. Statuts utilisés

- **Conforme et vérifié** : le comportement est prouvé par un test exécuté (sortie de commande conservée).
- **Conforme sous réserve** : prouvé en test, avec une limite que je précise.
- **Partiellement conforme** : une partie seulement est faite ou prouvée.
- **Non conforme** : l'exigence n'est pas remplie aujourd'hui.
- **Non testé** : impossible à prouver depuis mon environnement.
- **Hors périmètre** : à faire plus tard ou par vous.

Les tests tournent sur une base PostgreSQL neuve et jetable, créée par l'intégration continue (GitHub Actions). Ce n'est **jamais** la production.

## 2. Matrice de conformité

| # | Point du mandat | Statut | Preuve |
|---|---|---|---|
| 1 | Reprise intégrale du cahier des charges (§1–40, exigences 1–22, consigne 23) | Partiellement conforme | Les décisions, AJOUTS-V8/V9 et la documentation ont été repris. Le texte complet des §1–40 et des exigences 1–22 n'est pas dans le dépôt ni dans les pièces jointes reçues : je ne les invente pas (§ 8). |
| 2 | Sauvegarde complète avant intervention | Conforme et vérifié | Branche de sauvegarde Neon `br-noisy-morning-aeotgsum`, empreintes comparées. |
| 2 | Test réel de restauration | Conforme sous réserve | Restauration sur `br-dawn-morning-aeteckqi`, données identiques (utilisateurs 5, véhicules 2, chauffeurs 2, missions 2, journal 150…). Le **démarrage de l'application** sur cette copie n'a pas été fait (§ 7). |
| 2 | Sauvegarde quotidienne chiffrée | Non conforme | Plan gratuit Neon : restauration instantanée sur 6 h seulement, aucune copie quotidienne hors Neon. Deux options chiffrées dans `docs/SAUVEGARDE.md`, en attente de votre accord. |
| 3 | Cloisonnement entre entreprises | Conforme et vérifié | `functional6` : B ne lit, ne modifie et ne crée rien chez A (véhicules, clients, articles, comptes, sites, stock, carburant, conflits, logo), dans les deux sens. |
| 3 | Conflits hors ligne et déduplication | Conforme et vérifié | `functional6` : numéro de version, conflit détecté sans écrasement, file d'arbitrage, renvoi identique ignoré. |
| 3 | Migrations numérotées | Conforme et vérifié | CI : migrations appliquées, retour arrière 0005 → 0003, puis réapplication. |
| 3 | Récupération du mot de passe | Conforme et vérifié | `functional6` : code de récupération, sessions ouvertes coupées après récupération. |
| 3 | Clé d'accès plateforme | Conforme et vérifié | Sans clé ou avec une mauvaise clé : refus. |
| 3 | Protection des fichiers | Conforme et vérifié | Liens signés et temporaires ; lien non signé, modifié, expiré ou nom invalide refusé ; A n'obtient pas le logo de B. |
| 3 | Numérotation par entreprise | Conforme et vérifié | Code entreprise distinct par entreprise (`functional6`). |
| 3 | Inscriptions chauffeurs par entreprise | Conforme et vérifié | Le lien de B rattache l'inscription à B ; A ne peut pas la refuser. |
| 4 | 15 profils, droits appliqués par le serveur | Conforme et vérifié | `scripts/profils15.js` : chaque écran de consultation × chaque profil. |
| 4 | Les 4 profils manquants (Mécanicien, Pointeur, Comptable, Responsable des opérations) | Conforme sous réserve | La CI reproduit la production (11 profils sur 15). La création d'un compte de ces 4 profils échouait (« Rôle introuvable ») : corrigé, le profil s'enregistre au premier compte. **Rien n'a été créé en production.** |
| 5 | Hiérarchie et traçabilité | Conforme et vérifié | Chaque étape de validation est refusée hors ordre (§ 4) ; le DG retrouve l'opération dans le journal. |
| 6 | 3 comptes à mot de passe provisoire | Conforme sous réserve | Messages rédigés dans `docs/COMMUNICATIONS_COMPTES_PROVISOIRES.md`, **non envoyés**. Doublon de compte DG (Mohamed Condé) signalé, à trancher par vous. |
| 7 | 6 circuits métiers | Voir § 4 | |
| 8 | Contrôle de tous les modules | Conforme sous réserve | `functional` à `functional6`, tests d'interface, 15 profils, audit comptable. Prouvé sur base de test, pas sur téléphone réel. |
| 10 | Étude comptabilité générale et permissions configurables | Conforme et vérifié (étude) | `docs/ETUDE_COMPTABILITE_PERMISSIONS.md`. Aucun droit actuel modifié. |
| 11 | Essais sur appareils réels | Non testé | Protocole prêt : `docs/PROTOCOLE_TEST_TELEPHONES.md`. À faire par vous ou un testeur. |
| 13 | Documentation à jour, sans « bientôt disponible » | Conforme et vérifié | Docs mises à jour ; plus aucune mention « bientôt disponible » dans l'interface. |
| 15 | Rapport final | Hors périmètre | Ce document est le rapport **intermédiaire**. Le rapport final viendra après votre décision sur la mise en production. |

## 3. Les 15 profils

**Conforme et vérifié** (CI du commit `ad22bb9`, étape « Recette des 15 profils »).

- Les droits sont lus directement dans l'application compilée : 106 écrans de consultation dans 37 modules.
- Un compte de test par profil a été créé, puis chaque profil a ouvert chacun des 106 écrans (1 590 essais) :
  - 940 accès accordés, et prévus ;
  - 645 refus, et prévus ;
  - **0 accès non prévu (aucune faille)** ;
  - 0 refus inexpliqué ;
  - 5 refus voulus par une règle métier : l'espace chauffeur sans appareil activé (§ 6).
- Tout écran réservé à des rôles est bien protégé côté serveur.
- La matrice complète est dans `docs/MATRICE_15_PROFILS.md`.
- Limite : ce contrôle couvre la **consultation**. Les écritures (création, validation, paiement) sont prouvées par les circuits du § 4 et par `functional4` (droits de création de comptes du DG et de la Logistique, etc.).

## 4. Les 6 circuits métiers (sur base de test)

| Circuit | Statut | Ce qui est prouvé |
|---|---|---|
| 1. Pannes | Conforme et vérifié | Déclaration par la flotte, une seule panne ouverte par véhicule, urgence, prise en charge par un seul mécanicien, demande de pièce, remise par le stock, clôture refusée sans pièce ni coût, clôture par le seul mécanicien en charge, historique. |
| 2. Fiches de bord | Conforme et vérifié | Arrivée avec un kilométrage inférieur refusée, photo du reçu exigée, envoi, **fiche verrouillée** après envoi, appareil activé obligatoire. Hors ligne : synchronisation et conflits prouvés (`functional6`). Sur téléphone réel : non testé. |
| 3. Dépenses | Conforme sous réserve | Dépense sans photo refusée, dépense avec reçu acceptée, catégorie invalide refusée, validation hiérarchique, dépense retrouvée dans le journal. Le contrôle des montants (plafond, montant négatif d'une dépense de fiche de bord) n'a pas de test dédié. |
| 4. Validations | Conforme et vérifié | Logistique → Opérations → Comptabilité : les Opérations ne valident pas avant la Logistique, la Comptabilité ne paie pas avant la validation, seule la Comptabilité accorde. |
| 5. Paiements | Conforme et vérifié | Paiement refusé avant accord, **double paiement refusé**, paiement Orange Money déclaré puis confirmé par la comptabilité, seul un paiement mobile peut être mis en attente. Références et montants fictifs. |
| 6. Synchronisation et récupération | Conforme et vérifié | Modifications concurrentes, conflit arbitré une seule fois, l'auteur n'arbitre pas son propre conflit, reprise hors ligne, récupération du mot de passe. |

## 5. Défauts trouvés et corrigés pendant la recette

1. **Création de compte impossible pour les 4 nouveaux profils** en production (« Rôle introuvable »). Corrigé.
2. **Rapports de période** : sans dates, le serveur répondait par une erreur 500. Il répond maintenant par un message clair en français.
3. **Fichiers téléversés** accessibles sans contrôle. Ils passent maintenant par un lien signé et temporaire.
4. **Numérotation et inscriptions** de chauffeurs partagées entre entreprises. Elles sont maintenant propres à chaque entreprise.
5. **Mentions « bientôt disponible »** encore possibles dans l'interface : retirées.

## 6. Ce qui reste refusé exprès (règles métier)

L'espace chauffeur exige un **appareil activé** (un seul appareil par chauffeur) et un compte lié à une **fiche chauffeur**. Un compte Chauffeur sans appareil activé est donc refusé sur ses propres écrans : c'est voulu. Le circuit complet, avec activation par code, est prouvé dans `functional4`.

## 7. Ce qui n'est pas fait, et pourquoi

- **Démarrage de l'application sur la copie restaurée** : mon environnement ne peut pas joindre Neon. Il faut un service Render de test, payant, que vous paierez plus tard. Le paquet et le contrôle d'empreintes sont prêts (`scripts/boot-check.sql`).
- **Essais sur téléphones réels** : à faire avec le protocole fourni.
- **Sauvegarde quotidienne chiffrée hors Neon** : en attente de votre choix.
- **Les 4 profils en production** : préparés, non créés. Ils s'enregistreront d'eux-mêmes au premier compte, après déploiement.

## 8. Décisions qui vous reviennent

1. **Mise en production** de la livraison 195. Je demande votre accord écrit. Plan : sauvegarde Neon juste avant, déploiement, contrôles après, retour arrière si anomalie.
2. **Doublon du compte DG** de Mohamed Condé : lequel garder ?
3. **Envoi des messages** aux titulaires de mots de passe provisoires.
4. **Sauvegarde quotidienne** : option GitHub Actions (gratuite, avec un secret à créer par vous) ou plan Neon Launch (payant).
5. **Changement de mot de passe de la base** : le mot de passe de connexion des copies de test est apparu dans mes outils de travail. La copie restaurée partage le mot de passe de production. Je recommande de le changer, avec votre accord.
6. **Nettoyage des branches de test** : Neon n'a plus qu'une place libre sur 10. Je ne supprime rien sans votre accord.
7. **Texte complet des §1–40 et exigences 1–22** : merci de me le transmettre si vous voulez une vérification ligne par ligne.

## 9. Preuves

RESULTAT_CI
