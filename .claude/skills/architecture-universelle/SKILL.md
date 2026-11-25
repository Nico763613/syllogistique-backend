---
name: architecture-universelle
description: Procédure universelle de création d'applications professionnelles, quel que soit le secteur : processus en 15 étapes avec portes de validation, rôles techniques (backend, base de données, API, tests, DevOps, performance, documentation, accessibilité), audit final et contrôle qualité. À utiliser dès que l'utilisateur crée, améliore, audite ou livre une application, un logiciel ou une plateforme, même sans le dire explicitement.
---

# Architecture universelle de création d'applications

## Quand l'utiliser
Pour tout projet d'application, en complément de l'agent `orchestrateur`. Ce skill fournit la méthode ; les agents fournissent l'expertise.

## Processus
Suivre les 15 étapes de `references/processus-et-audit.md` : étude du secteur, besoins, concurrents, cahier des charges, architecture, UX/UI, identité visuelle, développement, base de données et intégrations, sécurité, tests, optimisation, documentation, déploiement, audit final. Ne passer à l'étape suivante que si la porte de validation est franchie. Pour un projet léger, condenser et le dire.

## Rôles techniques
Les 17 rôles (dont backend, base de données, API, tests, DevOps, performance, documentation, accessibilité, auditeur) sont décrits dans `references/agents-techniques.md`. Lire seulement la fiche du rôle dont on a besoin.

## Visuels
Pour les logos, illustrations et photos, suivre `references/visuel-et-ressources.md` (cahier de production visuelle, formats, intégration).

## Principes constants
- Un secteur, une identité visuelle propre.
- Décisions importantes confrontées entre deux experts, puis notées dans `decisions.md`.
- Aucun « terminé » sans preuve de vérification.
- Aucun secret en clair ; confirmation avant toute action irréversible.
- Contexte d'usage par défaut : mobile d'abord, hors-ligne, appareils modestes, paiement mobile, partage par WhatsApp, exports PDF et Excel.

## Dossier de projet
```
projet-<nom>/
├── 00-brief.md · 01-etude-secteur.md · 02-cahier-des-charges.md · 03-architecture.md
├── 04-ux-ui/ · 05-code/ · 06-tests/ · 07-securite.md · 08-documentation/
├── decisions.md
└── audit-final.md
```

## Audit final
Relire le projet comme une personne extérieure avec la grille de `references/processus-et-audit.md`. Rendre un statut honnête : livrable, livrable avec réserves, non livrable.
