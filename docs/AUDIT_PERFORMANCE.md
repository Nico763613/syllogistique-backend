# Audit de performance — SYL Logistique

Date : 26/11/2026. Audit du code (lecture) ; le serveur complet ne peut être lancé que par la CI (le moteur Prisma est bloqué dans l'environnement de travail). Aucune mesure sur téléphone réel ni sur la production.

## Constats
| Point | Constat | Action |
|---|---|---|
| Compression des réponses | Absente : JSON, HTML et JS envoyés bruts | Ajout de `compression` (gzip). Vérifié sur un mini-serveur : réponse en gzip. La CI (tests complets + clics sur l'interface) valide que rien ne casse |
| Index base de données | 47 index déclarés pour 65 modèles | À examiner avec `EXPLAIN` sur la vraie base avant d'en ajouter |
| Pagination | 266 `findMany`, seulement 75 avec une limite `take` | Liste des routes à vérifier une par une : à faire, non fait ici |
| Cache des fichiers statiques | Géré par Express (ETag par défaut) ; images téléversées en cache d'un an | Rien à changer |
| En-têtes de sécurité | helmet actif | Conservés |

## Non fait
- Pagination des listes sans limite (risque réel quand les données grossissent, à traiter route par route avec test).
- Mesures avant/après sur serveur réel, test sur vieux téléphone, test de charge : impossibles ici.
- Redis, CDN, WebP, OpenTelemetry : non mis en place.
