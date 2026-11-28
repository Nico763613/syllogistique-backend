# Rapport final de recette — clôture de SYL Logistique

Date : 28/11/2026. Rédigé après relecture complète du dépôt, de son historique, du rapport intermédiaire 195 et des résultats de l'intégration continue (CI).

**Rien n'a été mis en production.** La production reste sur le commit `e739bfa`. Toutes les corrections sont sur la branche `fix/plateforme-multi-entreprises` (PR #195), en attente de votre accord écrit.

## 0. Statuts utilisés (ceux du mandat)

| Statut | Sens |
|---|---|
| Conforme et vérifié | Fait, et prouvé par un test exécuté ou une lecture directe |
| Conforme sous réserve | Fait et testé, mais une partie ne peut pas être vérifiée ici |
| Partiellement conforme | Une partie seulement est faite |
| Non conforme | Pas fait ou défaillant |
| Non testé | Existe peut-être, mais aucune preuve n'a pu être produite |
| Hors périmètre | Non demandé dans ce mandat, ou décision qui vous appartient |

## 1. Version finale et numéro

- **Version : 1.0.0** (première version de clôture ; `package.json`).
- **Livraison** : n°195, branche `fix/plateforme-multi-entreprises`.

## 2. Commit recommandé pour la production

**`4b24462`** (avec ce rapport à jour par-dessus, sans changement de code) — CI entièrement verte : https://github.com/Nico763613/syllogistique-backend/actions/runs/46091969977. Ne fusionnez pas un commit dont la CI n'est pas verte.

Rappel : fusionner la PR #195 dans `main` **met en production automatiquement** (Render redéploie à chaque modification de `main`).

## 3. Modules terminés

Les modules sont décrits dans `MODULES.md`, avec leur test. Résumé :

- **Conforme et vérifié** :
  - auth, users, sites, settings, platform, health ;
  - flotte : vehicles, drivers, application chauffeur, inscription chauffeur, trips, fuel, maintenance ;
  - stock et achats : inventory, transfers, suppliers, purchases, needs ;
  - ventes et finances : customers, sales, payments, cash, expenses ;
  - documents, uploads, hse, staff, notifications, audit, sync ;
  - consultation : dashboards, search, qrcodes, support.
- **Conforme sous réserve** :
  - branding : envoi de logo non testé automatiquement ;
  - license : l'activation passe par le serveur de licences externe ;
  - reports : envoi par e-mail non testé ;
  - messaging : pas de service d'e-mail ;
  - simulation : active seulement dans l'environnement de simulation.
- La récupération du mot de passe par e-mail n'est pas testée (pas de service d'e-mail) ; la récupération par code de l'administrateur est testée.

## 4. Matrice finale des 15 profils

Fichier : `MATRICE_15_PROFILS.md`, produit par la CI (`scripts/profils15.js`).

- 106 écrans de consultation × 15 profils, vérifiés par le serveur : **aucun accès non prévu, 0 anomalie**.
- 5 refus voulus par une règle métier : appareil chauffeur non activé, compte sans fiche chauffeur.
- Compte Chauffeur : limité à l'application chauffeur (correction de ce mandat).
- Statut : **Conforme et vérifié** (sur base de test).

## 5. Résultats détaillés des tests

### 5.1 Intégration continue

| Exécution | Commit | Contenu | Résultat |
|---|---|---|---|
| 46084667881 | b5a74dd | Plafonds des montants, carburant, reçus, rattachement des chauffeurs | **Vert** (3 étapes) |
| 46084766008 | e2e831d | + compte Chauffeur limité | **Vert** (3 étapes) : 485 contrôles réussis, 0 échec |
| 46085357928 | 5057775 | + faille des doublons corrigée, functional7 | Rouge : 17 échecs dans functional7, venant du test lui-même (comptes à mot de passe provisoire). Test corrigé. Tous les autres contrôles, y compris la faille corrigée, étaient verts |
| 46087498721 | 52e508b | + functional7 corrigé, test de démarrage sur copie (base de test) | functional7 **vert** ; démarrage sur copie : 853 ouvertures d'écran par 15 comptes, 0 erreur serveur, 1 refus inattendu (recherche de doublons sans site, conséquence de la correction n°7). Corrigé dans 3eee77b |
| 46091969977 | 4b24462 | Version finale 1.0.0 (dont correction de la recherche de doublons sans site) | **Vert** (3 étapes) : 568 contrôles réussis, 0 échec |

Liens : `https://github.com/Nico763613/syllogistique-backend/actions/runs/<numéro>`.

### 5.2 Ce que couvrent les tests

| Domaine | Script | Statut |
|---|---|---|
| Véhicules, stock, ventes, missions, carburant, entretien | functional.js | Conforme et vérifié |
| Comptes, achats, paiements, caisse, documents, journal | functional2.js | Conforme et vérifié |
| Besoins, HSE, personnel, rapports d'activité, notifications | functional3.js | Conforme et vérifié |
| Circuits complets, plafonds, reçus, compte chauffeur | functional4.js | Conforme et vérifié |
| Sites, sessions, invitations, caisse | functional5.js | Conforme et vérifié |
| Plusieurs entreprises et plusieurs sites, synchronisation, mot de passe | functional6.js | Conforme et vérifié |
| Transferts entre sites, rapports, recherche, QR codes, signalements | functional7.js | Conforme et vérifié (CI 46091969977) |
| Interface (Chrome sans écran) : clics, profils, livraison | ui-click, ui-roles, ui-livraison | Conforme et vérifié (31 + 34 + 38 contrôles) |
| 15 profils | profils15.js | Conforme et vérifié |
| Migrations : retour arrière puis réapplication | CI | Conforme et vérifié |
| Cohérence comptable | audit-comptable.js | Conforme et vérifié |
| SQL direct relu | check-raw-sql.js | Conforme et vérifié (22 fichiers) |

### 5.3 Les 6 circuits métiers

| Circuit | Statut | Preuve |
|---|---|---|
| 1. Pannes | Conforme et vérifié | functional4 |
| 2. Fiches de bord | Conforme et vérifié | functional4, ui-livraison |
| 3. Dépenses | **Conforme et vérifié** (était « sous réserve » dans le rapport 195) | functional4 : plafonds, montant négatif, reçu inexistant ou réutilisé refusés |
| 4. Validations | Conforme et vérifié | functional4 |
| 5. Paiements | Conforme et vérifié | functional2, functional4 |
| 6. Synchronisation et récupération | Conforme et vérifié | functional6 |

### 5.4 Essais sur appareils réels

| Essai | Statut |
|---|---|
| Android, iPhone, PC | **Non testé**. Le protocole est prêt (`PROTOCOLE_TEST_TELEPHONES.md`) ; l'essai doit être fait par vous ou un testeur. |
| Démarrage de l'application sur une copie restaurée de la production | **Non testé sur les données réelles**. Le script a été vérifié en CI sur la base de test (15 profils, 853 écrans, 0 erreur serveur). Un test isolé et en lecture seule est préparé dans le dépôt de sauvegardes (`scripts/boot-copie.js`, décision du 28/11 dans `decisions.md`) ; il se lance à la main. |

## 6. Preuves de sécurité et de cloisonnement entre entreprises

| Exigence | Statut | Preuve |
|---|---|---|
| Une entreprise ne lit, ne modifie, ne crée rien chez une autre | Conforme et vérifié | functional6 : véhicules, clients, articles, comptes, sites, stock, carburant, conflits, logo, transferts — dans les deux sens |
| Un site ne voit pas les données d'un autre site | Conforme et vérifié | functional5, functional6 |
| SQL direct (hors cloisonnement automatique) | **Conforme et vérifié après correction** | 22 fichiers relus. Une faille a été trouvée et corrigée : la recherche de doublons de clients. Contrôle ajouté en CI |
| Droits appliqués par le serveur | Conforme et vérifié | 162 routes d'écriture relues ; profils15 |
| Compte Chauffeur limité au strict nécessaire | Conforme et vérifié | functional4, profils15 |
| Fichiers protégés (liens signés et temporaires) | Conforme et vérifié | functional5, functional6 |
| Numérotation par entreprise | Conforme et vérifié | functional6 |
| Sessions : jeton court, renouvellement annulé à la déconnexion ou au changement de mot de passe, mot de passe provisoire bloquant | Conforme et vérifié | functional5, functional6 |
| Limites d'essais (connexion, codes de récupération) | Conforme et vérifié | CI (pauses nécessaires) |
| Mot de passe par défaut du compte de départ | Conforme et vérifié | Contrôle en lecture seule en production le 28/11 : il ne fonctionne plus |
| Test d'intrusion par un tiers | Non testé | Recommandé avant une commercialisation large |

## 7. Preuves de sauvegarde et de restauration

Détails : `SAUVEGARDE.md`.

| Exigence | Statut | Preuve |
|---|---|---|
| Sauvegarde quotidienne chiffrée hors Neon | **Conforme sous réserve** (corrige le « Non conforme » du rapport 195) | Dépôt privé `syllogistique-sauvegardes-` : exécutions réussies chaque jour du 22 au 27/11/2026, chiffrement AES-256 par clé publique |
| Restauration des données | Conforme et vérifié | Chaque nuit, restauration de contrôle dans une base jetable, avec comparaison table par table ; restauration du 27/11 sur la branche `br-dawn-morning-aeteckqi` |
| Restauration des fichiers | Conforme et vérifié | Les fichiers sont dans la base (`uploaded_files`) : ils sont restaurés avec elle |
| Déchiffrement d'une copie par le propriétaire | **Non testé** | Il exige votre clé privée, que je n'ai pas et ne dois pas avoir (`SAUVEGARDE.md` § 5.3) |
| Procédure de reprise après incident | Conforme et vérifié (document) | `SAUVEGARDE.md` § 6 |

## 8. Anomalies corrigées pendant la clôture

1. **Montants sans plafond.** Un montant trop grand provoquait une erreur serveur. Des plafonds sont ajoutés sur toutes les saisies d'argent et de quantité.
2. **Carburant.** Un plein au prix au litre aberrant était accepté. Il est maintenant refusé, avec un message clair.
3. **Reçus.** Un chauffeur pouvait déclarer une photo inexistante, ou utiliser deux fois le même reçu. Les deux cas sont refusés.
4. **Coût d'entretien négatif** : refusé.
5. **Rattachement des chauffeurs.** Un compte pouvait être relié à une fiche d'un autre site. C'est maintenant refusé.
6. **Compte Chauffeur trop ouvert** (dépenses du bureau, stock, clients…) : il est limité à l'application chauffeur.
7. **Faille de cloisonnement.** La recherche de doublons de clients pouvait révéler les noms et téléphones des clients d'une autre entreprise. C'est corrigé et testé.
8. **Contrôle du SQL direct absent.** Le script était cité dans le code mais n'existait pas. Il est créé et branché dans la CI.
9. **Modules sans test** (transferts, rapports, recherche, QR codes, signalements…) : ils sont couverts par functional7.
10. **Rapport 195 erroné sur la sauvegarde** : corrigé (§ 7).

Corrections précédentes (rapport 195) : création des 4 profils, rapports de période, fichiers protégés, numérotation et inscriptions par entreprise, mentions « bientôt disponible ».

## 9. Réserves restantes

| N° | Réserve | Conséquence |
|---|---|---|
| R1 | Cahier des charges §1–40 et exigences 1–22 : texte complet non disponible | Vérification ligne par ligne impossible : **Non testé**. Seules les parties citées dans le dépôt ont été vérifiées. Je n'ai rien supposé à la place du texte manquant |
| R2 | Pas d'essai sur téléphone réel | Comportement Android, iPhone et PC à confirmer |
| R3 | Démarrage sur copie restaurée non exécuté | Test prêt, à lancer |
| R4 | Déchiffrement de la sauvegarde non testé par vous | À faire une fois avec votre clé privée |
| R5 | Offre gratuite Render : mise en veille, pas d'e-mail | Premier accès lent ; envois par e-mail indisponibles |
| R6 | Neon : 10 branches sur 10 utilisées | Impossible de créer une branche de sauvegarde juste avant la mise en production |
| R7 | 43 écrans de consultation ouverts à tous les profils sauf Chauffeur (dans leur entreprise et leur site) | Par exemple, un caissier peut consulter la liste des véhicules. C'est prévu par le code ; le restreindre serait une évolution |
| R8 | `CORS_ORIGINS` à vérifier dans Render | Si la variable est vide, n'importe quel site peut appeler l'API (la connexion reste obligatoire) |
| R9 | Pas de comptabilité générale (plan comptable, grand livre, bilan) | Voir `ETUDE_COMPTABILITE_PERMISSIONS.md` : **Hors périmètre** |
| R10 | Pas de test d'intrusion externe | Aucune application n'est présentée comme totalement sécurisée |

## 10. Décisions qui demandent votre accord

1. **Mise en production** : votre accord écrit pour fusionner la PR #195, ce qui équivaut à mettre en production.
2. **Doublon du compte DG de Mohamed Condé** : lequel garder ? La correction est préparée et ne sera faite qu'avec votre accord.
3. **Messages aux 3 comptes à mot de passe provisoire** (Véronique Traoré et les 2 comptes DG) : textes prêts dans `COMMUNICATIONS_COMPTES_PROVISOIRES.md`, non envoyés.
4. **Suppression de 3 branches Neon de test**, pour libérer de la place avant la mise en production.
5. **Changement du mot de passe de la base** (recommandé).
6. **Essai de déchiffrement** d'une sauvegarde avec votre clé privée.
7. **Texte complet du cahier des charges** (§1–40, exigences 1–22).
8. **Options payantes**, si vous le souhaitez : offre payante Render (pas de mise en veille, e-mails), offre Neon Launch (retour dans le temps plus long).
9. **Fermeture des 10 anciennes alertes** d'échec de sauvegarde, aujourd'hui résolues.
10. **Clé plateforme `PLATFORM_ADMIN_KEY`** (facultatif) : à saisir par vous dans Render, seulement si vous voulez créer d'autres entreprises.
11. **Restriction des 43 écrans** ouverts à tous les profils : faut-il la prévoir comme évolution ?

## 11. Guide d'installation et d'exploitation

- `GUIDE_INSTALLATION_EXPLOITATION.md` : installation, surveillance, mises à jour, incidents.
- `GUIDE_ADMINISTRATEUR.md` et `GUIDE_UTILISATEUR.md` : utilisation par profil.
- `DOCUMENTATION_TECHNIQUE.md` et `MODULES.md` : architecture, sécurité, tests.

## 12. Procédure de mise en production et de retour arrière

Détail : `DEPLOIEMENT_ET_RETOUR_ARRIERE.md`.

1. La CI du commit recommandé est verte.
2. Votre accord écrit.
3. Sauvegarde manuelle juste avant : `SAUVEGARDE.md` § 5.1.
4. Contrôle « avant » avec `scripts/boot-check.sql`, en lecture seule.
5. Fusion de la PR #195, puis mise en ligne automatique.
6. Contrôles après la mise en ligne :
   - `/health` ;
   - contrôle « après », qui doit trouver les mêmes données ;
   - état des migrations ;
   - connexions, dont un chauffeur ;
   - liens de fichiers ;
   - journaux ;
   - sauvegarde du lendemain.
7. Retour arrière en cas d'anomalie :
   - Render › Rollback vers `e739bfa` ;
   - puis Revert de la PR ;
   - si nécessaire, annulation des migrations (`migrations down`) ou restauration de la base.
