# Protocole de test sur vrais téléphones (Android et iPhone)

À faire **sur l'environnement de test**, jamais sur les données réelles.
Matériel conseillé : 1 Android modeste (2 à 3 Go de mémoire), 1 iPhone (Safari), 1 second Android si possible.
Noter pour chaque ligne : OK / NON OK + capture d'écran si NON OK.

## 1. Installation et premier accès
| # | Action | Résultat attendu |
|---|--------|------------------|
| 1 | Ouvrir l'adresse de test dans Chrome (Android) puis Safari (iPhone) | La page de connexion s'affiche en moins de 5 s en 4G |
| 2 | Ajouter à l'écran d'accueil (Android : menu ⋮ → « Installer » ; iPhone : Partager → « Sur l'écran d'accueil ») | L'icône SYL apparaît et s'ouvre en plein écran |
| 3 | Se connecter avec un compte créé par le menu Utilisateurs | L'écran « Changer votre mot de passe » s'impose avant toute donnée |
| 4 | Changer le mot de passe, se reconnecter | Accès normal au tableau de bord |

## 2. Mot de passe oublié
| # | Action | Résultat attendu |
|---|--------|------------------|
| 5 | Écran de connexion → « Mot de passe oublié ? » → saisir l'e-mail | Message général « Si ce compte existe… » |
| 6 | L'administrateur ouvre Utilisateurs → « Code de récupération » | Un code à 6 chiffres s'affiche, valable 15 min |
| 7 | Saisir un faux code | « Code incorrect. Essais restants : 4 » |
| 8 | Saisir le bon code + nouveau mot de passe | Mot de passe changé, connexion possible |
| 9 | Réessayer le même code | Refusé |

## 3. Hors connexion et synchronisation
| # | Action | Résultat attendu |
|---|--------|------------------|
| 10 | Passer le téléphone en mode avion, enregistrer un plein de carburant | Enregistré « en attente d'envoi » |
| 11 | Réactiver le réseau | L'opération part seule, plus rien en attente |
| 12 | Téléphone A et téléphone B (deux comptes) ouvrent le même véhicule | Même fiche visible |
| 13 | A modifie la marque et enregistre ; B (fiche non rafraîchie) modifie aussi | B reçoit un message de conflit, la valeur de A est gardée |
| 14 | Le responsable ouvre « Conflits à arbitrer » | Le conflit apparaît, il peut choisir la valeur |

## 4. Cloisonnement
| # | Action | Résultat attendu |
|---|--------|------------------|
| 15 | Un compte limité au site 1 consulte véhicules, stock, clients | Rien du site 2 n'apparaît |
| 16 | Un compte de l'entreprise B se connecte | Aucune donnée de l'entreprise A |

## 5. Confort d'usage
| # | Point à vérifier | Résultat attendu |
|---|------------------|------------------|
| 17 | Rotation de l'écran, petits écrans | Rien ne déborde, boutons lisibles et assez grands |
| 18 | Clavier ouvert sur un formulaire | Le champ actif reste visible |
| 19 | Export PDF / Excel, partage WhatsApp | Le fichier s'ouvre / se partage |
| 20 | Fermer l'application 10 min puis la rouvrir | Session conservée ou reconnexion propre |

## Rapport
Envoyer : modèle de téléphone, version d'Android ou d'iOS, numéros des lignes NON OK, captures.
