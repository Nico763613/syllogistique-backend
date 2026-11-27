# Espaces par profil — SYL Logistique & Transport

Source : `public/src/profils/14-espaces-par-profil.js` (assemblé en `public/profils.js`), styles en fin de `public/css/app.css`.

## Principe
- Chaque profil arrive sur **son accueil** (`prof-home`) : identité, date, bloc d'assistance (où je suis / à faire / prochaine étape), indicateurs réels, alertes, dossiers.
- Le menu latéral est remplacé, pour ces profils, par des **dossiers numérotés dépliables** ; chaque sous-dossier ouvre un **écran existant**.
- Chaque écran affiche un **fil d'Ariane** (Accueil › n. Dossier › Rubrique), un bouton **Retour** et une phrase d'aide.
- Sur téléphone, barre du bas : Accueil · Dossiers · Rapports · Profil.
- Les anciens menus restent dans la page (masqués) : aucune fonction supprimée.
- Les chiffres viennent uniquement des tableaux de bord serveur ; une donnée absente s'affiche « — ».
- Une rubrique sans écran est affichée « bientôt disponible » (jamais de faux écran).

## Profils couverts
| Profil | Rôles | Dossiers |
|---|---|---|
| Direction générale | DIRECTEUR_GENERAL, SUPER_ADMIN | 7 |
| Responsable logistique | ADMIN_LOGISTIQUE, GESTIONNAIRE_FLOTTE, LECTEUR | 8 |
| Gestionnaire de stock | MAGASINIER | 7 |
| Mécanicien | MECANICIEN | 4 |
| HSE | GESTIONNAIRE_HSE, AGENT_HSE | 4 |
| Chauffeur | CHAUFFEUR | 10 rubriques + « Prochaine action » dans l'application mobile |

Non modifiés (gardent leur espace actuel) : Responsable des opérations, Comptabilité, Commercial, Caissier, Pointeur.

## Droits
Le filtrage par rôle de chaque rubrique est un confort d'affichage. La sécurité reste assurée par le serveur (`RolesGuard`, Directeur général en lecture seule).

## Rubriques « bientôt disponibles »
Aucune depuis le 27/11/2026 (fichier `19-journal-et-fournisseurs.js`) :
- **Journal d'activité et décisions** (DG, lecture seule) : écran `journal`, données `/audit` filtrables par domaine, période et personne ; secrets masqués par le serveur, valeurs techniques traduites.
- **Répertoire fournisseurs** (gestionnaire de stock) : écran `suppliers`, ajout et modification (droits serveur déjà en place).

## Ajouter une rubrique
Dans `PROFILES`, ajouter `['Libellé', 'vue', 'aide', ['ROLE_OPTIONNEL']]`. Vue `null` = bientôt. Vues spéciales : `#stock-in`, `#stock-out`, `#history`, `#alerts`.

## Tableau de bord graphique (modèle unique)

Fichier : `public/src/profils/15-tableau-de-bord-graphique.js`.

Tous les responsables (DG, Logistique, Stock, Mécanicien, HSE, Opérations, Comptabilité, Commercial) ont le même accueil :
- un bandeau avec la photo du camion, le nom, la date et la mention « En service » ;
- 4 cartes résumé, chacune avec son bouton d'action ;
- « Mes actions rapides » ;
- « Ma performance » : un anneau en %, trois contrôles et une courbe ;
- une carte métier, un graphique en barres (la valeur la plus haute est en doré) et les notifications ;
- le bandeau des valeurs.

Les données viennent uniquement du serveur (`profDash(clé)`). Quand une donnée manque, l'écran affiche « — » ou « Pas encore de données ». Aucun chiffre n'est inventé.

Pour ajouter un profil : déclarer `PROFILES.CLE`, puis ajouter un bloc `if (key === 'CLE')` dans `profDash`.

## Caissier et pointeur

Ils ont la même maquette graphique que les autres responsables (fichier 15) : `PROFILES.CAISSE` et `PROFILES.POINTAGE`.

## Chauffeur : même design, sans graphique (fichier 16)

L'accueil du chauffeur contient, dans l'ordre :
- le bandeau (photo, nom, date, état) ;
- la prochaine action et le véhicule ;
- les gros boutons ;
- « Ma journée », en 4 étapes ;
- la fiche du jour et les autres rubriques ;
- les notifications et le bandeau des valeurs.

La fiche de bord commence par les étapes de la journée et un sommaire classé, avec le nombre de saisies par rubrique. Chaque formulaire indique ce qui vient ensuite, et un message de confirmation rappelle l'étape suivante.

## Photo de profil

Le système existant (`/auth/photo` et l'éditeur de photo) n'a pas changé.
- La photo est demandée à la première ouverture. Si la personne répond « Plus tard », elle est redemandée 3 jours après.
- Elle s'affiche dans le bandeau de l'accueil.
- Chez le responsable, elle s'affiche dans les listes du personnel et des chauffeurs : `photoUrl` est ajouté à `/staff` et `/drivers`.

## Onglets de couleur (fichier 17)

Le composant commun `syTabs(onglets, actif, fonction)` affiche les onglets. Seul l'onglet ouvert est chargé.
- **Carburant** : Camions, Véhicules de service, Consommation totale, Nouveau ravitaillement, Historique et tarif.
- **Stock** : Articles, Entrepôts, Entrées, Sorties, Inventaire, Alertes, Rapports.
- **Ressources humaines** (DG, Logistique) : Personnel et responsables, Chauffeurs, Mécaniciens, Agents HSE, Gestionnaires de stock, Pointeurs. Chaque onglet ouvre son propre écran.

## Recherche selon l'écran

`GS_SCOPES` adapte la barre de recherche à l'écran ouvert. Dans le stock, elle ne cherche que les articles et les fournisseurs. Dans le carburant, uniquement les véhicules. Dans les ressources humaines, uniquement les chauffeurs. Ailleurs, la recherche reste générale.

## Dossiers chauffeurs, personnel et archives

- **Chauffeurs** : dossiers « Chauffeurs camion », « Chauffeurs véhicule de service », « Archives ».
  - Dans chaque dossier, deux sous-dossiers : **Chauffeurs** (nom, prénom, téléphone, véhicule attribué, plaque, permis) et **Rapports** (un dossier par chauffeur : rapports journaliers, missions, km, litres, dépenses, fiche du jour complète).
- **Appareils chauffeurs** : seul endroit où l'on ajoute un chauffeur. Dossiers : Ajouter un chauffeur, Appareils actifs, Codes QR en attente, QR expirés, Bloqués, Sans appareil.
  - Ajout : nom, prénom, téléphone, puis choix du type ; les champs du permis s'ouvrent ensuite. Après l'enregistrement, bouton « Envoyer le message d'accès » (WhatsApp prêt à envoyer).
- **Personnel et responsables** : un dossier par fonction + « Ajouter » ; dans chaque dossier : Tous, Comptes actifs, Invitations en attente, Suspendus.
- **Rapports journaliers** : un seul endroit, un dossier par catégorie (Camions, Véhicules de service, Chauffeurs camion, Chauffeurs véhicule de service, HSE, Atelier, Stock, Pointage), avec télécharger / imprimer / envoyer.
- **Menus sans doublon** (DG, Responsable logistique, Stock) : chaque écran n'apparaît qu'une fois ; « écran:onglet » ouvre directement le bon onglet (ex. `stock:entrees`, `fuel:total`).
  - Archives : liste des chauffeurs et rapports d'un chauffeur sur une période, à **télécharger** (fichier tableur), **imprimer / enregistrer en PDF** ou **envoyer** (partage du téléphone ou WhatsApp).
- **Personnel de terrain** (Agents HSE, Mécaniciens, Gestionnaires de stock, Pointeurs) : deux dossiers, l'équipe et les Rapports.
- **Recherche générale** retirée de tous les écrans, remplacée par un slogan qui défile (arrêté si l'appareil demande moins d'animations).
- Serveur : `GET /driver-admin/reports/day`, `GET /driver-admin/drivers/:id/reports` et `GET /driver-admin/drivers/:id/sheet` (lecture seule, ouverts au DG ; limités au site de la personne sauf Super admin et DG).


## Un menu = un seul contenu

Chaque rubrique du menu ouvre uniquement son contenu : « Entrées » montre la nouvelle entrée, l'historique des entrées et les réceptions ; « Sorties » montre la nouvelle sortie, l'historique des sorties et le bon de sortie ; « Chauffeurs camion » ne montre que les chauffeurs camion. Les barres d'onglets qui répétaient le menu ne s'affichent plus. Les indicateurs du stock ne montrent jamais « undefined ».
