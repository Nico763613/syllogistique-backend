# Guide de l'administrateur — SYL Logistique

Pour le Super administrateur de l'entreprise (et, pour la lecture, le Directeur général).
Adresse de l'application : https://syllogistique-backend.onrender.com/app

## 1. Première connexion

1. Ouvrez l'adresse ci-dessus sur téléphone ou ordinateur. Sur téléphone, « Ajouter à l'écran d'accueil » installe l'application.
2. Connectez-vous avec votre adresse e-mail ou votre numéro de téléphone et votre mot de passe.
3. Si le mot de passe est provisoire, l'application vous demande d'en choisir un nouveau avant d'afficher les données. Choisissez au moins 8 caractères, avec des lettres et des chiffres.

Sur l'offre gratuite de l'hébergeur, le premier accès après une période sans utilisation peut prendre 30 à 60 secondes : patientez, puis l'application répond normalement.

## 2. Organisation de votre espace

L'accueil est organisé en dossiers numérotés : Gestion logistique, Gestion des stocks, Ressources humaines, Comptabilité et dépenses, Rapports et statistiques, Paramètres et sécurité. Chaque écran indique où vous êtes (fil d'Ariane), un bouton Retour et une phrase d'aide.

## 3. Créer et gérer les comptes

**Ressources humaines › Responsables** (et les rubriques par métier : chauffeurs, mécaniciens, agents HSE, gestionnaires de stock, pointeurs).

- Créez le compte avec le nom, l'e-mail ou le téléphone, le profil et le site.
- Deux façons de transmettre l'accès :
  - **invitation** : un lien personnel, valable une durée limitée, que la personne ouvre pour choisir elle-même son mot de passe (recommandé) ;
  - **mot de passe provisoire** : la personne devra le changer à sa première connexion.
- Ne transmettez jamais un mot de passe par écrit dans un groupe WhatsApp : envoyez-le à la personne seule, puis vérifiez qu'elle l'a changé.
- Un compte qui quitte l'entreprise est **suspendu**, pas supprimé : son historique reste.

### Les 15 profils

| Profil | Ce qu'il fait |
|---|---|
| Super administrateur | Tout, pour son entreprise uniquement |
| Directeur général | Consulte tout, valide ; ne modifie pas les fiches |
| Responsable logistique | Flotte, missions, stock, achats, besoins |
| Gestionnaire de flotte | Véhicules, chauffeurs, carburant, entretien |
| Responsable des opérations | Validation des fiches, suivi des opérations |
| Gestionnaire de stock (magasinier) | Articles, entrées, sorties, inventaires, transferts |
| Mécanicien | Pannes, interventions, rapports d'entretien |
| Chauffeur | Uniquement l'application chauffeur |
| Pointeur | Pointage du personnel |
| Comptable | Dépenses, paiements, rapports financiers |
| Responsable commercial | Clients, devis, ventes, livraisons |
| Caissier | Caisse : ouverture, encaissements, clôture |
| Gestionnaire HSE / Agent HSE | Incidents, inspections, formations |
| Lecteur | Consultation seule |

Le détail écran par écran est dans `MATRICE_15_PROFILS.md`. Les droits sont appliqués par le serveur : un profil ne peut pas contourner une interdiction en tapant une adresse.

**Note :** en production, 11 profils sur 15 sont déjà enregistrés. Les quatre autres (Mécanicien, Pointeur, Comptable, Responsable des opérations) s'enregistrent automatiquement à la création du premier compte de ce profil.

## 4. Chauffeurs et téléphones

- **Rattachement** : un compte chauffeur doit être relié à une fiche chauffeur **du même site**. Le serveur refuse un rattachement à un autre site ou à une autre entreprise.
- **Appareils autorisés** (Paramètres et sécurité) : la première connexion d'un chauffeur sur un nouveau téléphone doit être acceptée. Après 3 essais refusés, l'appareil est bloqué. Vous pouvez libérer un appareil perdu ou changé.
- **Inscriptions par lien** : un chauffeur peut demander son inscription ; vous l'acceptez ou la refusez.

## 5. Contrôles automatiques à connaître

L'application refuse, avec un message clair :

- un montant au-delà des plafonds (10 milliards GNF par opération, 100 millions par dépense chauffeur) ou négatif ;
- un plein de carburant dont le prix au litre s'écarte trop du tarif de l'entreprise (moins de la moitié ou plus du double) : le chauffeur doit vérifier les litres et le montant ;
- un reçu dont la photo n'existe pas, ou déjà utilisé pour une autre déclaration ;
- une sortie ou un transfert de stock supérieur au stock disponible.

Pensez à tenir à jour le **prix du carburant** dans Paramètres : il sert à ce contrôle.

## 6. Signalements des utilisateurs

**Paramètres et sécurité › Signalements des utilisateurs** : chaque utilisateur peut signaler un problème depuis l'application (l'écran, l'appareil et le réseau sont joints automatiquement). Passez le signalement à « en cours », puis à « résolu » avec une note.

## 7. Mot de passe oublié

- La personne demande un code de récupération depuis l'écran de connexion (3 demandes par minute au plus).
- Si l'e-mail n'est pas disponible, vous pouvez générer un code pour elle depuis sa fiche. Le code expire, ne sert qu'une fois et se bloque après plusieurs essais faux.

## 8. Journal des actions

**Tableau de bord › Historique des décisions** : chaque création, modification, validation et annulation est enregistrée avec la personne, la date et l'ancienne et la nouvelle valeur. Les secrets (mots de passe, jetons) n'y apparaissent jamais.

## 9. Sauvegardes

Une copie chiffrée de la base est faite chaque nuit, hors de l'hébergeur de la base, et vérifiée par une restauration de contrôle. En cas d'échec, une alerte (ticket) est ouverte sur GitHub. Procédures complètes : `SAUVEGARDE.md`.

## 10. En cas de problème

| Situation | Que faire |
|---|---|
| L'application ne répond pas | Attendre 1 minute (mise en veille), puis recharger. Si le problème continue : `SAUVEGARDE.md` §6 |
| Un utilisateur ne voit pas un écran | Vérifier son profil et son site |
| Un chauffeur est bloqué sur un nouveau téléphone | Appareils autorisés › libérer ou accepter l'appareil |
| Une donnée paraît fausse | Consulter le journal des actions pour savoir qui l'a modifiée |
| Erreur après une mise à jour | Procédure de retour arrière : `DEPLOIEMENT_ET_RETOUR_ARRIERE.md` §6 |
