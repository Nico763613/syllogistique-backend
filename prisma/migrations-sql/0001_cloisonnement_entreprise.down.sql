-- Retour arrière de la migration 0001 : retire les colonnes de rattachement ajoutées.
-- Aucune donnée métier n'est perdue (ces colonnes ne font que rattacher les lignes) ;
-- la copie d'avant migration reste dans le schéma migration_backups.
DROP INDEX IF EXISTS "suppliers_organization_id_idx";
DROP INDEX IF EXISTS "expenses_organization_id_idx";
DROP INDEX IF EXISTS "audit_logs_organization_id_idx";
DROP INDEX IF EXISTS "problem_reports_organization_id_idx";
DROP INDEX IF EXISTS "driver_expenses_site_id_idx";
DROP INDEX IF EXISTS "driver_daily_reports_site_id_idx";
DROP INDEX IF EXISTS "trip_logs_site_id_idx";
ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "stock_categories" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "maintenance_types" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "expenses" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "hse_trainings" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "problem_reports" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "sync_queue" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "driver_devices" DROP COLUMN IF EXISTS "site_id";
ALTER TABLE "trip_logs" DROP COLUMN IF EXISTS "site_id";
ALTER TABLE "driver_maintenance_entries" DROP COLUMN IF EXISTS "site_id";
ALTER TABLE "driver_daily_reports" DROP COLUMN IF EXISTS "site_id";
ALTER TABLE "driver_expenses" DROP COLUMN IF EXISTS "site_id";
