# Étude — Comptabilité générale et permissions configurables

Étude du 27/11/2026 (mandat global §10). **Aucun droit actuel n'a été modifié.** Rien de ce document n'est développé :
c'est une proposition à valider par le propriétaire.

## 1. Constat

### Ce qui existe déjà (comptabilité « de gestion »)
- Ventes : commandes, factures, avoirs/retours, échéances, encaissements (`SalesInvoice`, `Payment`).
- Achats : bons de commande, factures fournisseurs, règlements (`PurchaseOrder`, `PurchaseInvoice`).
- Caisse : sessions de caisse, dépenses de caisse, validation par les Opérations puis confirmation par la Comptabilité (`CashSession`, `CashExpense`).
- Dépenses terrain : dépenses chauffeurs avec reçu, circuit Logistique → Opérations → Comptabilité sans contournement (`DriverExpense`, `Expense`).
- Contrôle automatique de cohérence (`scripts/audit-comptable.js`) : totaux de factures, montants payés, doublons de références, échéances, retours.

### Ce qui manque pour une comptabilité générale
- Plan comptable (SYSCOHADA révisé, référentiel de l'espace OHADA dont la Guinée fait partie).
- Écritures en partie double (débit = crédit), journaux (ventes, achats, caisse, banque, opérations diverses).
- Grand livre, balance, comptes de tiers (clients 411, fournisseurs 401), lettrage.
- Clôture de période (mois / exercice) interdisant toute modification des écritures clôturées.
- États de synthèse (bilan, compte de résultat) et export pour l'expert-comptable.

### Permissions
- Les droits sont **écrits dans le code** : 206 déclarations `@Roles` dans 41 fichiers, 20 règles par département, environ 120
  tests de rôle directement dans les services, et les menus de l'écran sont définis par profil (`PROFILES`).
- Les tables `permissions` et `role_permissions` existent dans la base mais **ne sont pas utilisées**.
- Conséquence : changer un droit demande une nouvelle version de l'application ; une entreprise cliente ne peut pas adapter
  les droits à son organisation.

## 2. Architecture proposée — comptabilité générale (sans toucher aux écrans existants)
1. **Plan comptable par entreprise** : table `accounts` (numéro, libellé, classe, entreprise), prérempli SYSCOHADA, modifiable.
2. **Écritures générées automatiquement** à partir des opérations déjà validées (jamais saisies deux fois) :
   facture de vente validée → 411 / 70x / 443 ; encaissement → 57x ou 52x / 411 ; facture fournisseur → 60x / 401 ;
   dépense de caisse confirmée par la Comptabilité → 6xx / 57x, etc. Règles de correspondance paramétrables par entreprise.
3. **Tables** `journal_entries` + `journal_lines` (débit, crédit, compte, tiers, pièce justificative = lien vers l'opération).
   Contrôle en base : une écriture n'est enregistrée que si débit = crédit.
4. **Clôture** : table `fiscal_periods` ; une période clôturée refuse toute écriture ou modification (même par le Super administrateur) ;
   correction uniquement par écriture d'extourne, tracée dans le journal d'activité.
5. **États** : grand livre, balance, journaux, bilan et compte de résultat simplifiés ; exports Excel et PDF (contexte d'usage par défaut).
6. **Cloisonnement** : toutes les tables portent `organization_id` et passent par le filtre central existant.
7. **Mise en place par migrations numérotées additives** (0006 et suivantes), avec retour arrière, comme la livraison 195.

Estimation : **15 à 20 jours de travail** (modèle et génération des écritures 6–8 j, clôture et contrôles 3–4 j, états et exports 4–5 j,
tests 2–3 j). Validation des schémas d'écritures par un comptable connaissant le SYSCOHADA **indispensable** avant développement.

## 3. Architecture proposée — permissions configurables, sans casser les droits actuels
Principe : **les droits actuels deviennent la configuration par défaut**, et l'application garde un plancher de sécurité non modifiable.

1. **Catalogue des permissions** : chaque `@Roles` existant reçoit un code (ex. `vehicles.read`, `expenses.validate.compta`).
   Le catalogue est généré automatiquement depuis le code (même lecture que `scripts/profils15.js`).
2. **Remplissage initial** : `role_permissions` est rempli exactement avec les droits actuels, pour chaque entreprise
   (ajout de `organization_id`). Test de non-régression : la matrice des 15 profils (`profils15-matrice.md`) doit rester identique.
3. **Nouveau garde** `PermissionsGuard` : lit la configuration de l'entreprise (avec mise en cache). Pendant une période de transition,
   il fonctionne **en observation** : il compare sa décision à celle de `RolesGuard` et journalise les écarts, sans rien bloquer.
   Bascule seulement quand zéro écart est constaté.
4. **Plancher non configurable** (sécurité) : séparation des tâches du circuit des dépenses (Logistique → Opérations → Comptabilité),
   Directeur général en lecture seule hors gestion de ses responsables, chauffeurs limités à leurs propres données,
   cloisonnement entreprise / site, interdiction de créer un compte de niveau supérieur au sien. Ces règles restent dans le code.
5. **Écran d'administration** (Super administrateur de l'entreprise) : cases à cocher par profil, avec historique de chaque modification
   (qui, quand, avant / après) dans le journal d'activité, et bouton « revenir aux droits par défaut ».
6. **Menus** : l'écran masque les rubriques sans permission ; la sécurité reste assurée par le serveur.

Estimation : **8 à 12 jours** (catalogue et remplissage 2–3 j, garde + mode observation 3–4 j, écran 2–3 j, tests 1–2 j).

## 4. Ordre recommandé et risques
1. Permissions configurables d'abord (elles serviront aux droits de la comptabilité).
2. Comptabilité générale ensuite, après validation des schémas d'écritures par un comptable.
- Risque principal : une erreur de configuration qui ouvre un droit. Parade : plancher non configurable + mode observation + test des 15 profils à chaque version.
- Risque comptable : écritures fausses générées en masse. Parade : génération sur période test, contrôle débit = crédit en base, balance vérifiée par un comptable avant usage réel.
