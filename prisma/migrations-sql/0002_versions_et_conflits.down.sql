-- Retour arrière de la migration 0002 : retire les numéros de version, l'historique et les conflits.
-- Attention : les conflits non arbitrés sont perdus (copie conservée ci-dessous avant suppression).
CREATE TABLE IF NOT EXISTS "migration_backups"."v0002_sync_conflicts_avant_retour" AS TABLE "sync_conflicts";
DROP TABLE IF EXISTS "sync_conflicts";
DROP TABLE IF EXISTS "record_versions";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "version";
ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "version";
ALTER TABLE "drivers" DROP COLUMN IF EXISTS "version";
ALTER TABLE "stock_items" DROP COLUMN IF EXISTS "version";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "version";
ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "version";
ALTER TABLE "driver_daily_reports" DROP COLUMN IF EXISTS "version";
ALTER TABLE "driver_expenses" DROP COLUMN IF EXISTS "version";
ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "version";
ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "version";
ALTER TABLE "need_requests" DROP COLUMN IF EXISTS "version";
