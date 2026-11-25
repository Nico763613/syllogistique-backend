# Processus en 15 étapes, portes de validation et audit final

Table des matières : Les 15 étapes · Version condensée pour projet léger · Grille d'audit final · Statuts de livraison

## Les 15 étapes
Pour chaque étape : agents, livrable, porte de validation. On ne passe à l'étape suivante que si la porte est franchie.

1. **Étude du secteur** — Spécialiste métier, Analyste. Livrable : `01-etude-secteur.md` (opérations, acteurs, vocabulaire, règles). Porte : les règles de gestion principales sont listées et plausibles.
2. **Besoins des utilisateurs** — Analyste, UX. Livrable : rôles, besoins, cas d'usage. Porte : chaque rôle a au moins trois besoins concrets.
3. **Concurrents et références internationales** — Analyste, Spécialiste métier. Livrable : comparatif court (fonctions, points forts, manques, prix). Porte : au moins trois références, sources citées ; si pas de recherche web, le dire.
4. **Cahier des charges** — Analyste. Livrable : `02-cahier-des-charges.md`. Porte : chaque fonction est priorisée et a un critère d'acceptation.
5. **Architecture technique** — Architecte, DevOps (avis), Sécurité (avis). Livrable : `03-architecture.md`. Porte : confrontation faite, décisions notées.
6. **Conception UX/UI** — UX, UI. Livrable : parcours, maquettes. Porte : la tâche principale de chaque rôle tient en 3 actions ou moins.
7. **Identité visuelle** — Directeur artistique. Livrable : charte et cahier de production visuelle. Porte : identité propre au secteur, contrastes vérifiés.
8. **Développement** — Frontend, Backend, Mobile selon le projet. Livrable : code dans `05-code/`. Porte : l'application démarre et le parcours principal fonctionne de bout en bout.
9. **Base de données et intégrations** — Architecte de données, API. Livrable : modèle, migrations, connecteurs. Porte : données de test chargées, services externes essayés en test.
10. **Sécurité et permissions** — Cybersécurité. Livrable : `07-securite.md`. Porte : matrice rôles/permissions testée, aucun secret en clair.
11. **Tests fonctionnels et techniques** — Qualité. Livrable : `06-tests/` avec preuves. Porte : zéro anomalie critique, chaque exigence couverte.
12. **Optimisation** — Performance, Accessibilité. Livrable : mesures avant/après. Porte : objectifs de vitesse et d'accessibilité atteints.
13. **Documentation** — Documentation. Livrable : `08-documentation/`. Porte : test du guide par une lecture « premier jour d'un nouvel utilisateur ».
14. **Déploiement** — DevOps. Livrable : application en ligne ou paquet installable, procédure de retour arrière. Porte : sauvegarde faite avant, retour arrière décrit.
15. **Audit final indépendant** — Auditeur. Livrable : `audit-final.md`. Porte : statut de livraison rendu avec preuves.

## Version condensée pour un projet léger
Regrouper : (1-4) brief et cahier des charges en une page, (5-7) choix techniques et maquette rapide, (8-9) développement, (10-11) vérification sécurité et tests, (12-14) livraison, (15) auditeur final en une page. Dire à l'utilisateur ce qui a été condensé.

## Grille d'audit final
L'auditeur répond par oui, non ou non vérifié, avec la preuve à côté.

**Fonctionnel**
- Chaque exigence prioritaire du cahier des charges est livrée et testée.
- Les règles de gestion du secteur sont appliquées (calculs, délais, droits).
- Les cas limites (champ vide, doublon, annulation, stock négatif) sont gérés.

**Sécurité**
- Chaque rôle n'accède qu'à ses données.
- Aucun secret dans le code, la documentation ou les captures.
- Mots de passe protégés, sessions limitées, entrées validées.
- Journal des actions sensibles présent.

**Données**
- Sauvegarde faite et restauration essayée.
- Pas de doublons ni de données orphelines sur le jeu de test.
- Historique des modifications disponible.

**Expérience**
- Tâche principale en 3 actions ou moins.
- Messages d'erreur clairs, états vides prévus.
- Lisible sur petit écran, texte et boutons assez grands.

**Technique**
- Pas d'erreur dans la console ni dans les journaux au démarrage.
- Performance mesurée sur connexion lente.
- Déploiement reproductible, retour arrière décrit.

**Documentation**
- Guide utilisateur par rôle, guide technique, procédure d'installation.
- Limites connues et travail restant listés honnêtement.

## Statuts de livraison
- **Livrable** : toutes les portes franchies, preuves jointes.
- **Livrable avec réserves** : défauts non bloquants listés, avec date ou plan de correction.
- **Non livrable** : au moins un défaut critique (sécurité, perte de données, fonction principale en panne). Lister les corrections et refaire l'audit.
