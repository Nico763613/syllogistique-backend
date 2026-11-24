# Sauvegarde et restauration (base Neon)

## Principe
La base PostgreSQL est hébergée chez Neon (projet SYLLOGISTIQUE). Les modifications de structure faites au démarrage
(`AUTO_SCHEMA` dans `src/prisma.service.ts`) sont **additives** : `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`.
Aucune donnée n'est supprimée ou renommée par une mise en ligne.

## Avant une évolution importante de la structure
1. Créer un point de retour :
   - snapshot Neon (limite du plan atteinte au 24/11/2026 : un seul snapshot, ancien) ; ou
   - branche Neon sans calcul, par exemple `sauvegarde-avant-<sujet>-<date>`, créée depuis la branche principale.
2. Faire la mise en ligne.
3. Contrôler les logs Render et le schéma (colonnes/tables attendues).

## Restauration
- Données récentes perdues ou erronées : dans la console Neon, restaurer la branche principale à un instant précis
  (restauration dans le temps, selon la fenêtre d'historique du plan), ou à partir de la branche de sauvegarde.
- Mise en ligne défectueuse : sur Render, redéployer la version précédente (« Rollback »). Les ajouts de structure étant additifs,
  l'ancienne version du code fonctionne avec la base actuelle.
- Tester une restauration : créer une branche depuis la sauvegarde, la connecter à un environnement de test, vérifier les comptes
  et quelques enregistrements, puis supprimer la branche de test.

## Points ouverts
- Les fichiers téléversés (photos, reçus, factures) sont dans la table `uploaded_files` : ils sont couverts par la même sauvegarde.
- Libérer de la place de snapshot (ou passer à un plan supérieur) pour des snapshots réguliers.
