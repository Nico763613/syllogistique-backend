-- Retour arrière de la migration 0003 : retire les tables de codes de réinitialisation.
-- Les codes en cours deviennent inutilisables (la procédure administrateur reste disponible).
DROP TABLE IF EXISTS "password_reset_requests";
DROP TABLE IF EXISTS "password_reset_codes";
