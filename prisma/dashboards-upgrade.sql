-- Mise à niveau idempotente du schéma pour les tableaux de bord par département.
-- Lue au démarrage par PrismaService (une instruction par bloc, blocs séparés par une ligne « --# »).
-- Sans effet si tout existe déjà (IF NOT EXISTS). À garder en phase avec prisma/schema.prisma.
--#
ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'RESPONSABLE_COMMERCIAL';
--#
ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'CAISSIER';
--#
ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'GESTIONNAIRE_HSE';
--#
ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'AGENT_HSE';
--#
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'ORANGE_MONEY';
--#
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'RETURN';
--#
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contractual_lead_days integer, ADD COLUMN IF NOT EXISTS payment_term_days integer;
--#
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS freight_cost numeric(14,0) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS approved_by text, ADD COLUMN IF NOT EXISTS approved_at timestamp(3), ADD COLUMN IF NOT EXISTS vehicle_id text REFERENCES vehicles(id), ADD COLUMN IF NOT EXISTS category text;
--#
CREATE TABLE IF NOT EXISTS goods_receipts (id text PRIMARY KEY, site_id text NOT NULL REFERENCES sites(id), purchase_order_id text NOT NULL REFERENCES purchase_orders(id), reference text, received_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, delivery_note_no text, freight_cost numeric(14,0) NOT NULL DEFAULT 0, notes text, created_by text, created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
--#
CREATE TABLE IF NOT EXISTS stock_locations (id text PRIMARY KEY, site_id text NOT NULL REFERENCES sites(id), code text NOT NULL, name text NOT NULL, zone text, is_active boolean NOT NULL DEFAULT true, UNIQUE (site_id, code));
--#
CREATE TABLE IF NOT EXISTS stock_transfers (id text PRIMARY KEY, reference text, from_site_id text NOT NULL REFERENCES sites(id), to_site_id text NOT NULL REFERENCES sites(id), from_location_id text, to_location_id text, status text NOT NULL DEFAULT 'IN_TRANSIT', shipped_at timestamp(3), received_at timestamp(3), created_by text, received_by text, created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
--#
CREATE TABLE IF NOT EXISTS stock_transfer_lines (id text PRIMARY KEY, transfer_id text NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE, item_id text NOT NULL REFERENCES stock_items(id), lot_id text, quantity numeric(14,3) NOT NULL);
--#
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS location_id text REFERENCES stock_locations(id), ADD COLUMN IF NOT EXISTS valuation_method text NOT NULL DEFAULT 'FIFO', ADD COLUMN IF NOT EXISTS reorder_point numeric(14,3), ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2), ADD COLUMN IF NOT EXISTS sale_price numeric(14,2), ADD COLUMN IF NOT EXISTS has_expiry boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS is_hazardous boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS sds_url text, ADD COLUMN IF NOT EXISTS deleted_at timestamp(3);
--#
CREATE TABLE IF NOT EXISTS stock_lots (id text PRIMARY KEY, item_id text NOT NULL REFERENCES stock_items(id), site_id text NOT NULL REFERENCES sites(id), location_id text REFERENCES stock_locations(id), lot_number text NOT NULL, received_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, expiry_date timestamp(3), quantity numeric(14,3) NOT NULL DEFAULT 0, unit_cost numeric(14,2) NOT NULL DEFAULT 0, created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
--#
CREATE TABLE IF NOT EXISTS goods_receipt_lines (id text PRIMARY KEY, goods_receipt_id text NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE, purchase_order_line_id text REFERENCES purchase_order_lines(id), item_id text NOT NULL REFERENCES stock_items(id), quantity_received numeric(14,3) NOT NULL, quantity_accepted numeric(14,3) NOT NULL, quantity_rejected numeric(14,3) NOT NULL DEFAULT 0, reject_reason text, lot_id text REFERENCES stock_lots(id));
--#
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS lot_id text REFERENCES stock_lots(id), ADD COLUMN IF NOT EXISTS from_location_id text REFERENCES stock_locations(id), ADD COLUMN IF NOT EXISTS to_location_id text REFERENCES stock_locations(id), ADD COLUMN IF NOT EXISTS transfer_id text REFERENCES stock_transfers(id), ADD COLUMN IF NOT EXISTS reason_code text, ADD COLUMN IF NOT EXISTS approved_by text, ADD COLUMN IF NOT EXISTS client_op_id text;
--#
ALTER TABLE inventory_count_lines ADD COLUMN IF NOT EXISTS unit_cost numeric(14,2);
--#
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS tax_percent numeric(5,2) NOT NULL DEFAULT 0;
--#
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS sale_type text NOT NULL DEFAULT 'CASH';
--#
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_term_days integer;
--#
CREATE TABLE IF NOT EXISTS cash_sessions (id text PRIMARY KEY, site_id text NOT NULL REFERENCES sites(id), cashier_id text NOT NULL REFERENCES users(id), opened_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, closed_at timestamp(3), opening_float numeric(14,0) NOT NULL DEFAULT 0, counted_cash numeric(14,0), expected_cash numeric(14,0), gap_amount numeric(14,0), validated_by text, note text);
--#
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS cash_session_id text REFERENCES cash_sessions(id), ADD COLUMN IF NOT EXISTS cogs_amount numeric(14,0), ADD COLUMN IF NOT EXISTS discount_approved_by text;
--#
CREATE TABLE IF NOT EXISTS sales_installments (id text PRIMARY KEY, sales_invoice_id text NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE, due_date timestamp(3) NOT NULL, amount numeric(14,0) NOT NULL, amount_paid numeric(14,0) NOT NULL DEFAULT 0);
--#
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cash_session_id text REFERENCES cash_sessions(id), ADD COLUMN IF NOT EXISTS site_id text REFERENCES sites(id), ADD COLUMN IF NOT EXISTS external_ref text, ADD COLUMN IF NOT EXISTS reconciled boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS client_op_id text;
--#
CREATE TABLE IF NOT EXISTS sales_returns (id text PRIMARY KEY, site_id text NOT NULL REFERENCES sites(id), sales_invoice_id text NOT NULL REFERENCES sales_invoices(id), reference text, reason text NOT NULL, total_amount numeric(14,0) NOT NULL, restock boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'PENDING', created_by text, validated_by text, created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
--#
CREATE TABLE IF NOT EXISTS sales_return_lines (id text PRIMARY KEY, return_id text NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE, item_id text NOT NULL REFERENCES stock_items(id), quantity numeric(14,3) NOT NULL, amount numeric(14,0) NOT NULL);
--#
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_hours numeric(10,1), ADD COLUMN IF NOT EXISTS reference_consumption numeric(6,2);
--#
ALTER TABLE fuel_transactions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'STATION', ADD COLUMN IF NOT EXISTS hours numeric(10,1);
--#
ALTER TABLE trips ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PLANNED', ADD COLUMN IF NOT EXISTS end_condition text;
--#
ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'CORRECTIVE', ADD COLUMN IF NOT EXISTS parts_cost numeric(14,0) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS labor_cost numeric(14,0) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS next_hours numeric(10,1);
--#
CREATE TABLE IF NOT EXISTS hse_incidents (id text PRIMARY KEY, site_id text NOT NULL REFERENCES sites(id), reference text, occurred_at timestamp(3) NOT NULL, zone text, location_id text REFERENCES stock_locations(id), type text NOT NULL, severity text NOT NULL, lost_time boolean NOT NULL DEFAULT false, lost_days integer NOT NULL DEFAULT 0, risk_category text, vehicle_id text REFERENCES vehicles(id), item_id text REFERENCES stock_items(id), description text NOT NULL, immediate_action text, root_cause text, status text NOT NULL DEFAULT 'OPEN', photos jsonb, reported_by text, closed_by text, closed_at timestamp(3), client_op_id text, created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
--#
CREATE TABLE IF NOT EXISTS hse_incident_persons (id text PRIMARY KEY, incident_id text NOT NULL REFERENCES hse_incidents(id) ON DELETE CASCADE, user_id text REFERENCES users(id), driver_id text REFERENCES drivers(id), full_name text, injury text);
--#
CREATE TABLE IF NOT EXISTS hse_inspections (id text PRIMARY KEY, site_id text NOT NULL REFERENCES sites(id), type text NOT NULL, location_id text REFERENCES stock_locations(id), vehicle_id text REFERENCES vehicles(id), inspected_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, inspector_id text REFERENCES users(id), score numeric(5,2), compliant boolean, checklist jsonb, notes text);
--#
CREATE TABLE IF NOT EXISTS hse_corrective_actions (id text PRIMARY KEY, site_id text NOT NULL REFERENCES sites(id), incident_id text REFERENCES hse_incidents(id), inspection_id text REFERENCES hse_inspections(id), title text NOT NULL, responsible_id text REFERENCES users(id), due_date timestamp(3) NOT NULL, status text NOT NULL DEFAULT 'OPEN', done_at timestamp(3), created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
--#
CREATE TABLE IF NOT EXISTS hse_toolbox_talks (id text PRIMARY KEY, site_id text NOT NULL REFERENCES sites(id), theme text NOT NULL, planned_at timestamp(3) NOT NULL, held_at timestamp(3), facilitator_id text REFERENCES users(id), location_id text REFERENCES stock_locations(id), status text NOT NULL DEFAULT 'PLANNED', notes text);
--#
CREATE TABLE IF NOT EXISTS hse_toolbox_attendees (id text PRIMARY KEY, talk_id text NOT NULL REFERENCES hse_toolbox_talks(id) ON DELETE CASCADE, user_id text REFERENCES users(id), driver_id text REFERENCES drivers(id), full_name text, signature_url text);
--#
CREATE TABLE IF NOT EXISTS ppe_issuances (id text PRIMARY KEY, site_id text NOT NULL REFERENCES sites(id), user_id text REFERENCES users(id), driver_id text REFERENCES drivers(id), ppe_type text NOT NULL, issued_at timestamp(3) NOT NULL, renewal_due timestamp(3), compliant boolean NOT NULL DEFAULT true, checked_at timestamp(3));
--#
CREATE TABLE IF NOT EXISTS hse_trainings (id text PRIMARY KEY, user_id text REFERENCES users(id), driver_id text REFERENCES drivers(id), title text NOT NULL, obtained_at timestamp(3) NOT NULL, expires_at timestamp(3));
--#
CREATE TABLE IF NOT EXISTS hse_worked_hours (id text PRIMARY KEY, site_id text NOT NULL REFERENCES sites(id), period date NOT NULL, hours numeric(12,1) NOT NULL, UNIQUE (site_id, period));
--#
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS site_id text REFERENCES sites(id), ADD COLUMN IF NOT EXISTS user_id text REFERENCES users(id), ADD COLUMN IF NOT EXISTS role_name text, ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'NEW';
--#
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_client_op_id_key ON stock_movements (client_op_id);
--#
CREATE UNIQUE INDEX IF NOT EXISTS payments_client_op_id_key ON payments (client_op_id);
--#
CREATE UNIQUE INDEX IF NOT EXISTS hse_incidents_client_op_id_key ON hse_incidents (client_op_id);
--#
CREATE INDEX IF NOT EXISTS goods_receipts_site_id_received_at_idx ON goods_receipts (site_id, received_at);
--#
CREATE INDEX IF NOT EXISTS stock_transfers_status_shipped_at_idx ON stock_transfers (status, shipped_at);
--#
CREATE INDEX IF NOT EXISTS stock_lots_site_id_expiry_date_idx ON stock_lots (site_id, expiry_date);
--#
CREATE INDEX IF NOT EXISTS stock_lots_item_id_idx ON stock_lots (item_id);
--#
CREATE INDEX IF NOT EXISTS cash_sessions_site_id_opened_at_idx ON cash_sessions (site_id, opened_at);
--#
CREATE INDEX IF NOT EXISTS sales_installments_due_date_idx ON sales_installments (due_date);
--#
CREATE INDEX IF NOT EXISTS sales_returns_site_id_created_at_idx ON sales_returns (site_id, created_at);
--#
CREATE INDEX IF NOT EXISTS hse_incidents_site_id_occurred_at_idx ON hse_incidents (site_id, occurred_at);
--#
CREATE INDEX IF NOT EXISTS hse_corrective_actions_status_due_date_idx ON hse_corrective_actions (status, due_date);
--#
CREATE TABLE IF NOT EXISTS cash_expenses (id text PRIMARY KEY, cash_session_id text NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE, amount numeric(14,0) NOT NULL, reason text NOT NULL, created_by text, created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
--#
CREATE INDEX IF NOT EXISTS cash_expenses_cash_session_id_idx ON cash_expenses (cash_session_id);
--#
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS user_id text;
--#
CREATE UNIQUE INDEX IF NOT EXISTS drivers_user_id_key ON drivers (user_id);
--#
ALTER TABLE trips ADD COLUMN IF NOT EXISTS scheduled_arrival timestamp(3), ADD COLUMN IF NOT EXISTS delay_reason text, ADD COLUMN IF NOT EXISTS recipient_name text, ADD COLUMN IF NOT EXISTS signature_data text, ADD COLUMN IF NOT EXISTS start_lat double precision, ADD COLUMN IF NOT EXISTS start_lng double precision, ADD COLUMN IF NOT EXISTS end_lat double precision, ADD COLUMN IF NOT EXISTS end_lng double precision;
--#
ALTER TABLE fuel_transactions ADD COLUMN IF NOT EXISTS trip_id text, ADD COLUMN IF NOT EXISTS client_op_id text;
--#
CREATE UNIQUE INDEX IF NOT EXISTS fuel_transactions_client_op_id_key ON fuel_transactions (client_op_id);
--#
ALTER TABLE vehicle_downtimes ADD COLUMN IF NOT EXISTS severity text, ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS latitude double precision, ADD COLUMN IF NOT EXISTS longitude double precision, ADD COLUMN IF NOT EXISTS trip_id text, ADD COLUMN IF NOT EXISTS client_op_id text;
--#
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_downtimes_client_op_id_key ON vehicle_downtimes (client_op_id);
--#
ALTER TABLE hse_incidents ADD COLUMN IF NOT EXISTS latitude double precision, ADD COLUMN IF NOT EXISTS longitude double precision, ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}';
--#
CREATE TABLE IF NOT EXISTS driver_devices (id text PRIMARY KEY, driver_id text NOT NULL, user_id text NOT NULL, fingerprint text, model text, os text, token_hash text, otp_hash text, activation_expires_at timestamp(3), status text NOT NULL DEFAULT 'PENDING', blocked_at timestamp(3), blocked_by text, blocked_reason text, activated_at timestamp(3), last_seen_at timestamp(3), created_by text, created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
--#
CREATE INDEX IF NOT EXISTS driver_devices_driver_id_status_idx ON driver_devices (driver_id, status);
--#
CREATE INDEX IF NOT EXISTS driver_devices_user_id_fingerprint_idx ON driver_devices (user_id, fingerprint);
--#
CREATE TABLE IF NOT EXISTS trip_logs (id text PRIMARY KEY, trip_id text NOT NULL, driver_id text NOT NULL, event_type text NOT NULL, latitude double precision, longitude double precision, mileage integer, synced_offline boolean NOT NULL DEFAULT false, client_op_id text, occurred_at timestamp(3) NOT NULL, created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
--#
CREATE UNIQUE INDEX IF NOT EXISTS trip_logs_client_op_id_key ON trip_logs (client_op_id);
--#
CREATE INDEX IF NOT EXISTS trip_logs_trip_id_occurred_at_idx ON trip_logs (trip_id, occurred_at);

--#
ALTER TABLE trips ADD COLUMN IF NOT EXISTS purpose_type text, ADD COLUMN IF NOT EXISTS regions text[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS cargo text, ADD COLUMN IF NOT EXISTS trips_count integer, ADD COLUMN IF NOT EXISTS pre_condition text, ADD COLUMN IF NOT EXISTS pre_anomalies text, ADD COLUMN IF NOT EXISTS maintenance_needed boolean, ADD COLUMN IF NOT EXISTS maintenance_reason text;

--#
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS activity text;

--#
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_color text;

--#
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

--#
CREATE TABLE IF NOT EXISTS uploaded_files (name text PRIMARY KEY, mime text NOT NULL, size integer NOT NULL, data bytea NOT NULL, created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
