/* =====================================================================
   JOURNAL D'ACTIVITÉ (Direction générale, lecture seule)
   RÉPERTOIRE FOURNISSEURS (Gestionnaire de stock)
   Deux rubriques qui étaient « bientôt disponibles » : elles utilisent
   les données réelles du serveur (/audit, /suppliers). Rien n'est inventé.
   ===================================================================== */

/* ---------- Libellés français des éléments du journal ---------- */
const JR_GROUPS = [
  ['', 'Tous les domaines', null],
  ['flotte', 'Flotte et véhicules', ['Vehicle', 'Document', 'VehicleDowntime', 'DowntimeUntaken', 'DowntimeUnqualified', 'DowntimePartsLate', 'DowntimeOverdue', 'Maintenance', 'MaintenancePlan', 'MaintenancePlanned', 'DriverMaintenance', 'FuelTransaction']],
  ['missions', 'Missions et fiches de bord', ['Trip', 'TripNotStarted', 'TripDelay', 'DriverDailyReport']],
  ['personnel', 'Personnel et accès', ['User', 'Driver', 'DriverDevice', 'UserDevice', 'DriverSignup', 'DriverAttendance', 'PointerCount']],
  ['depenses', 'Dépenses et validations', ['DriverExpense', 'Expense', 'CashExpense', 'CashSession']],
  ['stock', 'Stock et achats', ['InventoryItem', 'InventoryCount', 'StockMovement', 'StockTransfer', 'StockLot', 'NeedRequest', 'PriceRequest', 'PurchaseOrder', 'PurchaseInvoice', 'Supplier']],
  ['commercial', 'Commercial et paiements', ['Customer', 'SalesOrder', 'SalesInvoice', 'SalesReturn', 'SalesInstallment', 'SalePrice', 'Payment', 'PendingPayment']],
  ['hse', 'HSE', ['HseIncident', 'HseCorrectiveAction', 'HseInspection', 'HseTraining', 'HseToolboxTalk']],
  ['parametres', 'Paramètres', ['Setting', 'Site', 'Organization', 'Simulation', 'ProblemReport']],
];
const JR_ENT = {
  Vehicle: 'Véhicule', Document: 'Document du véhicule', VehicleDowntime: 'Immobilisation', DowntimeUntaken: 'Panne non prise en charge', DowntimeUnqualified: 'Panne non qualifiée',
  DowntimePartsLate: 'Pièces en retard', DowntimeOverdue: 'Réparation en retard', Maintenance: 'Maintenance', MaintenancePlan: 'Plan d\'entretien', MaintenancePlanned: 'Entretien planifié',
  DriverMaintenance: 'Entretien déclaré', FuelTransaction: 'Ravitaillement', Trip: 'Mission', TripNotStarted: 'Mission non démarrée', TripDelay: 'Retard de mission', DriverDailyReport: 'Fiche de bord',
  User: 'Compte utilisateur', Driver: 'Chauffeur', DriverDevice: 'Appareil chauffeur', UserDevice: 'Appareil utilisateur', DriverSignup: 'Inscription chauffeur', DriverAttendance: 'Présence',
  PointerCount: 'Pointage', DriverExpense: 'Dépense chauffeur', Expense: 'Dépense', CashExpense: 'Dépense de caisse', CashSession: 'Caisse', InventoryItem: 'Article', InventoryCount: 'Inventaire',
  StockMovement: 'Mouvement de stock', StockTransfer: 'Transfert de stock', StockLot: 'Lot de stock', NeedRequest: 'État des besoins', PriceRequest: 'Demande de prix', PurchaseOrder: 'Bon de commande',
  PurchaseInvoice: 'Facture fournisseur', Supplier: 'Fournisseur', Customer: 'Client', SalesOrder: 'Commande client', SalesInvoice: 'Facture client', SalesReturn: 'Retour client',
  SalesInstallment: 'Échéance client', SalePrice: 'Prix de vente', Payment: 'Paiement', PendingPayment: 'Paiement en attente', HseIncident: 'Incident HSE', HseCorrectiveAction: 'Action corrective',
  HseInspection: 'Inspection HSE', HseTraining: 'Formation HSE', HseToolboxTalk: 'Causerie sécurité', Setting: 'Paramètre', Site: 'Site', Organization: 'Entreprise', Simulation: 'Simulation', ProblemReport: 'Signalement',
};
// Champs techniques jamais affichés tels quels
const JR_SKIP = /^(id|.*Id|createdAt|updatedAt|organizationId)$/;
const JR_FIELD = { status: 'statut', vehicleType: 'type', type: 'type', title: 'titre', reference: 'référence', total: 'total', unitPrice: 'prix unitaire', description: 'description', severity: 'gravité', email: 'e-mail', amount: 'montant', quantity: 'quantité', motif: 'motif', reason: 'motif', role: 'rôle', mileage: 'kilométrage', liters: 'litres', name: 'nom', plate: 'immatriculation', phone: 'téléphone', firstName: 'prénom', lastName: 'nom', note: 'note' };
const JR = { group: '', from: '', to: '', who: '' };
// Valeurs techniques (statuts, rôles) traduites ; une valeur inconnue en majuscules n'est pas montrée en anglais
const JR_VAL = {
  DRAFT: 'Brouillon', SUBMITTED: 'Envoyé', SENT: 'Envoyé', RECEIVED: 'Reçu', VERIFIED: 'Vérifié', VALIDATED: 'Validé', APPROVED: 'Approuvé', REJECTED: 'Rejeté', CANCELLED: 'Annulé', CANCELED: 'Annulé',
  PENDING: 'En attente', IN_PROGRESS: 'En cours', ONGOING: 'En cours', DONE: 'Terminé', COMPLETED: 'Terminé', CLOSED: 'Clos', OPEN: 'Ouvert', PAID: 'Payé', UNPAID: 'Impayé', PARTIAL: 'Partiel',
  ACTIVE: 'Actif', INACTIVE: 'Inactif', SUSPENDED: 'Suspendu', DISABLED: 'Désactivé', BLOCKED: 'Bloqué', REVOKED: 'Révoqué', AVAILABLE: 'Disponible', ON_MISSION: 'En mission', MAINTENANCE: 'En maintenance', IMMOBILIZED: 'Immobilisé',
  TRUCK: 'Camion', SERVICE_VEHICLE: 'Véhicule de service', IN: 'Entrée', OUT: 'Sortie', true: 'oui', false: 'non',
};
const jrVal = (x) => { const s = String(x); if (JR_VAL[s]) return JR_VAL[s]; if (typeof roleLabel === 'function' && /^[A-Z_]+$/.test(s) && roleLabel(s) !== s) return roleLabel(s); return /^[A-Z][A-Z_]{2,}$/.test(s) ? '' : s; };

function jrSummary(r) {
  const v = r.newValue && typeof r.newValue === 'object' && !Array.isArray(r.newValue) ? r.newValue : null;
  if (!v) return '';
  const parts = [];
  for (const [k, x] of Object.entries(v)) {
    if (JR_SKIP.test(k) || !JR_FIELD[k] || x === null || x === undefined || typeof x === 'object' || x === '••••') continue;
    if (parts.length >= 4) break;
    const s = jrVal(x); if (!s) continue;
    parts.push(JR_FIELD[k] + ' : ' + (s.length > 40 ? s.slice(0, 40) + '…' : s));
  }
  return parts.join(' · ');
}
async function renderJournal() {
  const g = JR_GROUPS.map((x) => `<option value="${x[0]}"${x[0] === JR.group ? ' selected' : ''}>${esc(x[1])}</option>`).join('');
  root().innerHTML = `<div class="panel"><h3>${PROF_IC('clock')} Journal d'activité et des décisions</h3>
    <div class="desc">Toutes les créations, modifications, validations et suppressions faites dans l'application, avec la personne et l'heure. Consultation seule.</div>
    <div class="grid-2" style="margin-top:8px">
      <div><label>Domaine</label><select id="jr-group" onchange="JR.group=this.value;jrLoad()">${g}</select></div>
      <div><label>Personne (nom contient)</label><input id="jr-who" value="${esc(JR.who)}" oninput="JR.who=this.value;jrFilter()" placeholder="ex. Camara" /></div>
      <div><label>Du</label><input type="date" id="jr-from" value="${esc(JR.from)}" onchange="JR.from=this.value;jrLoad()" /></div>
      <div><label>Au</label><input type="date" id="jr-to" value="${esc(JR.to)}" onchange="JR.to=this.value;jrLoad()" /></div>
    </div>
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" onclick="JR.group='';JR.from='';JR.to='';JR.who='';renderJournal()">Effacer les filtres</button><button class="btn small" onclick="window.print()">Imprimer</button></div>
    <div id="jr-body" style="margin-top:12px"><div class="empty">Chargement…</div></div></div>`;
  jrLoad();
}
async function jrLoad() {
  const box = document.getElementById('jr-body'); if (!box) return;
  box.innerHTML = '<div class="empty">Chargement…</div>';
  const grp = JR_GROUPS.find((x) => x[0] === JR.group);
  const q = ['limit=300'];
  if (grp && grp[2]) q.push('entities=' + encodeURIComponent(grp[2].join(',')));
  if (JR.from) q.push('from=' + encodeURIComponent(JR.from + 'T00:00:00'));
  if (JR.to) q.push('to=' + encodeURIComponent(JR.to + 'T23:59:59'));
  try {
    const view = state.view, rows = await api('/audit?' + q.join('&'));
    if (state.view !== view) return;
    window._jrRows = rows; jrFilter();
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function jrFilter() {
  const box = document.getElementById('jr-body'); if (!box) return;
  const who = (JR.who || '').trim().toLowerCase();
  const rows = (window._jrRows || []).filter((r) => !who || (r.user ? (r.user.firstName + ' ' + r.user.lastName).toLowerCase().includes(who) : 'chauffeur système'.includes(who)));
  if (!rows.length) { box.innerHTML = '<div class="empty">Aucune activité enregistrée pour ces filtres.</div>'; return; }
  const when = (d) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  box.innerHTML = `<div class="desc">${fmt(rows.length)} opération(s)${rows.length >= 300 ? ' — les 300 plus récentes ; réduisez la période pour voir les plus anciennes' : ''}.</div>
    <div style="overflow-x:auto"><table><thead><tr><th>Date et heure</th><th>Par</th><th>Action</th><th>Élément</th><th>Détail</th></tr></thead><tbody>${rows.map((r) => `<tr>
      <td style="white-space:nowrap">${when(r.createdAt)}</td>
      <td>${esc(r.user ? r.user.firstName + ' ' + r.user.lastName : 'Chauffeur / système')}</td>
      <td><span class="badge ${r.action === 'DELETE' ? 'bad' : r.action === 'CREATE' ? 'ok' : 'info'}">${esc(HIST_LAB[r.action] || r.action)}</span></td>
      <td>${esc(JR_ENT[r.entity] || r.entity)}</td>
      <td style="font-size:12px;color:var(--muted)">${esc(jrSummary(r))}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ---------- Répertoire fournisseurs (écran seul, sans le reste des Achats) ---------- */
async function renderSuppliersDir() {
  const canEdit = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'MAGASINIER'].includes(state.user.role);
  root().innerHTML = `<div class="panel"><h3>${PROF_IC('file')} Répertoire des fournisseurs</h3>
    <div class="desc">Coordonnées des fournisseurs de pièces, batteries, pneus et consommables. Les commandes restent gérées par les Achats.</div>
    ${canEdit ? `<div class="grid-2" style="margin-top:8px">
      <div><label>Nom</label><input id="su-name" /></div><div><label>Contact</label><input id="su-contact" /></div>
      <div><label>Téléphone</label><input id="su-phone" inputmode="tel" /></div><div><label>E-mail</label><input id="su-email" inputmode="email" /></div>
    </div>
    <button class="btn gold" style="margin-top:8px;" onclick="addSupplier()">+ Ajouter le fournisseur</button><div id="su-msg"></div>` : ''}
    <div id="su-list" style="margin-top:12px;"><div class="empty">Chargement…</div></div></div>`;
  loadSuppliers();
}
// Après un ajout ou une modification, on reste sur l'écran d'où l'on vient
function suppliersRefresh() { return state.view === 'suppliers' ? renderSuppliersDir() : renderPurchases(); }
{ const _as = addSupplier; addSupplier = async function () {
  if (state.view !== 'suppliers') return _as.apply(this, arguments);
  const msg = document.getElementById('su-msg'), v = (i) => document.getElementById(i).value.trim();
  if (!v('su-name')) { msg.innerHTML = '<div class="msg err">Le nom du fournisseur est obligatoire.</div>'; return; }
  try {
    await api('/suppliers', { method: 'POST', body: { name: v('su-name'), ...(v('su-contact') ? { contactName: v('su-contact') } : {}), ...(v('su-phone') ? { phone: v('su-phone') } : {}), ...(v('su-email') ? { email: v('su-email') } : {}) } });
    renderSuppliersDir();
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}; }
{ const _es = editSupplier; editSupplier = function (id) {
  if (state.view !== 'suppliers') return _es.apply(this, arguments);
  const s = (window._suppliers || []).find((x) => x.id === id); if (!s) return;
  openEditor('Modifier le fournisseur ' + s.name, [
    { key: 'name', label: 'Nom', value: s.name }, { key: 'contactName', label: 'Contact', value: s.contactName },
    { key: 'phone', label: 'Téléphone', value: s.phone }, { key: 'email', label: 'E-mail', value: s.email },
    { key: 'address', label: 'Adresse', value: s.address }, { key: 'productsSupplied', label: 'Produits fournis', value: s.productsSupplied },
  ], async (d) => { await api('/suppliers/' + id, { method: 'PATCH', body: d }); renderSuppliersDir(); });
}; }

/* ---------- Branchement : titres, écrans et rubriques des profils ---------- */
titles['journal'] = 'Journal d\'activité';
titles['suppliers'] = 'Fournisseurs';
{ const _rvJ = renderView; renderView = async function (view) {
  if (view === 'journal' || view === 'suppliers') {
    try { if (view === 'journal') await renderJournal(); else await renderSuppliersDir(); }
    catch (e) { root().innerHTML = `<div class="panel"><div class="msg err">${esc(e.message)}</div></div>`; }
    try { if (PROF.key && state.view === view) { const old = document.getElementById('pf-crumb'); if (old) old.remove(); const h = profCrumbHtml(view); if (h) root().insertAdjacentHTML('afterbegin', h); } } catch (e) {}
    return;
  }
  return _rvJ.apply(this, arguments);
}; }
// Les deux rubriques « bientôt disponibles » ouvrent maintenant leur écran
(function () {
  const dg = PROFILES.DG.folders[0].subs, i = dg.findIndex((s) => s[0] === 'Historique des décisions' && s[1] === null);
  if (i >= 0) dg[i] = ['Journal d\'activité et décisions', 'journal', 'Qui a fait quoi et quand : validations, modifications, suppressions (lecture seule).', ['DIRECTEUR_GENERAL']];
  const st = PROFILES.STOCK.folders.find((f) => f.subs.some((s) => s[0] === 'Répertoire fournisseurs'));
  if (st) { const k = st.subs.findIndex((s) => s[0] === 'Répertoire fournisseurs'); st.subs[k] = ['Répertoire fournisseurs', 'suppliers', 'Coordonnées des fournisseurs ; ajout et modification.']; }
})();

/* ---------- Entrée / sortie de stock : un message clair au lieu d'un bouton qui semble ne rien faire ----------
   (ex. aucun article créé, réseau coupé) — le message s'affiche à l'écran au lieu de rester invisible. */
{ const _sm = stockMove; stockMove = async function (dir) {
  try { return await _sm.apply(this, arguments); }
  catch (e) {
    const m = /Aucun\(e\) article/.test(e.message) ? 'Aucun article enregistré pour l\'instant. Créez d\'abord l\'article dans « Catalogue des articles », puis revenez ici.' : e.message;
    alert(m);
  }
}; }
