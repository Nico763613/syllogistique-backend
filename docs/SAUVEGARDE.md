# Sauvegarde et restauration (base Neon)

État vérifié le 27/11/2026 (paramètres du projet Neon SYLLOGISTIQUE lus directement, documentation Neon consultée le même jour).

## 1. Ce qui est sauvegardé
Toute l'application tient dans **une seule base PostgreSQL** chez Neon (projet SYLLOGISTIQUE, région AWS us-east-2) :
données de toutes les entreprises, comptes, journal d'activité **et fichiers envoyés** (photos, reçus, factures, logos :
table `uploaded_files`). Sauvegarder la base sauvegarde donc aussi les fichiers. Le serveur Render ne garde rien d'important
sur son disque (disque effacé à chaque mise en ligne).

## 2. État réel des sauvegardes (constaté)
| Élément | Valeur constatée | Conséquence |
|---|---|---|
| Offre Neon | Gratuite (free) | Limites ci-dessous |
| Retour dans le temps (« instant restore ») | **6 heures** (`history_retention_seconds = 21600`), maximum de l'offre gratuite | On peut revenir à n'importe quelle seconde des 6 dernières heures, pas au-delà |
| Sauvegardes automatiques planifiées | **Aucune** (non disponibles en offre gratuite) | Pas de sauvegarde quotidienne automatique |
| Snapshot manuel | 1 (12/11/2026), limite de l'offre atteinte | Aucun nouveau snapshot possible sans supprimer l'ancien |
| Branches de sauvegarde (copies complètes) | 14/11 (×2), 18/11, 24/11, 27/11 (avant livraison 195) | Points de retour manuels, conservés tant qu'on ne les supprime pas |
| Branches au total | 9 sur 10 autorisées | **Il ne reste qu'une place** : une suppression (avec accord) sera nécessaire avant la prochaine sauvegarde |
| Sauvegarde quotidienne chiffrée hors de Neon | **Inexistante** (aucune tâche dans ce dépôt) | Exigence non remplie (voir §5) |

## 3. Chiffrement
- **Au repos** : Neon chiffre les données stockées en AES-256 (disques NVMe), y compris les branches de sauvegarde.
- **En transit** : toutes les connexions à Neon sont chiffrées (TLS obligatoire) ; le serveur de l'application exige `sslmode=require`.
- **Fichiers** : stockés dans la base, donc couverts par le même chiffrement ; depuis la livraison 195, ils ne sont lisibles
  que par lien signé et temporaire.
- Limite : les clés de chiffrement sont gérées par Neon (pas de clé propre à SYL).

## 4. Fréquence et conservation actuelles
- **Continu, 6 heures** : retour possible à la seconde près pendant 6 heures.
- **Manuel, avant chaque évolution** : une branche `sauvegarde-avant-<sujet>-<date>` est créée depuis la production
  (procédure obligatoire, voir docs/MIGRATIONS.md). Conservée jusqu'à décision explicite du propriétaire.
- Aucune autre fréquence n'existe aujourd'hui : **une erreur découverte plus de 6 heures après coup ne peut être réparée
  qu'à partir de la dernière branche de sauvegarde manuelle**.

## 5. Ce qu'il faut pour une sauvegarde quotidienne chiffrée (proposition, non mise en place)
Deux voies, à décider par le propriétaire (coût) :
1. **Offre Neon payante (Launch)** : retour dans le temps jusqu'à 7 jours et snapshots planifiés (quotidiens, conservés jusqu'à
   35 jours). Coût variable selon l'usage.
2. **Export quotidien hors de Neon** (gratuit ou presque) : une tâche planifiée (GitHub Actions) fait chaque nuit un `pg_dump`,
   le chiffre (clé connue du seul propriétaire), le conserve 30 jours dans un stockage séparé, et vérifie chaque semaine qu'il se
   restaure. Nécessite un accès lecture seule à la production confié à GitHub : **accord écrit du propriétaire requis**.
Recommandation : la voie 2 en priorité (copie hors de Neon, protège aussi contre une perte du compte Neon), puis la voie 1 à
la mise en service commerciale.

## 6. Procédure avant une évolution de structure
1. Créer une branche `sauvegarde-avant-<sujet>-<date>` depuis la production (copie instantanée, sans coupure).
2. Relever l'empreinte des données (`scripts/boot-check.sql`) sur la production et sur la copie : elles doivent être identiques.
3. Appliquer l'évolution sur une copie de test, contrôler, puis seulement mettre en ligne (avec accord).
4. Après la mise en ligne : journaux Render, état des migrations, empreinte des données existantes inchangée.

## 7. Restauration
- **Erreur de moins de 6 heures** : restauration de la branche principale à l'instant voulu (console Neon). Opération
  destructive pour les saisies postérieures : **accord du propriétaire requis**.
- **Erreur plus ancienne** : à partir de la dernière branche de sauvegarde (même accord requis).
- **Mise en ligne défectueuse** : sur Render, « Rollback » vers la version précédente. Les migrations étant additives et
  disposant d'un retour arrière (`node dist/migrations/cli.js down NNNN`), l'ancienne version fonctionne avec la base.

## 8. Restauration testée
- 27/11/2026 : branche `sauvegarde-avant-195-2026-11-27` → copie `test-restauration-2026-11-27`. Nombre de lignes et empreinte
  du contenu identiques sur les 81 tables (empreinte globale identique à la production), 4 fichiers identiques (taille et empreinte).
- Démarrage de l'application sur la copie restaurée : **non encore fait** (l'environnement de recette ne peut pas joindre Neon ;
  à faire sur le serveur de test Render ou avec un accès accordé par le propriétaire). Une copie anonymisée
  (`recette-anonymisee-2026-11-27`) est prête pour ce test.
