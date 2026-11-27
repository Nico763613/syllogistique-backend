-- Migration 0004 : numérotation des documents par entreprise.
-- sauvegarde: organizations
-- Chaque entreprise reçoit un code court (ex. « VTX ») inscrit dans ses numéros : FV-VTX-2026-0001.
-- Les numéros restent uniques sur toute la plateforme, mais chaque entreprise a ses propres compteurs
-- et ne voit plus, à travers ses numéros, l'activité des autres. Les numéros déjà attribués ne changent pas.
-- Rien n'est supprimé ni renommé ; seule la nouvelle colonne « doc_code » est remplie.

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "doc_code" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_doc_code_key" ON "organizations" ("doc_code");

-- Rend le code de l'entreprise ; le crée au premier appel (3 premières lettres du nom, suivies d'un chiffre en cas de doublon).
CREATE OR REPLACE FUNCTION org_doc_code(org text) RETURNS text AS $$
DECLARE c text; base text; i int := 0;
BEGIN
  SELECT "doc_code" INTO c FROM "organizations" WHERE "id" = org;
  IF c IS NOT NULL THEN RETURN c; END IF;
  SELECT upper(left(regexp_replace(translate("name", 'ÀÂÄÁÉÈÊËÍÎÏÓÔÖÚÙÛÜÇàâäáéèêëíîïóôöúùûüç', 'AAAAEEEEIIIOOOUUUUCaaaaeeeeiiiooouuuuc'), '[^A-Za-z]', '', 'g'), 3)) INTO base FROM "organizations" WHERE "id" = org;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF base IS NULL OR length(base) < 2 THEN base := 'ENT'; END IF;
  LOOP
    c := CASE WHEN i = 0 THEN base ELSE base || i::text END;
    BEGIN
      UPDATE "organizations" SET "doc_code" = c WHERE "id" = org AND "doc_code" IS NULL;
      SELECT "doc_code" INTO c FROM "organizations" WHERE "id" = org;
      RETURN c;
    EXCEPTION WHEN unique_violation THEN
      i := i + 1;
    END;
  END LOOP;
END $$ LANGUAGE plpgsql;

-- Compteurs de missions par entreprise (les missions sont numérotées par la base : TRP-VTX-2026-0001).
CREATE TABLE IF NOT EXISTS "trip_ref_counters_org" ("organization_id" TEXT NOT NULL, "year" INTEGER NOT NULL, "n" INTEGER NOT NULL DEFAULT 0, PRIMARY KEY ("organization_id", "year"));

-- Codes des entreprises existantes, dans l'ordre de création.
SELECT org_doc_code("id") FROM "organizations" ORDER BY "created_at";
