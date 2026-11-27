-- Retour arrière de la migration 0004. Les numéros déjà attribués restent valides (ils sont uniques).
DROP TABLE IF EXISTS "trip_ref_counters_org";
DROP FUNCTION IF EXISTS org_doc_code(text);
DROP INDEX IF EXISTS "organizations_doc_code_key";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "doc_code";
