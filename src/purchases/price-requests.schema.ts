// Tables SQL brutes du circuit demande de prix → comparatif → validation (créées au démarrage, sans migration destructive).
export const PRICE_REQUEST_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS "price_requests" ("id" TEXT PRIMARY KEY, "number" TEXT NOT NULL UNIQUE, "site_id" TEXT NOT NULL, "need_request_id" TEXT, "title" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OUVERTE', "notes" TEXT, "created_by" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "chosen_supplier_id" TEXT, "validated_by" TEXT, "validated_at" TIMESTAMP(3), "validation_note" TEXT, "purchase_order_id" TEXT, "cancel_reason" TEXT)`,
  'CREATE INDEX IF NOT EXISTS "price_requests_site_idx" ON "price_requests"("site_id","status")',
  `CREATE TABLE IF NOT EXISTS "price_request_lines" ("id" TEXT PRIMARY KEY, "request_id" TEXT NOT NULL, "item_id" TEXT NOT NULL, "quantity" NUMERIC(14,3) NOT NULL, "position" INTEGER NOT NULL DEFAULT 0)`,
  'CREATE INDEX IF NOT EXISTS "price_request_lines_req_idx" ON "price_request_lines"("request_id")',
  `CREATE TABLE IF NOT EXISTS "price_quotes" ("id" TEXT PRIMARY KEY, "request_id" TEXT NOT NULL, "supplier_id" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'EN_ATTENTE', "delivery_days" INTEGER, "payment_terms" TEXT, "notes" TEXT, "received_at" TIMESTAMP(3), "received_by" TEXT, UNIQUE ("request_id","supplier_id"))`,
  `CREATE TABLE IF NOT EXISTS "price_quote_lines" ("id" TEXT PRIMARY KEY, "quote_id" TEXT NOT NULL, "request_line_id" TEXT NOT NULL, "unit_price" NUMERIC(14,2) NOT NULL, UNIQUE ("quote_id","request_line_id"))`,
];
