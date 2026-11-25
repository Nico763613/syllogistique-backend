# Exigence visuelle et ressources graphiques

Table des matières : Principes · Identité par secteur · Cahier de production visuelle · Formats standards · Intégration des visuels reçus

## Principes
- Un secteur, une identité : palette, typographie, icônes et ton propres au métier. Ne pas reprendre la même interface d'un projet à l'autre.
- Navigation intuitive, un tableau de bord adapté à chaque rôle, des composants cohérents (boutons, formulaires, tableaux, cartes).
- Contrastes lisibles en plein soleil, boutons assez grands, textes courts.
- Prévoir dès le départ où iront les logos, photos et illustrations, pour que les visuels reçus s'intègrent sans refaire l'interface.

## Idées d'identité par secteur (points de départ à adapter)
- Agriculture, élevage : tons naturels, textures simples, icônes de cultures et d'animaux, grands boutons pour l'usage au champ.
- Pharmacie, hôpital : propre et rassurant, blanc et vert ou bleu, lisibilité maximale, alertes bien visibles.
- Commerce, restauration : dynamique, couleurs chaudes, caisse rapide, grandes zones tactiles.
- Transport, logistique, industrie : sobre et robuste, tableaux de bord denses, alertes d'échéance bien visibles.
- Banque, assurance : sérieux, sobre, accent sur la confiance et la clarté des chiffres.
- École, ONG : accueillant, couleurs vives mais maîtrisées, lisibilité pour tous publics.

## Cahier de production visuelle (modèle)
Un cahier par visuel à faire créer, avec ces champs :

```
Visuel n° : 
Nom du fichier :
Usage et emplacement dans l'application (écran, position) :
Dimensions en pixels et ratio :
Format (PNG transparent, JPG, SVG) :
Style (illustration plate, photo réaliste, icône ligne…) :
Couleurs (codes hexadécimaux de la charte) :
Composition (sujet, cadrage, éléments à inclure, éléments à éviter) :
Texte éventuel dans l'image (exact, avec la langue) :
Texte de la demande à copier dans l'outil de création d'images :
Contraintes (fond transparent, zone vide pour du texte, lisible en petit) :
```

Rédiger la demande prête à copier pour l'outil de création d'images (ChatGPT ou autre). Elle doit être précise et complète pour limiter les allers-retours.

## Formats standards
- Logo : SVG si possible, sinon PNG transparent 1024 px de large minimum.
- Icône d'application : 1024 × 1024 px, sans coins arrondis (les boutiques les arrondissent).
- Écran de démarrage : 1242 × 2688 px, élément central dans la zone sûre.
- Bannière de partage (réseaux, WhatsApp) : 1200 × 630 px.
- Photos d'interface : largeur 1600 px maximum, compressées (moins de 300 Ko si possible).
- Favicon : 512 × 512 px.

## Intégration des visuels reçus
1. Vérifier le format, les dimensions et la transparence.
2. Les renommer selon le cahier (`logo-principal.svg`, `hero-accueil.jpg`).
3. Les compresser, les placer dans le dossier d'images du projet.
4. Les brancher aux emplacements prévus et contrôler le rendu sur petit écran.
5. Noter l'origine et les droits d'usage de chaque visuel dans la documentation.
