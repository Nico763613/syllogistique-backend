# Modules de SYL Logistique — état final et couverture des tests

Date : 28/11/2026. Version candidate : branche `fix/plateforme-multi-entreprises` (PR #195).

Ce document liste les 39 modules du serveur, ce que fait chacun, le nombre de routes (adresses de l'API) et le test automatique qui le vérifie. Une « route » est une adresse que l'application appelle, par exemple `POST /transfers` pour créer un transfert.

Statuts utilisés (ceux du mandat de clôture) :

- **Conforme et vérifié** : la fonction existe et un test automatique sur une vraie base PostgreSQL la vérifie en CI.
- **Conforme sous réserve** : la fonction existe et est testée, mais une partie ne peut pas être vérifiée ici (service externe, appareil réel…).
- **Non testé** : la fonction existe mais aucun test ne la vérifie.

Toutes les routes passent par les mêmes protections communes, décrites dans `DOCUMENTATION_TECHNIQUE.md` : connexion obligatoire (sauf routes publiques listées), contrôle du profil côté serveur, cloisonnement automatique par entreprise et par site, validation des données reçues, plafonds des montants.

## 1. Tableau des modules

| Module | Rôle | Routes | Tests automatiques | Statut |
|---|---|---|---|---|
| auth | Connexion, déconnexion, jetons, changement et récupération du mot de passe, appareils de l'utilisateur | 13 | functional, functional5, functional6, profils15 | Conforme et vérifié |
| users | Comptes, profils, invitations, désactivation | 9 | functional2, functional3, functional4, functional5 | Conforme et vérifié |
| sites | Sites (dépôts) de l'entreprise | 4 | functional5, functional6 | Conforme et vérifié |
| settings | Paramètres de l'entreprise (prix du carburant, etc.) | 7 | functional6 | Conforme et vérifié |
| platform | Création d'une nouvelle entreprise (accès plateforme par clé) | 1 | functional6 | Conforme et vérifié |
| branding | Logo et nom affichés | 2 | ui-click (affichage) | Conforme sous réserve (pas de test d'envoi de logo) |
| license | État et activation de la licence | 2 | functional7 (état) | Conforme sous réserve (activation : serveur de licences externe non joignable en CI) |
| vehicles (+ downtimes) | Véhicules, immobilisations et pannes | 15 | functional, functional4 | Conforme et vérifié |
| drivers | Fiches chauffeurs | 7 | functional4, functional6 | Conforme et vérifié |
| driver (+ pointer, driver-admin) | Application chauffeur : missions, carburant, dépenses, entretien, pointage, appareils, administration des appareils | 43 | functional4, functional6, ui-livraison | Conforme et vérifié |
| signup (driver-signup) | Inscription d'un chauffeur par lien | 5 | functional6 | Conforme et vérifié |
| trips | Missions et voyages | 7 | functional, functional4 | Conforme et vérifié |
| fuel | Pleins de carburant | 4 | functional, functional4 | Conforme et vérifié |
| maintenance (+ plans) | Entretien, réparations, plans d'entretien | 10 | functional, functional4 | Conforme et vérifié |
| inventory (+ counts) | Articles, mouvements de stock, inventaires, valorisation | 20 | functional, functional2, functional5 | Conforme et vérifié |
| transfers | Transferts de stock entre sites | 5 | functional7 | Conforme et vérifié (dès que la CI de functional7 est verte) |
| suppliers | Fournisseurs | 4 | functional2 | Conforme et vérifié |
| purchases (+ price-requests) | Demandes de prix, bons de commande, réceptions, factures d'achat | 20 | functional2, functional4 | Conforme et vérifié |
| needs | Expressions de besoins et validation | 9 | functional3, functional4 | Conforme et vérifié |
| customers | Clients | 5 | functional, ui-roles | Conforme et vérifié |
| sales (+ transport) | Ventes, devis, livraisons, retours, facturation du transport | 29 | functional, functional2, functional5, ui-livraison | Conforme et vérifié |
| payments | Encaissements et décaissements | 6 | functional2, functional4 | Conforme et vérifié |
| cash (cash-sessions) | Caisse : ouverture, mouvements, clôture | 9 | functional2, functional5 | Conforme et vérifié |
| expenses | Dépenses du bureau | 3 | functional4 | Conforme et vérifié |
| documents | Documents des véhicules et échéances | 5 | functional2 | Conforme et vérifié |
| uploads | Envoi de fichiers et liens signés temporaires | 2 | functional4, functional5 | Conforme et vérifié |
| hse | Incidents, inspections, formations HSE | 14 | functional3, functional4 | Conforme et vérifié |
| staff | Pointage du personnel, rapports d'activité | 13 | functional3 | Conforme et vérifié |
| notifications | Alertes dans l'application | 6 | functional3, functional5 | Conforme et vérifié |
| audit | Journal des actions | 1 | functional2, functional4 | Conforme et vérifié |
| sync | Synchronisation hors-ligne | 6 | functional6 | Conforme et vérifié |
| dashboards | Tableaux de bord par métier | 8 | functional7, profils15 | Conforme et vérifié |
| reports | Rapports du jour, de période, missions, exports PDF/Excel, lien WhatsApp | 12 | functional7, profils15 | Conforme sous réserve (envoi par e-mail non testé : pas de service d'e-mail en CI) |
| search | Recherche globale | 1 | functional7 | Conforme et vérifié |
| qrcodes | QR codes des véhicules et articles | 1 | functional7 | Conforme et vérifié |
| support | Signalements de problèmes par les utilisateurs | 3 | functional7 | Conforme et vérifié |
| messaging | E-mail de test de l'administrateur | 1 | functional7 (refus) | Conforme sous réserve (envoi réel non testé : pas de service d'e-mail) |
| simulation | Comptes de test de l'environnement de simulation | 1 | functional7 (refus hors simulation) | Conforme sous réserve (activé seulement en environnement de simulation) |
| health | État du serveur | 1 | tous (démarrage) | Conforme et vérifié |

## 2. Routes accessibles sans connexion

Uniquement : `GET /health`, `GET /branding` (logo et nom), `POST /auth/login`, `POST /auth/refresh`, la récupération du mot de passe par code (`/auth/password-reset/request` et `/confirm`), l'acceptation d'une invitation (`/auth/invite/info` et `/accept`), `GET /license/status`, `POST /license/activate` (10 essais par minute, réponse vérifiée par signature du serveur de licences), l'inscription chauffeur (`POST /driver-signup`) et `GET /uploads/:nom`, qui exige un lien signé encore valide. Toutes les autres routes répondent 401 sans connexion.

## 3. Compte Chauffeur

Depuis le 28/11/2026, un compte Chauffeur n'accède qu'à l'application chauffeur (`/driver`, `/auth`, `/uploads`, `/notifications`, `/support`, logo, licence, état du serveur) et à la déclaration d'incident HSE. Tout le reste répond 403. Vérifié par functional4 et profils15.

## 4. Limites connues

- Les envois par e-mail (rapports, e-mail de test) ne sont pas testés : aucun service d'e-mail n'est configuré (offre gratuite de Render : ports d'envoi fermés).
- Les tests d'interface couvrent les parcours principaux (clics, rôles, livraison) sur Chrome sans écran ; ils ne remplacent pas un essai sur téléphone réel (voir `PROTOCOLE_TEST_TELEPHONES.md`).
