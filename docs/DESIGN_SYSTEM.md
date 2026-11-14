# SYL LOGISTIQUE — mini design system & checklist anti-doublons

## Principes
Une fonction = un seul endroit · une saisie alimente tous les écrans · action courante en ≤ 3 clics · ce qui est interdit à un rôle est invisible · le Directeur général est en lecture seule.

## Couleurs (variables CSS de `:root`)
| Usage | Variable |
|---|---|
| Couleur principale (en-têtes, titres, boutons) | `--navy` (+ `--navy-dark`, `--navy-soft`) |
| Accent unique (action clé) | `--gold` |
| Fond / carte / texte / texte discret / filet | `--bg` `--card` `--text` `--muted` `--line` |
| Statut OK / Attention / Problème / Info (fond) | `--ok-bg` `--warn-bg` `--bad-bg` `--info-bg` |
| Statut (texte et signal) | `--success` `--warn-fg` `--danger` `--info-fg` |

Rouge, orange et vert servent **uniquement** aux statuts. Ne jamais écrire une couleur en dur dans le CSS : utiliser la variable.

## Composants
- **Bouton** : `.btn` (principal), `.btn-ghost` (secondaire), `.drv-btn` (application chauffeur). Hauteur ≥ 48 px (`--tap`). Un seul bouton principal par écran.
- **Badge de statut** : `.badge ok | warn | bad | info`. Statuts de fiche : Brouillon · Soumis · Vérifié · Validé · Rejeté (via `stepBadge`).
- **Carte** : `.card` (bureau), `.drv-card` (mobile). Titre `h4`, lignes `.drv-row`.
- **Onglets de département** : 5 maximum (`deptBarHtml`). Menu « Rapports » unique.
- **Mobile chauffeur** : 4 gros boutons (≥ 72 px), indicateur réseau/synchronisation toujours visible.
- **Textes** : français simple, verbe à l'infinitif ou impératif court (« Envoyer ma fiche »).

## Checklist avant chaque livraison
1. `node scripts/check-ui.js` ne signale rien (menus uniques, rôles renseignés, un seul « Rapports », pas de fonction JS en double, pas de couleur en dur).
2. La fonction ajoutée n'existe pas déjà ailleurs (chercher son nom dans `NAV`, `HOME_CARDS`, `LOGI_TABS`, `REPORT_TABS`).
3. La saisie est faite à **un seul** endroit ; les autres écrans la lisent.
4. Testé avec le rôle concerné **et** avec un rôle interdit (l'élément doit être invisible, pas grisé).
5. Directeur général : aucun bouton d'écriture visible ; le serveur refuse toute écriture (403).
6. Mobile 390 px, en ligne et hors ligne ; boutons ≥ 48 px.
7. Incrément du cache `public/sw.js` ; sauvegarde Neon avant toute modification de base.
