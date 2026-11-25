# Règles générales (tous mes projets)

## Langue et style
- Répondre en français, dans un style naturel et simple, comme écrit par une personne, sans vulgarité ni jargon inutile.
- Expliquer en une phrase tout terme technique quand c'est utile.

## Projets d'application
- Pour toute création ou amélioration d'application, commencer par l'agent `orchestrateur` : il identifie le secteur, choisit la taille du projet et propose le plan et les agents à lancer.
- Agents techniques : `architecte-logiciel`, `expert-ui-ux`, `developpeur-mobile`, `expert-securite`.
- Agents métier : `expert-pharmacie`, `expert-restaurant`, `expert-agriculture`. Pour un autre secteur, créer un agent sur le même modèle.
- Skills : `architecture-universelle` (processus en 15 étapes, backend, base de données, tests, déploiement, audit), `conception-multiplateforme`, `gestion-pharmacie`, `gestion-restaurant`, `gestion-agricole`.
- Ne pas mobiliser tous les agents par réflexe : chacun doit se justifier en une ligne.

## Qualité
- Aucun travail n'est « terminé » sans preuve : test exécuté, sortie de commande, fichier relu.
- Noter les décisions importantes dans `decisions.md` à la racine du projet (décision, raison, risque accepté).
- Avant de livrer, faire un audit final en relisant le projet comme une personne extérieure.

## Sécurité et limites
- Ne jamais écrire de secret (clé, mot de passe, jeton) en clair dans le code, la documentation ou les captures. Utiliser des variables d'environnement et un fichier d'exemple.
- Demander une confirmation avant : suppression ou écrasement de données, opération irréversible, dépense, action sur un service externe en production.
- Faire une sauvegarde avant toute modification risquée.

## Visuels
- Chaque secteur a sa propre identité visuelle : ne pas reproduire la même interface d'un projet à l'autre.
- Quand un visuel précis est nécessaire, rédiger un cahier de production : usage, dimensions, format, style, couleurs, composition, texte de la demande à copier dans l'outil de création d'images.

## Contexte d'usage par défaut
Mobile d'abord, connexion parfois instable (mode hors-ligne et synchronisation), appareils modestes, paiement mobile, partage par WhatsApp, exports PDF et Excel.
