# Sauvegarde, restauration et reprise après incident

État vérifié le 28/11/2026 à 00 h (heure de Conakry) : paramètres Neon et Render lus directement, historique des
sauvegardes lu dans le dépôt privé `Nico763613/syllogistique-sauvegardes-`.

> **Correction du rapport 195.** Le rapport intermédiaire de la livraison 195 classait la sauvegarde quotidienne chiffrée
> hors Neon comme « Non conforme, inexistante ». C'était une erreur : elle existe depuis le 07/11/2026 dans un dépôt
> séparé, que l'audit précédent n'avait pas consulté. Ses preuves sont ci-dessous.

## 1. Ce qui est sauvegardé

Toute l'application tient dans **une seule base PostgreSQL** chez Neon (projet SYLLOGISTIQUE, branche `production`) :
données de toutes les entreprises, comptes, journal d'activité **et fichiers envoyés** (photos, reçus, factures, logos :
table `uploaded_files`). Sauvegarder la base sauvegarde donc aussi les fichiers.

Le serveur Render ne garde rien d'important sur son disque (disque effacé à chaque mise en ligne). Les très anciens
fichiers enregistrés sur ce disque avant le passage au stockage en base ne sont pas couverts (voir § 8, risque R1).

## 2. Les trois niveaux de protection

| Niveau | Où | Fréquence | Conservation | Chiffrement | État |
|---|---|---|---|---|---|
| 1. Retour dans le temps Neon | Neon | Continu | 6 heures (maximum de l'offre gratuite) | AES-256 au repos (Neon) | En service |
| 2. Sauvegarde quotidienne **hors Neon** | GitHub, dépôt privé `syllogistique-sauvegardes-` | Chaque jour (programmée à 02 h 30 UTC, exécutée en pratique entre 10 h et 13 h UTC à cause de la file d'attente GitHub) | 30 jours | CMS / AES-256, clé publique ; seule la clé privée du propriétaire déchiffre | **En service et vérifiée** |
| 3. Branches de sauvegarde manuelles | Neon | Avant chaque évolution importante | Jusqu'à suppression décidée par le propriétaire | AES-256 au repos (Neon) | 5 branches de sauvegarde |

## 3. Sauvegarde quotidienne hors Neon : fonctionnement et preuves

À chaque passage, la tâche (`.github/workflows/backup.yml` du dépôt de sauvegardes) :

1. refuse de travailler si le dépôt n'est pas privé ou si le secret `DATABASE_URL` est absent ;
2. fait une copie complète de la base (`pg_dump`, format compressé) ;
3. **restaure cette copie dans une base jetable** et compare, table par table, le nombre de lignes avec la production ;
4. chiffre la copie avec la clé publique, puis efface la copie en clair ;
5. conserve le fichier chiffré 30 jours ;
6. en cas d'échec, ouvre une alerte (« issue ») dans le dépôt, visible par le propriétaire.

**Preuves relevées le 28/11/2026 :**

| Élément | Constat |
|---|---|
| Exécutions | 26 au total ; **9 réussites consécutives du 19/11 au 27/11** |
| Dernière exécution | 27/11/2026 à 11 h 08 UTC — run 45987996247 — toutes les étapes réussies |
| Restauration de contrôle (27/11) | « Tables en production : 81 / tables restaurées : 81 », « Restauration de contrôle conforme », 0 message d'avertissement |
| Taille | 461 Ko non chiffré, 463 Ko chiffré |
| Copies disponibles | 14 copies chiffrées (07/11 → 27/11), chacune conservée 30 jours |
| Clé de chiffrement | Certificat « Sauvegardes SYLLOGISTIQUE », numéro 6FB93B25…0F52, valable jusqu'en 2126 |
| Incident passé | Échecs du 10/11 au 18/11 (9 jours) : le mot de passe de la base avait été changé le 10/11 ; le secret a été mis à jour le 18/11, et tout fonctionne depuis. 10 alertes de cette période sont encore ouvertes dans le dépôt (sans conséquence) |

**Ce qui n'est pas prouvé :** le **déchiffrement** d'une copie avec la clé privée. Seul le propriétaire détient cette clé,
et c'est voulu. Le test est à faire une fois par lui (procédure § 5.3, environ 10 minutes sur un ordinateur). Tant qu'il
n'est pas fait, la sauvegarde est classée **« Conforme sous réserve »**.

## 4. Branches de sauvegarde Neon (constat du 28/11)

Branches présentes : `production`, `simulation`, `sauvegarde-avant-195-2026-11-27`, `test-restauration-2026-11-27`,
`recette-anonymisee-2026-11-27`, `test-migrations-2026-11-27`, `sauvegarde-avant-circuits-2026-11-24`,
`sauvegarde-2026-11-18`, `backup-avant-facturation-transport`, `backup-avant-ventes`.

**10 branches sur 10 autorisées : il ne reste plus aucune place.** Une nouvelle branche de sauvegarde Neon avant la mise
en production n'est donc possible qu'après la suppression d'une branche de test, **décision du propriétaire**. Sans cette
suppression, la sauvegarde avant mise en production se fera par le niveau 2 (lancement manuel de la sauvegarde
quotidienne) et par le niveau 1 (retour dans le temps de 6 heures). C'est suffisant pour un retour arrière.

Branches que je propose de supprimer, avec votre accord : `test-migrations-2026-11-27`, `test-restauration-2026-11-27`,
`recette-anonymisee-2026-11-27` (copies de travail de la recette, sans valeur de sauvegarde).

## 5. Procédures

### 5.1 Sauvegarde manuelle avant une intervention (à faire juste avant chaque mise en production)
1. GitHub → dépôt `syllogistique-sauvegardes-` → onglet **Actions** → « Sauvegarde quotidienne SYLLOGISTIQUE »
   → **Run workflow**. Attendre la coche verte (3 à 5 minutes) et noter le numéro de l'exécution.
2. Noter l'heure exacte (heure de Conakry = UTC) : c'est le point de retour pour le retour dans le temps Neon.
3. Si une place est libre : Neon → branche `production` → **Create branch** nommée `sauvegarde-avant-<sujet>-<date>`.

### 5.2 Restaurer une erreur de moins de 6 heures (retour dans le temps Neon)
Opération qui efface les saisies faites après l'instant choisi : **accord du propriétaire obligatoire**.
1. Neon → projet SYLLOGISTIQUE → branche `production` → **Restore** → choisir la date et l'heure.
2. Neon garde automatiquement une copie de l'état précédent (branche « backup ») : rien n'est perdu définitivement.
3. Vérifier : ouvrir `https://syllogistique-backend.onrender.com/health`, se connecter, contrôler la dernière saisie.

### 5.3 Restaurer une copie quotidienne (erreur ancienne, perte du compte Neon, test annuel)
Sur un ordinateur avec PostgreSQL 18 et OpenSSL :
1. GitHub → dépôt `syllogistique-sauvegardes-` → Actions → choisir l'exécution du jour voulu → télécharger l'artefact
   `syllo-db-AAAAMMJJ-HHMM` (fichier ZIP) et le décompresser.
2. Déchiffrer avec la clé privée (fichier gardé hors de GitHub) :
   `openssl cms -decrypt -inform DER -in syllo-AAAAMMJJ-HHMM.dump.cms -inkey cle-privee.pem -out base.dump`
3. Restaurer dans une base **vide** (jamais directement dans la production) :
   `pg_restore --no-owner --no-privileges --dbname "<adresse de la base cible>" base.dump`
4. Comparer le nombre de lignes avec le fichier `syllo-AAAAMMJJ-HHMM.counts.tsv` fourni dans l'artefact.
5. Pour remettre en service : pointer `DATABASE_URL` du service Render vers cette base (accord du propriétaire).
6. Effacer `base.dump` après usage (il contient les données en clair).

**Test de déchiffrement conseillé :** faire les étapes 1 à 4 une fois, sur une base locale, et noter le résultat.

### 5.4 Mise en ligne défectueuse
Voir `docs/DEPLOIEMENT_ET_RETOUR_ARRIERE.md` (retour à la version précédente sur Render, puis annulation des
migrations si nécessaire).

## 6. Plan de reprise après incident

| Incident | Effet | Action | Délai visé | Perte de données maximale |
|---|---|---|---|---|
| Mise en ligne défectueuse | Application en erreur | Retour arrière Render (§ 5.4) | 15 min | Aucune |
| Erreur de saisie grave ou suppression, découverte vite | Données fausses | Retour dans le temps Neon (§ 5.2) | 30 min | Saisies postérieures à l'instant choisi |
| Même chose, découverte après 6 h | Données fausses | Copie quotidienne (§ 5.3) dans une base séparée, puis reprise ciblée des lignes | 2 à 4 h | Jusqu'à 24 h sur les lignes reprises |
| Panne Render | Application indisponible | Attendre ou redéployer ; les téléphones chauffeurs continuent hors ligne et renvoient à la reprise | Selon Render | Aucune (file d'attente sur le téléphone) |
| Panne ou perte du compte Neon | Base indisponible | Nouvelle base PostgreSQL + copie quotidienne (§ 5.3) + nouvelle `DATABASE_URL` sur Render | 2 à 4 h | Jusqu'à 24 h |
| Fuite du mot de passe de la base | Risque d'accès | Changer le mot de passe dans Neon, puis `DATABASE_URL` sur Render **et** le secret du dépôt de sauvegardes | 30 min | Aucune |
| Perte de la clé privée de sauvegarde | Copies chiffrées illisibles | Générer une nouvelle paire de clés, remplacer la clé publique du dépôt | 30 min | Les 30 jours de copies passées deviennent inutilisables |

Contacts et accès nécessaires : compte Neon, compte Render, compte GitHub `Nico763613`, clé privée de sauvegarde.
Tous sont détenus par le propriétaire.

## 7. Chiffrement et sécurité des sauvegardes
- **Au repos chez Neon** : AES-256. **En transit** : TLS obligatoire (`sslmode=require`).
- **Copies quotidiennes** : chiffrées avant d'être stockées (CMS AES-256). GitHub ne voit jamais les données en clair.
- **Dépôt de sauvegardes** : privé ; la tâche s'arrête d'elle-même s'il devenait public.
- **Secret `DATABASE_URL`** du dépôt de sauvegardes : à mettre à jour à **chaque** changement du mot de passe de la base
  (c'est l'oubli de cette étape qui a causé l'interruption du 10 au 18/11).

## 8. Risques résiduels
- **R1** — Fichiers très anciens restés sur le disque Render (avant le stockage en base) : non sauvegardés et perdus à la
  prochaine mise en ligne. Le 27/11, la production ne contenait que 4 fichiers, tous en base : risque faible.
- **R2** — Déchiffrement jamais testé par le propriétaire (§ 3).
- **R3** — L'heure réelle de la sauvegarde dépend de la file d'attente de GitHub (constaté : entre 10 h et 13 h UTC).
- **R4** — Aucune place libre pour une nouvelle branche Neon (§ 4).
- **R5** — L'offre gratuite de Neon limite le retour dans le temps à 6 heures ; l'offre payante l'étend à 7 jours.
