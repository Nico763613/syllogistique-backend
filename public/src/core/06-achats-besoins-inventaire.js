async function loadReorder() {
  const box = document.getElementById('pu-reorder');
  try {
    const r = await api('/purchases/reorder?siteId=' + state.siteId);
    const groups = r.suppliers.map(g => `<h4 style="margin:10px 0 4px;">${esc(g.supplierName)} — <span class="mono">${fmt(g.total)} GNF</span></h4>
      <table><thead><tr><th>Code</th><th>Article</th><th>Stock</th><th>Couverture</th><th>Déjà commandé</th><th>À commander</th></tr></thead><tbody>${g.lines.map(l => `
      <tr><td>${esc(l.sku)}</td><td>${esc(l.name)}</td><td class="mono">${fmt(l.currentQuantity)} ${esc(l.unit)}</td><td class="mono">${l.coverageDays ?? '—'} j</td><td class="mono">${fmt(l.alreadyOnOrder)}</td><td class="mono"><b>${fmt(l.quantity)}</b></td></tr>`).join('')}</tbody></table>`).join('');
    const orphan = r.withoutSupplier.length ? `<div class="msg err">${r.withoutSupplier.length} article(s) à commander n'ont pas de fournisseur : ${esc(r.withoutSupplier.map(l => l.name).join(', '))}. Associez-leur un fournisseur.</div>` : '';
    box.innerHTML = (groups || '<div class="desc"><svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg> Rien à commander pour le moment.</div>') + orphan +
      (r.suppliers.length ? `<div style="margin-top:10px;">Total estimé : <b>${fmt(r.totalEstimated)} GNF</b> <button class="btn gold" style="margin-left:10px;" onclick="createDrafts()"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg> Créer les bons de commande (brouillons)</button></div>` : '');
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function createDrafts() {
  const msg = document.getElementById('pu-msg');
  try {
    const r = await api('/purchases/reorder/create-drafts', { method: 'POST', body: { siteId: state.siteId } });
    msg.innerHTML = `<div class="msg ok">${r.created.length} bon(s) de commande brouillon créé(s) : ${esc(r.created.map(c => c.reference).join(', '))}.</div>`;
    renderPurchases();
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function loadOrders(isAdmin) {
  const box = document.getElementById('pu-orders');
  try {
    const list = await api('/purchases/orders?siteId=' + state.siteId);
    const st = { DRAFT: 'Brouillon', CONFIRMED: 'Confirmé', PARTIALLY_RECEIVED: 'Reçu partiel', RECEIVED: 'Reçu', INVOICED: 'Facturé', CANCELLED: 'Annulé' };
    box.innerHTML = list.length ? `<table><thead><tr><th>Référence</th><th>Date</th><th>Fournisseur</th><th>État</th><th>Actions</th></tr></thead><tbody>${list.map(o => `
      <tr><td class="mono">${esc(o.reference)}</td><td>${new Date(o.orderDate).toLocaleDateString('fr-FR')}</td><td>${esc(o.supplier?.name)}</td><td>${st[o.status] || esc(o.status)}</td>
      <td><button class="btn small" onclick="orderPdf('${esc(o.id)}','${esc(o.reference)}')">PDF</button>
      ${isAdmin && o.status === 'DRAFT' ? `<button class="btn small gold" onclick="confirmOrder('${esc(o.id)}')">Confirmer</button>` : ''}
      ${isAdmin && ['DRAFT', 'CONFIRMED'].includes(o.status) ? `<button class="btn small" onclick="cancelOrder('${esc(o.id)}')">Annuler</button>` : ''}
      ${['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(o.status) ? `<button class="btn small" onclick="receiveOrder('${esc(o.id)}')">Réceptionner</button>` : ''}
      ${['PARTIALLY_RECEIVED', 'RECEIVED', 'INVOICED'].includes(o.status) ? `<button class="btn small" onclick="brPdfOf('${esc(o.id)}')">Bon de réception</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="desc">Aucun bon de commande.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function orderPdf(id, ref) {
  try {
    const blob = await api('/purchases/orders/' + id + '/pdf');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bon_commande_' + ref + '.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) { alert(e.message); }
}
async function confirmOrder(id) {
  if (!confirm('Confirmer ce bon de commande ?')) return;
  try { await api('/purchases/orders/' + id + '/confirm', { method: 'POST' }); renderPurchases(); } catch (e) { alert(e.message); }
}
async function cancelOrder(id) {
  const reason = prompt('Motif de l’annulation (obligatoire) :');
  if (!reason || reason.trim().length < 3) return;
  try { await api('/purchases/orders/' + id + '/cancel', { method: 'POST', body: { reason: reason.trim() } }); renderPurchases(); } catch (e) { alert(e.message); }
}
async function receiveOrder(id) {
  try {
    const o = await api('/purchases/orders/' + id);
    const rows = o.lines.map(l => ({ l, rest: Number(l.quantityOrdered) - Number(l.quantityReceived) })).filter(r => r.rest > 0);
    if (!rows.length) { alert('Tout est déjà réceptionné.'); return; }
    const old = document.getElementById('rc-ov'); if (old) old.remove();
    const ov = document.createElement('div'); ov.id = 'rc-ov'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,25,45,.55);z-index:90;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto';
    ov.innerHTML = `<div class="panel" style="max-width:640px;width:100%;max-height:100%;overflow:auto"><h3>Bon de réception — ${esc(o.reference)}</h3>
      <div class="desc">Indiquez ce qui est réellement arrivé. Signalez les articles abîmés ou non conformes : ils n'entrent pas en stock.</div>
      <div style="overflow-x:auto"><table><tr><th>Article</th><th>Reste</th><th>Livré</th><th>Dont rejeté</th><th>Motif du rejet</th></tr>${rows.map((r, i) => `<tr><td>${esc((r.l.item && r.l.item.name) || 'Article')}</td><td>${r.rest}</td>
        <td><input id="rc-q${i}" type="number" min="0" step="any" value="${r.rest}" style="width:80px"></td><td><input id="rc-r${i}" type="number" min="0" step="any" value="0" style="width:80px"></td><td><input id="rc-m${i}" placeholder="ex. emballage abîmé" style="min-width:140px"></td></tr>`).join('')}</table></div>
      <label style="margin-top:8px">N° du bon de livraison du fournisseur</label><input id="rc-bl" autocomplete="off">
      <label>Frais de transport (GNF)</label><input id="rc-fr" type="number" min="0" value="0">
      <label>Observations</label><input id="rc-ob" autocomplete="off">
      <div id="rc-m"></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn gold" onclick="receiveGo('${esc(id)}', ${rows.length})">Valider la réception</button></div></div>`;
    window._rcRows = rows.map(r => r.l.id);
    document.body.appendChild(ov);
  } catch (e) { alert(e.message); }
}
async function receiveGo(id, n) {
  const m = document.getElementById('rc-m'), val = (k) => (document.getElementById(k).value || '').trim();
  const lines = [];
  for (let i = 0; i < n; i++) {
    const q = Number(val('rc-q' + i)), rj = Number(val('rc-r' + i) || 0);
    if (isNaN(q) || q < 0 || isNaN(rj) || rj < 0) { m.innerHTML = '<div class="msg err">Quantité invalide.</div>'; return; }
    if (q <= 0) continue;
    if (rj > q) { m.innerHTML = '<div class="msg err">Le rejeté dépasse la quantité livrée.</div>'; return; }
    if (rj > 0 && !val('rc-m' + i)) { m.innerHTML = '<div class="msg err">Indiquez le motif du rejet.</div>'; return; }
    lines.push({ lineId: window._rcRows[i], quantityReceived: q, quantityRejected: rj || undefined, rejectReason: rj > 0 ? val('rc-m' + i) : undefined });
  }
  if (!lines.length) { m.innerHTML = '<div class="msg err">Indiquez au moins une quantité livrée.</div>'; return; }
  try {
    await api('/purchases/orders/' + id + '/receive', { method: 'POST', body: { lines, deliveryNoteNo: val('rc-bl') || undefined, freightCost: Number(val('rc-fr')) || undefined, notes: val('rc-ob') || undefined } });
    const ov = document.getElementById('rc-ov'); if (ov) ov.remove();
    await brPdfOf(id, true);
    renderPurchases();
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
// Dernier bon de réception (BR) du bon de commande, en PDF
async function brPdfOf(orderId, quiet) {
  try {
    const list = await api('/purchases/orders/' + orderId + '/receipts');
    if (!list.length) { if (!quiet) alert('Aucune réception enregistrée.'); return; }
    const r = list[list.length - 1];
    const blob = await api('/purchases/receipts/' + r.id + '/pdf');
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (r.reference || 'bon_reception') + '.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    if (!quiet && list.length > 1) alert('Dernier bon de réception téléchargé (' + list.length + ' réceptions sur ce bon de commande).');
  } catch (e) { if (!quiet) alert(e.message); }
}

/* ---- Demandes de prix : comparatif fournisseurs ---- */
const PR_ST = { OUVERTE: 'En cours', COMPAREE: 'Offres à comparer', VALIDEE: 'Validée', ANNULEE: 'Annulée' };
async function loadPriceRequests() {
  const box = document.getElementById('pu-pr'); if (!box) return;
  try {
    const list = await api('/purchases/price-requests?siteId=' + state.siteId);
    box.innerHTML = list.length ? `<div style="overflow-x:auto"><table><thead><tr><th>N°</th><th>Objet</th><th>État</th><th>Offres</th><th>Prochaine étape</th><th></th></tr></thead><tbody>${list.map(r => `<tr><td class="mono">${esc(r.number)}</td><td>${esc(r.title)}</td><td>${PR_ST[r.status] || esc(r.status)}</td><td>${r.received}/${r.suppliers}</td><td style="font-size:12px">${esc(r.nextStep)}</td><td><button class="btn small gold" onclick="prOpen('${esc(r.id)}')">Ouvrir</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="desc">Aucune demande de prix.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function prOverlay(html) {
  const old = document.getElementById('pr-ov'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = 'pr-ov'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,25,45,.55);z-index:90;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto';
  ov.innerHTML = `<div class="panel" style="max-width:760px;width:100%;max-height:100%;overflow:auto">${html}</div>`;
  document.body.appendChild(ov);
}
function prClose() { const ov = document.getElementById('pr-ov'); if (ov) ov.remove(); }
async function prNew() {
  try {
    const [sup, items, needs] = await Promise.all([api('/suppliers'), api('/inventory/items?siteId=' + state.siteId), api('/needs?siteId=' + state.siteId).catch(() => [])]);
    window._prItems = items;
    const approved = (needs || []).filter(n => n.status === 'APPROUVE');
    prOverlay(`<h3>Nouvelle demande de prix</h3>
      <label>Objet</label><input id="pr-t" autocomplete="off" placeholder="ex. Huile moteur et filtres">
      <label>À partir d'un état de besoin approuvé (facultatif)</label>
      <select id="pr-n" onchange="document.getElementById('pr-free').style.display = this.value ? 'none' : ''"><option value="">— Saisie libre des articles —</option>${approved.map(n => `<option value="${esc(n.id)}">${esc(n.reference)} — ${esc(n.title)}</option>`).join('')}</select>
      <div id="pr-free"><label>Articles et quantités</label><div id="pr-lines"></div><button class="btn small" onclick="prAddLine()">+ Ajouter un article</button></div>
      <label style="margin-top:8px">Fournisseurs à consulter (2 au moins)</label>
      <div>${sup.map(f => `<label style="display:flex;gap:6px;align-items:center;margin:2px 0"><input type="checkbox" class="pr-s" value="${esc(f.id)}" style="width:auto"> ${esc(f.name)}</label>`).join('') || '<div class="desc">Ajoutez d\'abord des fournisseurs.</div>'}</div>
      <div id="pr-m"></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn gold" onclick="prCreate()">Créer la demande</button><button class="btn" onclick="prClose()">Retour</button></div>`);
    prAddLine();
  } catch (e) { alert(e.message); }
}
function prAddLine() {
  const box = document.getElementById('pr-lines'); if (!box) return;
  const d = document.createElement('div'); d.style.cssText = 'display:flex;gap:6px;margin:4px 0'; d.className = 'pr-line';
  d.innerHTML = `<select class="pr-i" style="flex:1"><option value="">— Article —</option>${(window._prItems || []).map(i => `<option value="${esc(i.id)}">${esc(i.sku)} — ${esc(i.name)}</option>`).join('')}</select><input class="pr-q" type="number" min="0" step="any" placeholder="Qté" style="width:90px">`;
  box.appendChild(d);
}
async function prCreate() {
  const m = document.getElementById('pr-m'), v = (id) => (document.getElementById(id).value || '').trim();
  const supplierIds = [...document.querySelectorAll('.pr-s:checked')].map(x => x.value);
  const needRequestId = v('pr-n') || undefined;
  const lines = needRequestId ? undefined : [...document.querySelectorAll('.pr-line')].map(d => ({ itemId: d.querySelector('.pr-i').value, quantity: Number(d.querySelector('.pr-q').value) })).filter(l => l.itemId && l.quantity > 0);
  try {
    const r = await api('/purchases/price-requests', { method: 'POST', body: { siteId: state.siteId, title: v('pr-t') || undefined, needRequestId, lines, supplierIds } });
    prClose(); await loadPriceRequests(); prOpen(r.id);
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function prOpen(id) {
  try {
    const d = await api('/purchases/price-requests/' + encodeURIComponent(id));
    window._pr = d;
    const canValidate = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'DIRECTEUR_GENERAL'].includes(state.user.role);
    const open = d.status === 'OUVERTE' || d.status === 'COMPAREE';
    const waText = (c) => 'Bonjour ' + c.supplierName + ', merci de nous donner votre meilleur prix, délai et conditions de paiement pour (demande ' + d.number + ') : ' + d.lines.map(l => l.name + ' x ' + l.quantity + ' ' + l.unit).join(', ') + '.';
    const wa = (c) => { const n = String(c.supplierPhone || '').replace(/\D/g, ''), f = n.length === 9 ? '224' + n : n; return `https://wa.me/${f}?text=${encodeURIComponent(waText(c))}`; };
    prOverlay(`<h3>${esc(d.number)} — ${esc(d.title)}</h3><div class="desc"><b>${PR_ST[d.status] || esc(d.status)}</b> — ${esc(d.nextStep)}</div>
      <table><tr><th>Article</th><th>Quantité</th></tr>${d.lines.map(l => `<tr><td>${esc(l.sku)} — ${esc(l.name)}</td><td>${l.quantity} ${esc(l.unit)}</td></tr>`).join('')}</table>
      <h4 style="margin:12px 0 4px">Comparatif des offres</h4>
      <div style="overflow-x:auto"><table><thead><tr><th>Fournisseur</th><th>Total (GNF)</th><th>Délai</th><th>Paiement</th><th></th></tr></thead><tbody>${d.comparison.map(c => `<tr${d.chosenSupplierId === c.supplierId ? ' style="background:rgba(224,167,46,.18)"' : ''}>
        <td>${esc(c.supplierName)}${d.chosenSupplierId === c.supplierId ? ' ✔ retenu' : ''}</td>
        <td class="mono">${c.complete ? fmt(c.total) : '<i>en attente</i>'} ${c.cheapest ? '<span class="badge">moins cher</span>' : ''}</td>
        <td>${c.deliveryDays != null ? c.deliveryDays + ' j' : '—'} ${c.fastest ? '<span class="badge">plus rapide</span>' : ''}</td><td>${esc(c.paymentTerms || '—')}</td>
        <td style="white-space:nowrap">${open ? `<button class="btn small" onclick="prQuote('${esc(d.id)}','${esc(c.supplierId)}')">${c.complete ? 'Modifier' : 'Saisir les prix'}</button> <a class="btn small" style="text-decoration:none" target="_blank" rel="noopener" href="${wa(c)}">WhatsApp</a>` : ''}
        ${open && canValidate && c.complete ? `<button class="btn small gold" onclick="prValidate('${esc(d.id)}','${esc(c.supplierId)}')">Retenir</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      ${d.purchaseOrderId ? `<div class="msg ok">Bon de commande créé automatiquement. Retrouvez-le dans « Bons de commande » pour la réception.</div>` : ''}
      ${d.cancelReason ? `<div class="msg err">Annulée : ${esc(d.cancelReason)}</div>` : ''}
      <div id="pr-m"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" onclick="prPdf('${esc(d.id)}','${esc(d.number)}')">PDF à envoyer</button>
      ${open && canValidate ? `<button class="btn" onclick="prCancel('${esc(d.id)}')">Annuler la demande</button>` : ''}<button class="btn" onclick="prClose(); loadPriceRequests(); loadOrders(${canValidate})">Retour</button></div>`);
  } catch (e) { alert(e.message); }
}
async function prPdf(id, number) { await vtPdf('/purchases/price-requests/' + encodeURIComponent(id) + '/pdf', 'demande_prix_' + number); }
function prQuote(id, supplierId) {
  const d = window._pr, c = d.comparison.find(x => x.supplierId === supplierId);
  prOverlay(`<h3>Offre de ${esc(c.supplierName)}</h3><div class="desc">Saisissez le prix unitaire de chaque article, tel que reçu du fournisseur.</div>
    <table><tr><th>Article</th><th>Qté</th><th>Prix unitaire (GNF)</th></tr>${d.lines.map((l, i) => `<tr><td>${esc(l.name)}</td><td>${l.quantity} ${esc(l.unit)}</td><td><input id="pq-p${i}" type="number" min="0" step="any" value="${c.prices[i] && c.prices[i].unitPrice != null ? c.prices[i].unitPrice : ''}" style="width:120px"></td></tr>`).join('')}</table>
    <label>Délai de livraison (jours)</label><input id="pq-d" type="number" min="0" value="${c.deliveryDays != null ? c.deliveryDays : ''}">
    <label>Conditions de paiement</label><input id="pq-t" value="${esc(c.paymentTerms || '')}" placeholder="ex. comptant, 30 jours">
    <label>Remarques</label><input id="pq-n" value="${esc(c.notes || '')}">
    <div id="pr-m"></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn gold" onclick="prQuoteGo('${esc(id)}','${esc(supplierId)}')">Enregistrer l'offre</button><button class="btn" onclick="prOpen('${esc(id)}')">Retour</button></div>`);
}
async function prQuoteGo(id, supplierId) {
  const d = window._pr, m = document.getElementById('pr-m');
  const prices = d.lines.map((l, i) => ({ requestLineId: l.id, unitPrice: document.getElementById('pq-p' + i).value }));
  if (prices.some(p => p.unitPrice === '' || isNaN(Number(p.unitPrice)))) { m.innerHTML = '<div class="msg err">Saisissez le prix de chaque article.</div>'; return; }
  try {
    await api('/purchases/price-requests/' + encodeURIComponent(id) + '/quotes/' + encodeURIComponent(supplierId), { method: 'PUT', body: { prices: prices.map(p => ({ requestLineId: p.requestLineId, unitPrice: Number(p.unitPrice) })), deliveryDays: document.getElementById('pq-d').value === '' ? undefined : Number(document.getElementById('pq-d').value), paymentTerms: document.getElementById('pq-t').value, notes: document.getElementById('pq-n').value } });
    prOpen(id);
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function prValidate(id, supplierId) {
  const d = window._pr, c = d.comparison.find(x => x.supplierId === supplierId);
  const completes = d.comparison.filter(x => x.complete).length;
  let note = '';
  if (!c.cheapest || completes < 2) { note = prompt(!c.cheapest ? 'Ce n\'est pas l\'offre la moins chère. Motif du choix (obligatoire) :' : 'Une seule offre reçue. Justification (obligatoire) :') || ''; if (note.trim().length < 3) return; }
  else if (!confirm('Retenir ' + c.supplierName + ' et créer le bon de commande ?')) return;
  try {
    const r = await api('/purchases/price-requests/' + encodeURIComponent(id) + '/validate', { method: 'POST', body: { supplierId, note: note.trim() || undefined } });
    alert('Bon de commande ' + r.purchaseOrder.reference + ' créé.'); prOpen(id);
  } catch (e) { alert(e.message); }
}
async function prCancel(id) {
  const reason = prompt('Motif de l\'annulation (obligatoire) :'); if (!reason || reason.trim().length < 3) return;
  try { await api('/purchases/price-requests/' + encodeURIComponent(id) + '/cancel', { method: 'POST', body: { reason: reason.trim() } }); prOpen(id); } catch (e) { alert(e.message); }
}
async function loadSuppliers() {
  const box = document.getElementById('su-list');
  try {
    const list = await api('/suppliers');
    window._suppliers = list;
    box.innerHTML = list.length ? `<table><thead><tr><th>Nom</th><th>Contact</th><th>Téléphone</th><th>E-mail</th><th></th></tr></thead><tbody>${list.map(f => `<tr><td>${esc(f.name)}</td><td>${esc(f.contactName)}</td><td>${esc(f.phone)}</td><td>${esc(f.email)}</td><td><button class="btn small" onclick="editSupplier('${esc(f.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg></button></td></tr>`).join('')}</tbody></table>` : '<div class="desc">Aucun fournisseur.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function addSupplier() {
  const msg = document.getElementById('su-msg');
  const v = (i) => document.getElementById(i).value.trim();
  try {
    await api('/suppliers', { method: 'POST', body: { name: v('su-name'), ...(v('su-contact') ? { contactName: v('su-contact') } : {}), ...(v('su-phone') ? { phone: v('su-phone') } : {}), ...(v('su-email') ? { email: v('su-email') } : {}) } });
    renderPurchases();
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}


/* ---------------- ÉTATS DES BESOINS ---------------- */
let needLines = [];
let editingNeed = null;
async function renderNeeds() {
  needLines = []; editingNeed = null;
  root().innerHTML = `
    <div class="panel"><h3 id="nd-title"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg> Nouvel état des besoins</h3>
      <div class="desc">Pour demander à la hiérarchie des articles en rupture, des pièces à changer, du matériel… Vous pouvez charger automatiquement les articles sous le seuil.</div>
      <div class="grid-2">
        <div><label>Objet</label><input id="nd-obj" placeholder="Ex : Pièces de rechange — camion TRUCK-003" /></div>
        <div><label>Priorité</label><select id="nd-prio"><option value="NORMALE">Normale</option><option value="URGENTE">Urgente</option></select></div>
        <div><label>À l'attention de</label><input id="nd-to" placeholder="Directeur / Chef de site…" /></div>
        <div><label>Justification</label><input id="nd-just" placeholder="Pourquoi ce besoin ?" /></div>
      </div>
      <div id="nd-lines" style="margin-top:10px;"></div>
      <button class="btn small" onclick="addNeedLine()"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Ajouter une ligne</button>
      <button class="btn small" style="margin-left:6px;" onclick="loadNeedSuggestions()"><svg class="ic" aria-hidden="true"><use href="#i-package"/></svg> Charger les articles à commander</button>
      <div style="margin-top:10px;"><button class="btn gold" onclick="saveNeed()"><svg class="ic" aria-hidden="true"><use href="#i-save"/></svg> Enregistrer</button>
      <button class="btn small" id="nd-cancel" style="display:none;margin-left:6px;" onclick="renderNeeds()">Annuler la modification</button></div>
      <div id="nd-msg"></div>
    </div>
    ${['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role) ? `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg> Circuit de transmission</h3>
      <div class="desc">1) L'état des besoins est envoyé par e-mail aux Achats ; 2) après leur traitement, il est transmis à la comptabilité.</div>
      <div class="grid-2"><div><label>E-mails des Achats</label><input id="nd-mail-ach" placeholder="achats@entreprise.com" /></div><div><label>E-mails de la comptabilité</label><input id="nd-mail-cpt" placeholder="compta@entreprise.com" /></div></div>
      <button class="btn" onclick="saveNeedMails()">Enregistrer les destinataires</button><div id="nd-mmsg"></div></div>` : ''}
    <div class="panel"><h3>États des besoins</h3><div id="nd-list"><div class="empty">Chargement…</div></div></div>`;
  addNeedLine();
  loadNeeds();
  if (document.getElementById('nd-mail-ach')) api('/settings').then((all) => { const g = (k) => (all.find((x) => x.key === k) || {}).value || ''; document.getElementById('nd-mail-ach').value = g('NEEDS_PURCHASING_EMAILS'); document.getElementById('nd-mail-cpt').value = g('NEEDS_ACCOUNTING_EMAILS') || g('REPORT_ACCOUNTING_EMAILS'); }).catch(() => {});
}
async function saveNeedMails() {
  const m = document.getElementById('nd-mmsg');
  try {
    await api('/settings/NEEDS_PURCHASING_EMAILS', { method: 'PUT', body: { value: document.getElementById('nd-mail-ach').value } });
    await api('/settings/NEEDS_ACCOUNTING_EMAILS', { method: 'PUT', body: { value: document.getElementById('nd-mail-cpt').value } });
    m.innerHTML = '<div class="msg ok">Destinataires enregistrés.</div>';
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function drawNeedLines() {
  const box = document.getElementById('nd-lines');
  box.innerHTML = `<table><thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th>P.U. estimé</th><th>Observation</th><th></th></tr></thead><tbody>${needLines.map((l, i) => `
    <tr><td><input value="${esc(l.designation)}" oninput="needLines[${i}].designation=this.value" style="min-width:150px;" /></td>
    <td><input type="number" step="0.01" min="0" value="${esc(l.quantity)}" oninput="needLines[${i}].quantity=this.value" style="width:80px;" /></td>
    <td><input value="${esc(l.unit || '')}" oninput="needLines[${i}].unit=this.value" style="width:70px;" /></td>
    <td><input type="number" min="0" value="${esc(l.estimatedUnitPrice || '')}" oninput="needLines[${i}].estimatedUnitPrice=this.value" style="width:100px;" /></td>
    <td><input value="${esc(l.note || '')}" oninput="needLines[${i}].note=this.value" /></td>
    <td><button class="btn small" onclick="needLines.splice(${i},1);drawNeedLines()"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg></button></td></tr>`).join('')}</tbody></table>`;
}
function addNeedLine() { needLines.push({ designation: '', quantity: '1', unit: '', estimatedUnitPrice: '', note: '' }); drawNeedLines(); }
async function loadNeedSuggestions() {
  const msg = document.getElementById('nd-msg');
  try {
    const s = await api('/needs/suggestions?siteId=' + state.siteId);
    if (!s.length) { msg.innerHTML = '<div class="msg ok">Aucun article à commander pour le moment.</div>'; return; }
    needLines = needLines.filter(l => l.designation.trim()).concat(s.map(x => ({ itemId: x.itemId, designation: x.designation, quantity: String(x.quantity), unit: x.unit, estimatedUnitPrice: x.estimatedUnitPrice || '', note: x.note })));
    if (!document.getElementById('nd-obj').value.trim()) document.getElementById('nd-obj').value = 'Réapprovisionnement du stock';
    drawNeedLines();
    msg.innerHTML = `<div class="msg ok">${s.length} article(s) ajouté(s). Vérifiez les quantités avant d'enregistrer.</div>`;
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function saveNeed() {
  const msg = document.getElementById('nd-msg');
  try {
    const lines = needLines.filter(l => l.designation.trim()).map(l => ({
      ...(l.itemId ? { itemId: l.itemId } : {}), designation: l.designation.trim(), quantity: Number(l.quantity),
      ...(l.unit ? { unit: l.unit } : {}), ...(l.estimatedUnitPrice ? { estimatedUnitPrice: Number(l.estimatedUnitPrice) } : {}), ...(l.note ? { note: l.note } : {}),
    }));
    if (!lines.length) throw new Error('Ajoutez au moins une ligne avec une désignation.');
    const body = { title: document.getElementById('nd-obj').value.trim(), priority: document.getElementById('nd-prio').value,
      recipient: document.getElementById('nd-to').value.trim() || undefined, justification: document.getElementById('nd-just').value.trim() || undefined, lines };
    if (editingNeed) await api('/needs/' + editingNeed, { method: 'PATCH', body });
    else await api('/needs', { method: 'POST', body: { ...body, siteId: state.siteId } });
    renderNeeds();
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function loadNeeds() {
  const box = document.getElementById('nd-list');
  try {
    const list = await api('/needs?siteId=' + state.siteId);
    const st = { BROUILLON: 'Brouillon', ENVOYE: 'Envoyé aux Achats', APPROUVE: 'Approuvé', REJETE: 'Rejeté', SATISFAIT: 'Satisfait', TRANSMIS_COMPTA: 'Transmis à la comptabilité' };
    const admin = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role);
    const canEdit = (n) => n.status === 'BROUILLON' || state.user.role === 'SUPER_ADMIN';
    box.innerHTML = list.length ? `<table><thead><tr><th>N°</th><th>Objet</th><th>Priorité</th><th>Total est.</th><th>État</th><th>Actions</th></tr></thead><tbody>${list.map(n => `
      <tr><td class="mono">${esc(n.reference)}</td><td>${esc(n.title)}<div class="desc">${new Date(n.createdAt).toLocaleDateString('fr-FR')} • ${n.lines.length} ligne(s)${n.decisionNote ? ' • ' + esc(n.decisionNote) : ''}</div></td>
      <td>${n.priority === 'URGENTE' ? '<span class="badge bad">Urgente</span>' : 'Normale'}</td><td class="mono">${n.total ? fmt(n.total) : '—'}</td><td>${st[n.status] || esc(n.status)}</td>
      <td><button class="btn small" onclick="needPdf('${esc(n.id)}','${esc(n.reference)}')">PDF</button>
      <button class="btn small" onclick="needWhatsapp('${esc(n.id)}')">WhatsApp</button>
      <button class="btn small" onclick="needEmail('${esc(n.id)}','PURCHASING')"><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg> Aux Achats</button>
      <button class="btn small" onclick="needEmail('${esc(n.id)}','ACCOUNTING')" ${n.status === 'BROUILLON' || n.status === 'REJETE' ? 'disabled title="Envoyez d\'abord aux Achats"' : ''}><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg> À la comptabilité</button>
      ${canEdit(n) ? `<button class="btn small" onclick="editNeed('${esc(n.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg> Modifier</button>` : ''}
      ${admin ? `<select onchange="needStatus('${esc(n.id)}', this.value)"><option value="">État…</option><option value="ENVOYE">Envoyé</option><option value="APPROUVE">Approuvé</option><option value="REJETE">Rejeté</option><option value="SATISFAIT">Satisfait</option></select>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="desc">Aucun état des besoins.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function editNeed(id) {
  try {
    const n = await api('/needs/' + id);
    editingNeed = id;
    document.getElementById('nd-title').textContent = 'Modifier ' + n.reference;
    document.getElementById('nd-obj').value = n.title;
    document.getElementById('nd-prio').value = n.priority;
    document.getElementById('nd-to').value = n.recipient || '';
    document.getElementById('nd-just').value = n.justification || '';
    needLines = n.lines.map(l => ({ itemId: l.itemId || undefined, designation: l.designation, quantity: String(Number(l.quantity)), unit: l.unit || '', estimatedUnitPrice: l.estimatedUnitPrice ? String(Number(l.estimatedUnitPrice)) : '', note: l.note || '' }));
    drawNeedLines();
    document.getElementById('nd-cancel').style.display = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) { alert(e.message); }
}
async function needStatus(id, status) {
  if (!status) return;
  let note;
  if (status === 'REJETE') { note = prompt('Motif du rejet (obligatoire) :'); if (!note) return loadNeeds(); }
  try { await api('/needs/' + id + '/status', { method: 'POST', body: { status, ...(note ? { note } : {}) } }); loadNeeds(); } catch (e) { alert(e.message); loadNeeds(); }
}
async function needPdf(id, ref) {
  try {
    const blob = await api('/needs/' + id + '/pdf');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'etat_des_besoins_' + ref + '.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) { alert(e.message); }
}
async function needWhatsapp(id) {
  try { const w = await api('/needs/' + id + '/whatsapp'); w.links.forEach(l => window.open(l.url, '_blank')); } catch (e) { alert(e.message); }
}
async function needEmail(id, stage) {
  const who = stage === 'ACCOUNTING' ? 'la comptabilité' : 'les Achats';
  const to = prompt(`Adresse(s) e-mail de ${who} (séparées par des virgules).\nLaissez vide pour utiliser les adresses enregistrées :`, '');
  if (to === null) return;
  try {
    const r = await api('/needs/' + id + '/send-email', { method: 'POST', body: { to: to || undefined, stage } });
    alert(r.sent ? 'E-mail envoyé avec le PDF.' : ((r.message || 'Envoi e-mail non configuré sur le serveur (SMTP)') + " Rien n'a été envoyé : utilisez le PDF ou WhatsApp."));
    loadNeeds();
  } catch (e) { alert(e.message); }
}

/* ---------------- INVENTAIRE PHYSIQUE ---------------- */
async function loadCounts() {
  const box = document.getElementById('ic-list');
  if (!box) return;
  try {
    const list = await api('/inventory/counts?siteId=' + state.siteId);
    const st = { OPEN: 'En cours', VALIDATED: 'Validé', CANCELLED: 'Annulé' };
    box.innerHTML = list.length ? `<table><thead><tr><th>Date</th><th>Périmètre</th><th>Articles</th><th>État</th><th></th></tr></thead><tbody>${list.map(c => `
      <tr><td>${new Date(c.createdAt).toLocaleDateString('fr-FR')}</td><td>${esc(c.location || 'Tout le site')}</td><td class="mono">${c._count.lines}</td><td>${st[c.status] || esc(c.status)}</td>
      <td><button class="btn small" onclick="openCount('${esc(c.id)}')">Ouvrir</button></td></tr>`).join('')}</tbody></table>` : '<div class="desc">Aucun inventaire.</div>';
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function startCount() {
  const msg = document.getElementById('ic-msg');
  try {
    const loc = document.getElementById('ic-loc').value.trim();
    const c = await api('/inventory/counts', { method: 'POST', body: { siteId: state.siteId, ...(loc ? { location: loc } : {}) } });
    msg.innerHTML = '<div class="msg ok">Inventaire démarré : stock théorique figé.</div>';
    await loadCounts();
    openCount(c.id);
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
let currentCount = null;
async function openCount(id) {
  const box = document.getElementById('ic-detail');
  try {
    const c = await api('/inventory/counts/' + id);
    currentCount = c;
    const open = c.status === 'OPEN';
    box.innerHTML = `
      <h4 style="margin-top:14px;">Inventaire ${esc(c.location || 'Tout le site')} — ${esc(c.status)}</h4>
      <div class="desc">${c.summary.counted}/${c.summary.articles} comptés • ${c.summary.withVariance} écart(s) • valeur des écarts : <b>${fmt(c.summary.totalVarianceValue)} GNF</b></div>
      <table><thead><tr><th>Code</th><th>Article</th><th>Théorique</th><th>Compté</th><th>Écart</th></tr></thead><tbody>${c.lines.map(l => `
        <tr><td>${esc(l.sku)}</td><td>${esc(l.name)}</td><td class="mono">${fmt(l.expected)} ${esc(l.unit)}</td>
        <td>${open ? `<input type="number" step="0.01" min="0" data-item="${esc(l.itemId)}" value="${l.counted ?? ''}" style="width:110px;" />` : `<span class="mono">${l.counted ?? '—'}</span>`}</td>
        <td class="mono" style="color:${l.variance ? 'var(--danger)' : 'inherit'}">${l.variance === null ? '—' : (l.variance > 0 ? '+' : '') + fmt(l.variance)}</td></tr>`).join('')}</tbody></table>
      ${open ? `<button class="btn gold" onclick="saveCount('${esc(c.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-save"/></svg> Enregistrer le comptage</button>
        <button class="btn" style="margin-left:8px;" onclick="validateCount('${esc(c.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg> Valider (ajuste le stock)</button>
        <button class="btn" style="margin-left:8px; background:var(--danger);" onclick="cancelCount('${esc(c.id)}')">Annuler</button>` : ''}`;
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function saveCount(id, silent) {
  const lines = [...document.querySelectorAll('#ic-detail input[data-item]')]
    .filter(i => i.value !== '')
    .map(i => ({ itemId: i.dataset.item, countedQuantity: Number(i.value) }));
  await api('/inventory/counts/' + id + '/lines', { method: 'POST', body: { lines } });
  if (!silent) openCount(id);
}
async function validateCount(id) {
  const msg = document.getElementById('ic-msg');
  const reason = prompt('Motif de la validation (obligatoire), ex : inventaire mensuel :');
  if (!reason) return;
  try {
    await saveCount(id, true);
    const r = await api('/inventory/counts/' + id + '/validate', { method: 'POST', body: { reason } });
    msg.innerHTML = `<div class="msg ok">Inventaire validé : ${r.linesAdjusted} article(s) ajusté(s), valeur des écarts ${fmt(r.totalVarianceValue)} GNF.</div>`;
    renderStock();
  } catch (e) { msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function cancelCount(id) {
  const reason = prompt("Motif de l'annulation (obligatoire) :");
  if (!reason) return;
  try {
    await api('/inventory/counts/' + id + '/cancel', { method: 'POST', body: { reason } });
    renderStock();
  } catch (e) { document.getElementById('ic-msg').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ---------------- RAPPORT JOURNALIER ---------------- */
let dailyText = '';
let dailyEmails = '';
let dailyAccEmails = '';
let dailyKind = 'TRUCK';
function setDailyKind(k) { dailyKind = k; renderDaily(); }
async function renderDaily() {
  const today = new Date().toISOString().slice(0, 10);
  const canEdit = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role);
  let numbers = '';
  try {
    const all = await api('/settings');
    numbers = (all.find(s => s.key === 'REPORT_WHATSAPP_NUMBERS') || {}).value || '';
    dailyEmails = (all.find(s => s.key === 'REPORT_EMAIL_RECIPIENTS') || {}).value || '';
    dailyAccEmails = (all.find(s => s.key === 'REPORT_ACCOUNTING_EMAILS') || {}).value || '';
  } catch (e) {}
  root().innerHTML = `
    <div class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg> Rapports journaliers</h3>
      <div class="desc">Tous les rapports du jour, classés par dossier.</div>
      ${syTabs(DAILY_TABS, dailyTab(), 'setDailyTab')}
      <div class="grid-2">
        <div><label>Date</label><input id="d-date" type="date" value="${today}" onchange="loadDaily()" /></div>
      </div>
      <div id="d-body"><div class="empty">Chargement…</div></div>
    </div>
    ${canEdit ? `<div class="panel">
      <h3><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg> Hiérarchie — destinataires du rapport</h3>
      <label>E-mails de la hiérarchie (séparés par des virgules)</label>
      <input id="d-emails" value="${esc(dailyEmails)}" placeholder="chef@entreprise.com, directeur@entreprise.com" />
      <label>E-mails de la comptabilité (séparés par des virgules)</label>
      <input id="d-acc-emails" value="${esc(dailyAccEmails)}" placeholder="compta@entreprise.com" />
      <label>Numéros WhatsApp (utilisés uniquement pour les États des besoins)</label>
      <input id="d-numbers" value="${esc(numbers)}" placeholder="+224620000000, +224621000000" />
      <button class="btn gold" onclick="saveDailyNumbers()">Enregistrer</button>
      <div id="d-nmsg"></div>
    </div>` : ''}`;
  loadDaily();
}
