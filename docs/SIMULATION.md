# Environnement de simulation (test)

Copie isolée de l'application : mêmes fonctionnalités, **base de données séparée** (branche Neon `simulation`) et service Render séparé (`syllogistique-simulation`). Rien de ce qui s'y passe ne touche la production.

- Adresse : https://syllogistique-simulation.onrender.com (bandeau « MODE SIMULATION » affiché en haut)
- Activé par la variable `SIMULATION_MODE=true` (uniquement sur le service de simulation). En production, l'écran et la route `/simulation/setup` sont refusés.
- Comptes de test (préfixe « [TEST] ») : Directeur Général, Responsable logistique, Chauffeur, Gestionnaire de stock. Le rôle PDG est joué par le compte administrateur principal.
- Invitations : liens individuels, 72 h, à usage unique ; aucun mot de passe n'est transmis.

## Remise à zéro complète
Rétablir la branche Neon `simulation` depuis `production` (« Reset from parent » dans la console Neon) : toutes les données de test sont remplacées par une copie propre de la production. Puis rouvrir Simulation > « Préparer les comptes de test ».
