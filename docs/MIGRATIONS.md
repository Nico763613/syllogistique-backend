# Migrations de la base de données

## Principe

Chaque évolution de la base est un fichier numéroté, appliqué une seule fois, dans l'ordre :

```
prisma/migrations-sql/
  0001_cloisonnement_entreprise.up.sql     ← application
  0001_cloisonnement_entreprise.down.sql   ← retour arrière (quand il est possible)
  0002_versions_et_conflits.up.sql
  0002_versions_et_conflits.down.sql
  0003_codes_reinitialisation.up.sql
  0003_codes_reinitialisation.down.sql
```

Au démarrage, le serveur applique automatiquement les migrations en attente (`src/migrations/migration-runner.ts`) :

1. **Verrou** : une seule instance applique les migrations à la fois (verrou PostgreSQL).
2. **Sauvegarde préalable** : les tables citées dans l'en-tête `-- sauvegarde: table1, table2` sont copiées dans le schéma `migration_backups` (nommées `vNNNN_table`).
3. **Transaction** : toute la migration réussit ou rien n'est appliqué.
4. **Historique** : table `schema_migrations` (numéro, nom, empreinte du fichier, date, durée, auteur) et journal `schema_migrations_log` (applications, retours arrière, échecs).
5. **Contrôle** : si un fichier déjà appliqué est modifié, un avertissement est écrit dans le journal (on ne modifie jamais une migration déjà appliquée : on en crée une nouvelle).
6. **Échec** : le serveur ne démarre pas, la base reste dans l'état précédent.

## Commandes

```
node dist/migrations/cli.js status          # état de chaque migration
node dist/migrations/cli.js up              # applique les migrations en attente
node dist/migrations/cli.js down 0003       # annule la dernière migration (si un .down.sql existe)
```

Seule la **dernière** migration appliquée peut être annulée ; pour remonter plus loin, on annule une par une.
Le retour arrière est aussi testé automatiquement en intégration continue (annulation de 0003 puis réapplication).

## Procédure en production (obligatoire)

1. Créer une **branche de sauvegarde Neon** de la base de production (copie instantanée, sans coupure).
2. Appliquer les migrations sur une **copie de test** de la production et vérifier (`status`, tests).
3. Présenter les preuves au propriétaire, puis seulement déployer.
4. Après déploiement : vérifier `status`, les journaux du serveur et l'écran de santé.
5. En cas de problème : `down` sur la dernière migration, ou restauration de la branche Neon.

## Limites connues

- Un retour arrière qui supprime une colonne supprime aussi les données saisies depuis dans cette colonne (une copie est faite avant quand c'est prévu dans le fichier `.down.sql`).
- `prisma db push` (AUTO_SCHEMA) reste utilisé pour le schéma de base ; les migrations numérotées couvrent les évolutions à partir de 0001. À terme, tout devra passer par des migrations numérotées.
