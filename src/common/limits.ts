// ============================================================================================
// Plafonds communs des montants et des quantités saisis (contrôle côté serveur).
//
// Les colonnes de montant sont en NUMERIC(14,2) : au-delà de 999 999 999 999,99 la base refuse
// l'enregistrement et l'utilisateur recevait une erreur 500. Les plafonds ci-dessous sont bien en
// dessous de cette limite et restent larges pour une entreprise de transport en Guinée (GNF).
// Ils peuvent être relevés ici, en un seul endroit, si un client en a besoin.
// ============================================================================================

/** Montant maximal d'une opération (paiement, facture, dépense de bureau) : 10 milliards GNF. */
export const MAX_AMOUNT_GNF = 10_000_000_000;

/** Montant maximal d'une dépense déclarée par un chauffeur sur sa fiche de bord : 100 millions GNF. */
export const MAX_DRIVER_EXPENSE_GNF = 100_000_000;

/** Prix unitaire maximal (article, ligne de commande, prix à la tonne) : 1 milliard GNF. */
export const MAX_UNIT_PRICE_GNF = 1_000_000_000;

/** Prix maximal d'un litre de carburant (colonne NUMERIC(10,2)) : 1 million GNF. */
export const MAX_FUEL_PRICE_GNF = 1_000_000;

/** Quantité maximale d'une ligne (articles, tonnes, litres de stock). */
export const MAX_QUANTITY = 1_000_000_000;

/** Litres maximum pour un plein déclaré par un chauffeur. */
export const MAX_FUEL_LITERS = 2_000;

/**
 * Écart toléré entre le prix au litre d'un plein déclaré par un chauffeur et le tarif central
 * (Paramètres). Hors de cette fourchette, la déclaration est refusée avec un message clair :
 * la fiche de bord n'accepte pas un plein de 30 L déclaré à 50 millions GNF.
 */
export const FUEL_PRICE_MIN_RATIO = 0.5;
export const FUEL_PRICE_MAX_RATIO = 2;
