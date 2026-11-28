// Audit comptable automatique (LECTURE SEULE) : cohérence des factures, règlements, soldes, caisses et retours.
// Usage : DATABASE_URL=... node scripts/audit-comptable.js
// Aucune écriture n'est faite : uniquement des SELECT. Peut être lancé sur une copie de la production.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
let fails = 0;
const q = (sql) => prisma.$queryRawUnsafe(sql);
const check = async (label, sql, { warnOnly = false } = {}) => {
  const rows = await q(sql);
  const bad = rows.length;
  console.log(`${bad ? (warnOnly ? '⚠ ' : '✘ ') : '✔ '}${label}${bad ? ` → ${bad} écart(s) : ` + JSON.stringify(rows.slice(0, 3), (k, v) => (typeof v === 'bigint' ? Number(v) : v)) : ''}`);
  if (bad && !warnOnly) fails++;
};

(async () => {
  const [{ fv, ff, p, c }] = await q(`SELECT (SELECT COUNT(*) FROM sales_invoices)::int fv, (SELECT COUNT(*) FROM purchase_invoices)::int ff, (SELECT COUNT(*) FROM payments)::int p, (SELECT COUNT(*) FROM cash_sessions)::int c`);
  console.log(`Périmètre : ${fv} facture(s) client, ${ff} facture(s) fournisseur, ${p} règlement(s), ${c} caisse(s)`);
  const T = 1; // tolérance d'arrondi (1 GNF)

  // ---- Factures
  await check('facture client : total = sous-total − remise + taxes',
    `SELECT reference, subtotal, discount_amount, tax_amount, total_amount FROM sales_invoices
     WHERE ABS(total_amount - (subtotal - COALESCE(discount_amount,0) + COALESCE(tax_amount,0))) > ${T}`);
  await check('facture client : montant réglé entre 0 et le total',
    `SELECT reference, total_amount, amount_paid FROM sales_invoices WHERE amount_paid < -${T} OR amount_paid > total_amount + ${T}`);
  await check('facture fournisseur : montant réglé entre 0 et le total',
    `SELECT reference, total_amount, amount_paid FROM purchase_invoices WHERE amount_paid < -${T} OR amount_paid > total_amount + ${T}`);
  await check('facture client : statut conforme au montant réglé',
    `SELECT reference, status, total_amount, amount_paid FROM sales_invoices WHERE status <> 'CANCELLED' AND status <> 'DRAFT' AND (
       (status = 'PAID' AND amount_paid < total_amount - ${T}) OR
       (status = 'UNPAID' AND amount_paid > ${T}) OR
       (status = 'PARTIALLY_PAID' AND (amount_paid <= ${T} OR amount_paid >= total_amount - ${T})))`);
  await check('facture fournisseur : statut conforme au montant réglé',
    `SELECT reference, status, total_amount, amount_paid FROM purchase_invoices WHERE status <> 'CANCELLED' AND status <> 'DRAFT' AND (
       (status = 'PAID' AND amount_paid < total_amount - ${T}) OR
       (status = 'UNPAID' AND amount_paid > ${T}) OR
       (status = 'PARTIALLY_PAID' AND (amount_paid <= ${T} OR amount_paid >= total_amount - ${T})))`);
  await check('références de factures uniques',
    `SELECT reference, COUNT(*) n FROM (SELECT reference FROM sales_invoices UNION ALL SELECT reference FROM purchase_invoices) x GROUP BY reference HAVING COUNT(*) > 1`);

  // ---- Règlements ↔ factures (rapprochement)
  await check('facture client : montant réglé = encaissements − remboursements enregistrés',
    `SELECT i.reference, i.amount_paid, COALESCE(SUM(CASE WHEN p.direction='IN' THEN p.amount ELSE -p.amount END),0) AS reglements
     FROM sales_invoices i LEFT JOIN payments p ON p.sales_invoice_id = i.id
     GROUP BY i.id, i.reference, i.amount_paid HAVING ABS(i.amount_paid - COALESCE(SUM(CASE WHEN p.direction='IN' THEN p.amount ELSE -p.amount END),0)) > ${T}`);
  await check('facture fournisseur : montant réglé = décaissements enregistrés',
    `SELECT i.reference, i.amount_paid, COALESCE(SUM(p.amount),0) AS reglements
     FROM purchase_invoices i LEFT JOIN payments p ON p.purchase_invoice_id = i.id AND p.direction = 'OUT'
     GROUP BY i.id, i.reference, i.amount_paid HAVING ABS(i.amount_paid - COALESCE(SUM(p.amount),0)) > ${T}`);
  await check('règlement rattaché à une seule facture',
    `SELECT id, amount FROM payments WHERE (sales_invoice_id IS NOT NULL AND purchase_invoice_id IS NOT NULL)`);
  await check('règlement sans facture', `SELECT id, direction, amount FROM payments WHERE sales_invoice_id IS NULL AND purchase_invoice_id IS NULL`, { warnOnly: true });
  await check('sens du règlement cohérent (client = encaissement, fournisseur = décaissement)',
    `SELECT id, direction FROM payments WHERE purchase_invoice_id IS NOT NULL AND direction <> 'OUT'`);
  await check('montant de règlement strictement positif', `SELECT id, amount FROM payments WHERE amount <= 0`);
  await check('règlement enregistré sur le même site que sa facture',
    `SELECT p.id FROM payments p LEFT JOIN sales_invoices s ON s.id = p.sales_invoice_id LEFT JOIN purchase_invoices f ON f.id = p.purchase_invoice_id
     WHERE p.site_id IS NOT NULL AND COALESCE(s.site_id, f.site_id) IS NOT NULL AND p.site_id <> COALESCE(s.site_id, f.site_id)`);
  await check('numéros de reçu uniques', `SELECT receipt_number, COUNT(*) FROM payments WHERE receipt_number IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1`);
  await check('référence de paiement mobile non utilisée deux fois', `SELECT external_ref, COUNT(*) FROM payments WHERE external_ref IS NOT NULL AND external_ref <> '' GROUP BY 1 HAVING COUNT(*) > 1`);
  await check('règlements non rapprochés (pointage bancaire / opérateur)', `SELECT id, method, amount FROM payments WHERE method <> 'CASH' AND reconciled IS NOT TRUE`, { warnOnly: true });

  // ---- Échéanciers
  await check('échéancier : somme des échéances = total de la facture',
    `SELECT i.reference, i.total_amount, SUM(e.amount) echeances FROM sales_installments e JOIN sales_invoices i ON i.id = e.sales_invoice_id
     GROUP BY i.id, i.reference, i.total_amount HAVING ABS(SUM(e.amount) - i.total_amount) > ${T}`);
  await check('échéancier : réglé par échéance ≤ montant de l’échéance', `SELECT id FROM sales_installments WHERE amount_paid > amount + ${T} OR amount_paid < 0`);

  // ---- Retours
  await check('retours validés ≤ total de la facture',
    `SELECT i.reference, i.total_amount, SUM(r.total_amount) retours FROM sales_returns r JOIN sales_invoices i ON i.id = r.sales_invoice_id
     WHERE r.status = 'VALIDATED' GROUP BY i.id, i.reference, i.total_amount HAVING SUM(r.total_amount) > i.total_amount + ${T}`);

  // ---- Caisse
  await check('caisse clôturée : espèces attendues = fonds de caisse + encaissements − sorties − dépenses',
    `SELECT s.id, s.expected_cash, s.opening_float + COALESCE(pi.v,0) - COALESCE(po.v,0) - COALESCE(e.v,0) AS recalcule
     FROM cash_sessions s
     LEFT JOIN (SELECT cash_session_id, SUM(amount) v FROM payments WHERE direction='IN' AND method='CASH' GROUP BY 1) pi ON pi.cash_session_id = s.id
     LEFT JOIN (SELECT cash_session_id, SUM(amount) v FROM payments WHERE direction='OUT' AND method='CASH' GROUP BY 1) po ON po.cash_session_id = s.id
     LEFT JOIN (SELECT cash_session_id, SUM(amount) v FROM cash_expenses GROUP BY 1) e ON e.cash_session_id = s.id
     WHERE s.closed_at IS NOT NULL AND ABS(s.expected_cash - (s.opening_float + COALESCE(pi.v,0) - COALESCE(po.v,0) - COALESCE(e.v,0))) > ${T}`);
  await check('caisse clôturée : écart = compté − attendu', `SELECT id FROM cash_sessions WHERE closed_at IS NOT NULL AND ABS(gap_amount - (counted_cash - expected_cash)) > ${T}`);
  await check('pas de règlement ajouté à une caisse déjà clôturée',
    `SELECT p.id FROM payments p JOIN cash_sessions s ON s.id = p.cash_session_id WHERE s.closed_at IS NOT NULL AND p.created_at > s.closed_at`);

  // ---- Soldes (balance âgée simplifiée)
  const soldes = await q(`SELECT
      COALESCE(SUM(total_amount - amount_paid) FILTER (WHERE status NOT IN ('CANCELLED','DRAFT')),0)::float AS clients,
      (SELECT COALESCE(SUM(total_amount - amount_paid),0)::float FROM purchase_invoices WHERE status NOT IN ('CANCELLED','DRAFT')) AS fournisseurs,
      (SELECT COALESCE(SUM(CASE WHEN direction='IN' THEN amount ELSE -amount END),0)::float FROM payments) AS tresorerie_nette
    FROM sales_invoices`);
  console.log('Soldes : créances clients', soldes[0].clients, 'GNF — dettes fournisseurs', soldes[0].fournisseurs, 'GNF — flux nets de règlements', soldes[0].tresorerie_nette, 'GNF');

  console.log('\nNon couvert par SYL (à signaler) : plan comptable, écritures en partie double, grand livre, balance générale, bilan et compte de résultat.');
  console.log(fails ? `\n${fails} contrôle(s) comptable(s) en écart` : '\nTous les contrôles comptables sont cohérents.');
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
