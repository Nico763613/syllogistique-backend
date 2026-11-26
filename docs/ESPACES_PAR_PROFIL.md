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
- Historique des décisions et Journal d'activité pour le DG (l'administrateur a déjà le journal).
- Répertoire fournisseurs pour le gestionnaire de stock (géré par les Achats).

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
