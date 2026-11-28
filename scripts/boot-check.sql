-- Contrôle d'état d'une copie de base (lecture seule), utilisé par le test « Démarrage sur copie restaurée ».
-- Lignes DONNEES : empreinte du contenu existant, qui doit être identique avant et après le démarrage.
-- Lignes INFO : ce que les migrations ajoutent (peut changer).
\pset tuples_only on
\pset format unaligned
SELECT 'DONNEES users ' || count(*) || ' ' || md5(coalesce(string_agg(id || email || coalesce(password_hash,'') || coalesce(role_id::text,'') || coalesce(site_id,''), ',' ORDER BY id),'')) FROM users;
SELECT 'DONNEES vehicles ' || count(*) || ' ' || md5(coalesce(string_agg((to_jsonb(t) - '{version}'::text[])::text, ',' ORDER BY t.id),'')) FROM vehicles t;
SELECT 'DONNEES drivers ' || count(*) || ' ' || md5(coalesce(string_agg((to_jsonb(t) - '{version}'::text[])::text, ',' ORDER BY t.id),'')) FROM drivers t;
SELECT 'DONNEES trips ' || count(*) || ' ' || md5(coalesce(string_agg((to_jsonb(t) - '{version}'::text[])::text, ',' ORDER BY t.id),'')) FROM trips t;
SELECT 'DONNEES trip_logs ' || count(*) || ' ' || md5(coalesce(string_agg((to_jsonb(t) - '{site_id}'::text[])::text, ',' ORDER BY t.id),'')) FROM trip_logs t;
SELECT 'DONNEES expenses ' || count(*) || ' ' || md5(coalesce(string_agg((to_jsonb(t) - '{organization_id}'::text[])::text, ',' ORDER BY t.id),'')) FROM expenses t;
SELECT 'DONNEES payments ' || count(*) || ' ' || md5(coalesce(string_agg((to_jsonb(t))::text, ',' ORDER BY t.id),'')) FROM payments t;
SELECT 'DONNEES sites ' || count(*) || ' ' || md5(coalesce(string_agg(t.id || t.name || coalesce(t.organization_id,''), ',' ORDER BY t.id),'')) FROM sites t;
SELECT 'DONNEES roles ' || count(*) || ' ' || md5(coalesce(string_agg(t.id || t.name::text, ',' ORDER BY t.id),'')) FROM roles t;
SELECT 'DONNEES organizations ' || count(*) || ' ' || md5(coalesce(string_agg(t.id || t.name || coalesce(t.logo_url,''), ',' ORDER BY t.id),'')) FROM organizations t;
SELECT 'DONNEES driver_signups ' || count(*) || ' ' || md5(coalesce(string_agg(t.id || t.phone || t.status, ',' ORDER BY t.id),'')) FROM driver_signups t;
SELECT 'DONNEES uploaded_files ' || count(*) || ' ' || md5(coalesce(string_agg(t.name || t.size || md5(t.data), ',' ORDER BY t.name),'')) FROM uploaded_files t;
SELECT 'DONNEES audit_logs_anciens ' || count(*) FROM audit_logs WHERE created_at < now() - interval '30 minutes';
SELECT 'INFO codes_entreprise ' || coalesce(string_agg(o.name || '=' || coalesce(to_jsonb(o)->>'doc_code','(colonne absente)'), ', '), '') FROM organizations o;
SELECT 'INFO inscriptions_sans_entreprise ' || count(*) FILTER (WHERE to_jsonb(d)->>'organization_id' IS NULL) || ' sur ' || count(*) FROM driver_signups d;
SELECT 'INFO references_missions ' || coalesce(string_agg(coalesce(reference,'(vide)'), ', ' ORDER BY reference), '') FROM trips;
