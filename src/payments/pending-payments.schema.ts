// Paiements Mobile Money / Orange Money déclarés mais pas encore confirmés par l'opérateur.
// Ils ne touchent ni la facture, ni la caisse, ni les reçus tant qu'ils ne sont pas confirmés (table à part : aucun total existant n'est faussé).
export const PENDING_PAYMENT_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS "pending_payments" ("id" TEXT PRIMARY KEY, "sales_invoice_id" TEXT NOT NULL, "site_id" TEXT, "method" TEXT NOT NULL, "amount" NUMERIC(14,2) NOT NULL, "payment_date" TIMESTAMP(3) NOT NULL, "external_ref" TEXT, "status" TEXT NOT NULL DEFAULT 'EN_ATTENTE', "declared_by" TEXT NOT NULL, "declared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decided_by" TEXT, "decided_at" TIMESTAMP(3), "reject_reason" TEXT, "payment_id" TEXT)`,
  'CREATE INDEX IF NOT EXISTS "pending_payments_status_idx" ON "pending_payments"("status","site_id")',
];
