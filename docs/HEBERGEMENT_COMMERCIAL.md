# Exigences d'hébergement pour la commercialisation de SYL

Ce document liste ce qui doit être en place **avant** de vendre SYL à des entreprises clientes.
Les tarifs des fournisseurs changent : ils sont à vérifier au moment de la souscription.

## 1. Serveur d'application

| Exigence | Pourquoi | État actuel |
|---|---|---|
| Offre payante **sans mise en veille** (Render « Starter » ou supérieur, ou équivalent) | L'offre gratuite s'endort après inactivité : premier chargement de 30 à 60 s, tâches planifiées (alertes de 6 h) manquées | À vérifier / à souscrire |
| Au moins 1 Go de mémoire | Génération des PDF et exports Excel | À vérifier |
| Ports d'envoi d'e-mails ouverts | L'offre gratuite de Render bloque les ports SMTP : aucun e-mail (codes de récupération, factures) | Bloquant tant que l'offre est gratuite |
| Déploiement uniquement depuis la branche principale, après tests automatiques réussis | Éviter d'envoyer en production du code non testé | En place (CI) |
| Région proche des utilisateurs (Europe de l'Ouest) | Temps de réponse depuis la Guinée | À vérifier |

## 2. Base de données (Neon PostgreSQL)

| Exigence | Pourquoi |
|---|---|
| Offre payante avec **restauration à un instant donné** (7 jours minimum, 30 jours conseillés) | Revenir à l'état d'avant une erreur ou une attaque |
| Sauvegarde externe quotidienne (export chiffré hors de Neon) | Ne pas dépendre d'un seul fournisseur — voir docs/SAUVEGARDE.md |
| Branche de copie avant chaque migration | Procédure docs/MIGRATIONS.md |
| Pas de mise en veille de la base aux heures ouvrées | Premier accès lent sinon |
| Test de restauration **réellement effectué** une fois par trimestre | Une sauvegarde jamais restaurée n'est pas une preuve |

Objectifs à annoncer aux clients (à valider) : perte de données maximale **24 h** (sauvegarde externe) et **quelques minutes** avec la restauration Neon ; remise en service en **4 h** maximum.

## 3. Envoi d'e-mails (et plus tard SMS / WhatsApp)

- Fournisseur d'envoi (Brevo ou équivalent) avec **domaine vérifié** (SPF, DKIM, DMARC) pour ne pas tomber en courrier indésirable.
- Variables : `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (jamais dans le code).
- Tant que l'envoi n'est pas disponible : **procédure administrateur** de remise du code de récupération (Utilisateurs → « Code de récupération », après vérification d'identité).
- Les chauffeurs se connectent par téléphone : un service SMS sera nécessaire pour qu'ils récupèrent leur accès sans responsable.

## 4. Nom de domaine et HTTPS

- Domaine propre (ex. `app.syl-logistique.com`) au lieu de l'adresse du fournisseur.
- HTTPS obligatoire (certificat automatique), redirection HTTP → HTTPS, en-tête HSTS.

## 5. Secrets (variables d'environnement du serveur)

| Variable | Rôle | Règle |
|---|---|---|
| `DATABASE_URL` | Accès à la base | Jamais partagé, jamais dans le code |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Signature des sessions | 32 caractères aléatoires minimum, différents entre eux |
| `RESET_CODE_SECRET` | Empreinte des codes de récupération | 32 caractères aléatoires (à défaut, la clé des sessions est utilisée) |
| `PLATFORM_ADMIN_KEY` | Création d'une entreprise cliente (accès plateforme) | 32 caractères aléatoires minimum ; sans elle, la route est désactivée |
| `SMTP_*` | Envoi d'e-mails | Clé SMTP dédiée |

Rotation : changer les clés en cas de départ d'un intervenant ou de doute (changer `JWT_*` déconnecte tout le monde).

## 6. Surveillance

- Surveillance de disponibilité externe toutes les 5 minutes sur `/health` (alerte par e-mail / SMS).
- Journaux du serveur conservés 30 jours minimum.
- Erreurs serveur remontées automatiquement (déjà en place : signalements « SYSTEM »).
- Alerte sur l'espace disque et les connexions de la base.

## 7. Multi-entreprises

- Chaque entreprise cliente est créée par l'accès plateforme (`POST /platform/organizations`, clé `PLATFORM_ADMIN_KEY`).
- Les données sont cloisonnées par entreprise et par site côté serveur (voir decisions.md).
- **Points encore ouverts avant de vendre à plusieurs entreprises sur le même serveur** :
  - numérotation des documents (factures, bons) commune à toute la plateforme : une entreprise voit des « trous » dans sa propre suite de numéros, ce qui n'est pas acceptable pour des factures ;
  - inscription publique des chauffeurs rattachée à l'entreprise principale (pas encore de code entreprise) ;
  - fichiers joints accessibles par lien secret (non devinable, mais sans contrôle d'entreprise).

## 8. Contrats et conformité

- Conditions générales et contrat de traitement des données (qui est responsable de quoi).
- Mentions sur l'hébergement hors de Guinée (lieu des serveurs) et la durée de conservation.
- Procédure écrite de réponse à incident (qui prévient le client, sous quel délai).

## 9. Coût mensuel à prévoir (ordre de grandeur, à vérifier)

Serveur sans veille + base avec restauration + envoi d'e-mails + domaine + surveillance : à chiffrer précisément sur les sites des fournisseurs avant de fixer le prix de vente.
