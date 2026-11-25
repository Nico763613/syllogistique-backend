async function vtLoadCatalogue() {
  const box = document.getElementById('vt-cat'); if (!box) return;
  try {
    const list = await api('/sales/tariffs?siteId=' + encodeURIComponent(state.siteId || ''));
    const act = vtCanAct() || ['ADMIN_LOGISTIQUE'].includes(state.user.role), hasCost = list.some((x) => x.cost !== undefined);
    box.innerHTML = `<div style="overflow:auto"><table><tr><th>Code</th><th>Article</th><th>Unité</th><th>Stock</th>${hasCost ? '<th>Coût d\'achat</th><th>Marge</th>' : ''}<th>Prix de vente (GNF)</th>${act ? '<th></th>' : ''}</tr>${list.map((x) => `<tr><td>${esc(x.sku)}</td><td>${esc(x.name)}</td><td>${esc(x.unit)}</td><td class="mono">${fmt(x.currentQuantity)}</td>${hasCost ? `<td class="mono">${x.cost == null ? '—' : fmt(Math.round(x.cost))}</td><td class="mono">${x.cost && x.salePrice ? Math.round(((x.salePrice - x.cost) * 100) / x.salePrice) + ' %' : '—'}</td>` : ''}<td>${act ? `<input id="tf-${esc(x.id)}" type="number" min="0" value="${x.salePrice == null ? '' : x.salePrice}" style="width:110px">` : (x.salePrice == null ? '—' : fmt(x.salePrice))}</td>${act ? `<td><button class="btn small" onclick="vtSavePrice('${esc(x.id)}')">Enregistrer</button></td>` : ''}</tr>`).join('')}</table></div>`;
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function vtSavePrice(id) {
  const v = document.getElementById('tf-' + id).value;
  if (v === '' || isNaN(Number(v))) { alert('Saisissez un prix valide.'); return; }
  const reason = prompt('Motif de la modification du prix (facultatif) :') || '';
  try { await api('/sales/tariffs/' + encodeURIComponent(id), { method: 'POST', body: { salePrice: Number(v), reason } }); vtLoadCatalogue(); } catch (e) { alert(e.message); }
}
// Rapport commercial (PDF / Excel) de la période affichée dans le tableau de bord
async function vtReport(fmtType) {
  try {
    const pd = VT_DASH, t0 = new Date(), iso = (d) => d.toISOString().slice(0, 10);
    let from = '', to = '';
    if (pd.period === 'TODAY') { from = to = iso(t0); } else if (pd.period === 'WEEK') { const d = new Date(t0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); from = iso(d); to = iso(t0); } else if (pd.period === 'CUSTOM') { from = pd.from; to = pd.to; } else { from = iso(new Date(t0.getFullYear(), t0.getMonth(), 1)); to = iso(t0); }
    const blob = await api('/sales/reports/' + fmtType + '?siteId=' + encodeURIComponent(state.siteId || '') + (from ? '&from=' + from : '') + (to ? '&to=' + to : ''));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rapport_commercial_' + (from || 'debut') + '_' + (to || 'jour') + '.' + fmtType; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) { alert(e.message); }
}
// Création d'un client / prospect avec contrôle des doublons (nom, téléphone)
async function vtAddCustomer(force) {
  const v = (id) => (document.getElementById(id).value || '').trim(), m = document.getElementById('cu-m');
  if (!v('cu-n')) { m.innerHTML = '<div class="msg err">Indiquez le nom du client.</div>'; return; }
  try {
    await api('/customers', { method: 'POST', body: { siteId: state.siteId, name: v('cu-n'), phone: v('cu-p') || undefined, contactName: v('cu-c') || undefined, address: v('cu-a') || undefined, kind: v('cu-k'), force: force || undefined } });
    renderVentes();
  } catch (e) {
    if (/existe peut-être déjà/.test(e.message || '')) { if (confirm(e.message + '\n\nCréer quand même ?')) return vtAddCustomer(true); }
    else m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  }
}
async function vtSetKind(id, kind) {
  try { await api('/customers/' + encodeURIComponent(id), { method: 'PATCH', body: { kind } }); renderVentes(); } catch (e) { alert(e.message); }
}
// Livraison (totale ou partielle) : quantités par ligne, réceptionnaire, lieu ; génère le bon de livraison numéroté et la sortie de stock
async function vtDeliver(orderId) {
  try {
    const o = await api('/sales/orders/' + encodeURIComponent(orderId));
    const rows = (o.lines || []).map((l) => ({ l, rest: Number(l.quantityOrdered) - Number(l.quantityDelivered) })).filter((r) => r.rest > 0);
    if (!rows.length) { alert('Tout est déjà livré.'); return; }
    const old = document.getElementById('dl-ov'); if (old) old.remove();
    const ov = document.createElement('div'); ov.id = 'dl-ov'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,25,45,.55);z-index:90;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto';
    ov.innerHTML = `<div class="panel" style="max-width:560px;width:100%;max-height:100%;overflow:auto"><h3>Livraison — ${esc(o.reference)}</h3><div class="desc">Indiquez les quantités réellement livrées (0 pour ne pas livrer une ligne). Le stock sort à la validation.</div>
      <table><tr><th>Article</th><th>Reste</th><th>Livré maintenant</th></tr>${rows.map((r, i) => `<tr><td>${esc((r.l.item && r.l.item.name) || 'Article')}</td><td>${r.rest}</td><td><input id="dl-q${i}" type="number" min="0" max="${r.rest}" value="${r.rest}" style="width:90px"></td></tr>`).join('')}</table>
      <label style="margin-top:8px">Réceptionnaire</label><input id="dl-rc" autocomplete="off">
      <label>Lieu de livraison</label><input id="dl-pl" autocomplete="off"><label>Observations</label><input id="dl-ob" autocomplete="off">
      <div id="dl-m"></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn gold" onclick="vtDeliverGo('${esc(orderId)}', ${rows.length})">Valider la livraison</button></div></div>`;
    window._dlRows = rows.map((r) => r.l.id);
    document.body.appendChild(ov);
  } catch (e) { alert(e.message); }
}
async function vtDeliverGo(orderId, n) {
  const m = document.getElementById('dl-m'), v = (id) => (document.getElementById(id).value || '').trim();
  const lines = []; for (let i = 0; i < n; i++) { const q = Number(document.getElementById('dl-q' + i).value); if (q < 0 || isNaN(q)) { m.innerHTML = '<div class="msg err">Quantité invalide.</div>'; return; } if (q > 0) lines.push({ lineId: window._dlRows[i], quantityDelivered: q }); }
  if (!lines.length) { m.innerHTML = '<div class="msg err">Indiquez au moins une quantité à livrer.</div>'; return; }
  try {
    const r = await api('/sales/orders/' + encodeURIComponent(orderId) + '/deliver', { method: 'POST', body: { lines, receiverName: v('dl-rc') || undefined, place: v('dl-pl') || undefined, observations: v('dl-ob') || undefined } });
    const ov = document.getElementById('dl-ov'); if (ov) ov.remove();
    if (r && r.deliveryNote) { await vtPdf('/sales/delivery-notes/' + encodeURIComponent(r.deliveryNote.id) + '/pdf', r.deliveryNote.number); }
    renderView(state.view);
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function vtPdf(path, name) {
  try { const blob = await api(path); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); } catch (e) { alert(e.message); }
}
// Bon de livraison numéroté de la dernière livraison ; à défaut (commande livrée avant cette fonction), état de livraison de la commande
async function vtBl(orderId, ref) {
  try {
    const list = await api('/sales/orders/' + encodeURIComponent(orderId) + '/delivery-notes');
    if (list && list.length) { await vtPdf('/sales/delivery-notes/' + encodeURIComponent(list[0].id) + '/pdf', list[0].number); if (list.length > 1) alert('Dernier bon de livraison téléchargé (' + list.length + ' livraisons sur cette commande).'); }
    else await vtPdf('/sales/orders/' + encodeURIComponent(orderId) + '/delivery-note', 'livraison_' + ref);
  } catch (e) { alert(e.message); }
}
// Reçu du dernier encaissement enregistré sur la facture (un reçu par paiement)
async function vtReceipt(invoiceId) {
  try {
    const list = (await api('/payments?salesInvoiceId=' + encodeURIComponent(invoiceId))).filter((p) => p.direction === 'IN');
    if (!list.length) { alert('Aucun encaissement enregistré sur cette facture.'); return; }
    const p = list[0]; await vtPdf('/sales/payments/' + encodeURIComponent(p.id) + '/receipt', 'recu_' + new Date(p.paymentDate).toISOString().slice(0, 10));
    if (list.length > 1) alert('Reçu du dernier paiement téléchargé (' + list.length + ' paiements sur cette facture).');
  } catch (e) { alert(e.message); }
}
async function vtDo(fn) { try { await fn(); renderView(state.view); } catch (e) { alert(e.message); } }
function vtCashOk(id, needNote) {
  const note = prompt(needNote ? 'Il y a un écart. Justification (obligatoire) :' : 'Observation (facultatif) :', ''); if (note === null) return;
  vtDo(() => api('/cash-sessions/' + id + '/validate', { method: 'POST', body: note.trim() ? { note: note.trim() } : {} }));
}
function vtCashNo(id) { const note = prompt('Motif du rejet (obligatoire) :', ''); if (note === null) return; vtDo(() => api('/cash-sessions/' + id + '/reject', { method: 'POST', body: { note } })); }
function vtCashOps(id) { if (!confirm('Valider définitivement cette caisse ? Elle passe à la Comptabilité.')) return; vtDo(() => api('/cash-sessions/' + id + '/ops-validate', { method: 'POST', body: {} })); }
function vtRet(id, ok) {
  if (ok) { if (!confirm('Valider ce retour ?')) return; return vtDo(() => api('/sales/returns/' + id + '/validate', { method: 'POST', body: {} })); }
  const note = prompt('Motif du rejet :', ''); if (note === null) return; vtDo(() => api('/sales/returns/' + id + '/reject', { method: 'POST', body: { note } }));
}
/* ---------- Caisse (Caissier) : Encaisser · Ma caisse · Factures · Historique ---------- */
let csTab = 'encaisser', csInvoice = '';
const CS_TABS = [['encaisser', 'Encaisser'], ['caisse', 'Ma caisse'], ['factures', 'Factures'], ['histo', 'Historique']];
const CS_METHODS = [['CASH', 'Espèces'], ['MOBILE_MONEY', 'Mobile money'], ['ORANGE_MONEY', 'Orange Money'], ['BANK_TRANSFER', 'Virement']];
async function renderCaisse() {
  const [cur, invs, hist] = await Promise.all([api('/cash-sessions/current'), api('/sales/invoices?siteId=' + encodeURIComponent(state.siteId || '')), api('/cash-sessions')]);
  const open = (invs || []).filter((i) => ['UNPAID', 'PARTIALLY_PAID'].includes(i.status)).map((i) => ({ ...i, rest: Math.max(0, Number(i.totalAmount) - Number(i.amountPaid || 0)), age: Math.max(0, Math.floor((Date.now() - new Date(i.invoiceDate)) / 864e5)) })).filter((i) => i.rest > 0);
  window._csInv = open; window._csCur = cur;
  const bar = `<div class="dp-tabs" id="dp-bar">${CS_TABS.map(([k, t]) => `<button class="${csTab === k ? 'on' : ''}" onclick="csTab='${k}';renderCaisse()">${t}${k === 'factures' && open.length ? ' (' + open.length + ')' : ''}</button>`).join('')}</div>`;
  const dd = (x) => new Date(x).toLocaleDateString('fr-FR'), g = (n) => fmt(Math.round(Number(n) || 0));
  const noSession = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-archive"/></svg> Ouvrir ma caisse</h3><div class="desc">Vous devez ouvrir votre caisse du jour avant d'encaisser des espèces.</div><label>Fonds de départ (GNF)</label><input id="cs-float" type="number" inputmode="numeric" value="0"><div id="cs-msg"></div><button class="btn gold" style="min-height:48px;margin-top:10px" onclick="csOpen()">Ouvrir ma caisse</button></div>`;
  let body = '';
  if (csTab === 'encaisser') {
    body = !cur ? noSession : `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg> Encaisser un règlement</h3>
      <label>Facture</label><select id="cs-inv" onchange="csPick()"><option value="">— Choisir une facture —</option>${open.map((i) => `<option value="${esc(i.id)}" ${csInvoice === i.id ? 'selected' : ''}>${esc(i.reference)} · ${esc(i.customer && i.customer.name)} · reste ${g(i.rest)} GNF</option>`).join('')}</select>
      <label>Montant reçu (GNF)</label><input id="cs-amt" type="number" inputmode="numeric" min="1" placeholder="Montant">
      <label>Mode de paiement</label><select id="cs-met" onchange="csMet()">${CS_METHODS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
      <div id="cs-refbox" style="display:none"><label>N° de transaction (obligatoire hors espèces)</label><input id="cs-ref" placeholder="Ex. numéro Orange Money"></div>
      <div id="cs-msg"></div><button class="btn gold" style="min-height:52px;width:100%;margin-top:12px;font-size:14px" onclick="csPay()"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Enregistrer l'encaissement</button><div id="cs-receipt"></div></div>`;
    if (cur) setTimeout(csPick, 0);
  } else if (csTab === 'caisse') {
    if (!cur) body = noSession; else {
      const m = cur.summary || {};
      const tile = (n, l, c) => `<div style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:700;color:${c || 'var(--navy)'}">${g(n)}</div><div style="font-size:12px;color:var(--muted)">${l}</div></div>`;
      body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-archive"/></svg> Ma caisse — ouverte le ${dd(cur.openedAt)} <span class="badge ok">Ouverte</span></h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:12px 0">${tile(cur.openingFloat, 'Fonds de départ')}${tile(m.cashCollected, 'Espèces encaissées')}${tile(m.expenses, 'Dépenses de caisse')}${tile(m.expectedCash, 'Espèces attendues en caisse')}</div>
        ${Object.keys(m.collectedByMethod || {}).length ? '<div class="desc">Encaissé par mode : ' + Object.entries(m.collectedByMethod).map(([k, v]) => (CS_METHODS.find((x) => x[0] === k) || [k, k])[1] + ' ' + g(v) + ' GNF').join(' · ') + '</div>' : ''}</div>
        <div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-minus"/></svg> Dépense de caisse</h3><label>Montant (GNF)</label><input id="cs-eamt" type="number" inputmode="numeric" min="1"><label>Motif (obligatoire)</label><input id="cs-ereason" placeholder="Ex. transport, achat fournitures"><div id="cs-emsg"></div><button class="btn" style="min-height:48px;margin-top:8px" onclick="csExpense('${esc(cur.id)}')">Enregistrer la dépense</button></div>
        <div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg> Clôturer ma caisse</h3><div class="desc">Comptez les espèces présentes dans la caisse. L'écart avec le montant attendu est calculé.</div><label>Espèces comptées (GNF)</label><input id="cs-count" type="number" inputmode="numeric" min="0"><label>Observation (facultatif)</label><input id="cs-note"><div id="cs-cmsg"></div><button class="btn gold" style="min-height:48px;margin-top:8px" onclick="csClose('${esc(cur.id)}')">Clôturer la caisse</button></div>`;
    }
  } else if (csTab === 'factures') {
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-receipt"/></svg> Factures à encaisser <span class="badge ${open.length ? 'warn' : 'ok'}">${open.length}</span></h3><div style="overflow:auto"><table><tr><th>Facture</th><th>Client</th><th>Total</th><th>Reste à payer</th><th>Ancienneté</th><th></th></tr>${open.map((i) => `<tr><td>${esc(i.reference)}<div style="font-size:12px;color:var(--muted)">${dd(i.invoiceDate)}</div></td><td>${esc(i.customer && i.customer.name)}</td><td class="mono">${g(i.totalAmount)}</td><td class="mono"><b>${g(i.rest)}</b> GNF${i.status === 'PARTIALLY_PAID' ? ' <span class="badge warn">Partielle</span>' : ''}</td><td><span class="badge ${i.age > 30 ? 'bad' : i.age > 7 ? 'warn' : 'ok'}">${i.age} j</span></td><td><button class="btn small gold" onclick="csInvoice='${esc(i.id)}';csTab='encaisser';renderCaisse()">Encaisser</button></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">Aucune facture à encaisser.</div></td></tr>'}</table></div></div>`;
  } else {
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-archive"/></svg> Historique de mes caisses</h3><div style="overflow:auto"><table><tr><th>Ouverte le</th><th>État</th><th>Attendu</th><th>Compté</th><th>Écart</th></tr>${(hist || []).map((c) => { const gap = c.gapAmount == null ? null : Number(c.gapAmount); return `<tr><td>${dd(c.openedAt)}</td><td>${c.validatedBy ? '<span class="badge ok">Validée</span>' : c.closedAt ? '<span class="badge info">Clôturée — à vérifier</span>' : '<span class="badge warn">Ouverte</span>'}</td><td class="mono">${c.expectedCash == null ? '—' : g(c.expectedCash)}</td><td class="mono">${c.countedCash == null ? '—' : g(c.countedCash)}</td><td>${gap == null ? '—' : gap === 0 ? '<span class="badge ok">0</span>' : '<span class="badge bad">' + (gap > 0 ? '+' : '') + g(gap) + '</span>'}</td></tr>`; }).join('') || '<tr><td colspan="5"><div class="empty">Aucune caisse.</div></td></tr>'}</table></div></div>`;
  }
  root().innerHTML = bar + body;
}
function csPick() {
  const sel = document.getElementById('cs-inv'); if (!sel) return;
  const i = (window._csInv || []).find((x) => x.id === sel.value); csInvoice = sel.value;
  const a = document.getElementById('cs-amt'); if (a && i) a.value = Math.round(i.rest);
}
function csMet() { const m = document.getElementById('cs-met').value; document.getElementById('cs-refbox').style.display = m === 'CASH' ? 'none' : ''; }
async function csOpen() { const m = document.getElementById('cs-msg'); try { await api('/cash-sessions/open', { method: 'POST', body: { openingFloat: Math.round(Number(document.getElementById('cs-float').value) || 0) } }); renderCaisse(); } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; } }
async function csPay() {
  if (window._csBusy) return;
  window._csBusy = true;
  if (!window._csOp) window._csOp = (crypto.randomUUID ? crypto.randomUUID() : 'op-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  const m = document.getElementById('cs-msg'), id = document.getElementById('cs-inv').value, amt = Number(document.getElementById('cs-amt').value), met = document.getElementById('cs-met').value, ref = (document.getElementById('cs-ref').value || '').trim();
  const inv = (window._csInv || []).find((x) => x.id === id);
  try {
    if (!inv) throw new Error('Choisissez une facture.');
    if (!(amt > 0)) throw new Error('Saisissez le montant reçu.');
    if (amt > inv.rest) throw new Error('Le montant dépasse le reste à payer (' + fmt(Math.round(inv.rest)) + ' GNF).');
    if (met !== 'CASH' && !ref) throw new Error('Indiquez le numéro de transaction.');
    await api('/payments', { method: 'POST', body: { direction: 'IN', method: met, amount: amt, paymentDate: new Date().toISOString(), salesInvoiceId: id, clientOpId: window._csOp, ...(ref ? { reference: ref, externalRef: ref } : {}) } });
    window._csOp = null;
    const left = inv.rest - amt, msg = `Bonjour ${inv.customer && inv.customer.name}, nous avons bien reçu votre règlement de ${fmt(Math.round(amt))} GNF pour la facture ${inv.reference}. ${left > 0 ? 'Reste à payer : ' + fmt(Math.round(left)) + ' GNF.' : 'Facture soldée.'} Merci. — SYL LOGISTIQUE`;
    const phone = String((inv.customer && inv.customer.phone) || '').replace(/\D/g, ''), full = phone.length === 9 ? '224' + phone : phone;
    csInvoice = '';
    await renderCaisse();
    document.getElementById('cs-receipt').innerHTML = `<div class="msg ok" style="margin-top:12px"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Encaissement enregistré : ${fmt(Math.round(amt))} GNF — ${esc(inv.reference)}. ${left > 0 ? 'Reste ' + fmt(Math.round(left)) + ' GNF.' : 'Facture soldée.'}</div><a class="btn" style="margin-top:8px;text-decoration:none;display:inline-block" target="_blank" rel="noopener" href="https://wa.me/${esc(full)}?text=${encodeURIComponent(msg)}">Envoyer le reçu par WhatsApp</a>`;
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function csExpense(id) {
  const m = document.getElementById('cs-emsg'), amount = Math.round(Number(document.getElementById('cs-eamt').value)), reason = document.getElementById('cs-ereason').value.trim();
  try { if (!(amount > 0)) throw new Error('Saisissez le montant.'); if (reason.length < 2) throw new Error('Indiquez le motif.'); await api('/cash-sessions/' + id + '/expenses', { method: 'POST', body: { amount, reason } }); renderCaisse(); } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function csClose(id) {
  const m = document.getElementById('cs-cmsg'), v = document.getElementById('cs-count').value;
  try {
    if (v === '' || Number(v) < 0) throw new Error('Saisissez les espèces comptées.');
    if (!confirm('Clôturer la caisse ? Vous ne pourrez plus encaisser avant d\'en rouvrir une.')) return;
    const r = await api('/cash-sessions/' + id + '/close', { method: 'POST', body: { countedCash: Math.round(Number(v)), note: document.getElementById('cs-note').value.trim() || undefined } });
    const gap = Number(r.gapAmount || 0); csTab = 'histo'; await renderCaisse();
    document.getElementById('dp-bar').insertAdjacentHTML('afterend', `<div class="msg ${gap === 0 ? 'ok' : 'err'}">Caisse clôturée. ${gap === 0 ? 'Aucun écart.' : 'Écart : ' + (gap > 0 ? '+' : '') + fmt(gap) + ' GNF.'} Elle sera vérifiée par le Responsable commercial.</div>`);
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function cpBillClient(id) {
  document.querySelectorAll('.cp-bt').forEach((c) => { c.checked = c.dataset.c === id && !c.disabled; });
  document.getElementById('cp-bc').value = id; cpBillSel();
}
function cpBillSel() {
  const ck = [...document.querySelectorAll('.cp-bt:checked')];
  const cs = [...new Set(ck.map((c) => c.dataset.c).filter(Boolean))];
  if (cs.length === 1) document.getElementById('cp-bc').value = cs[0];
  const msgBox = document.getElementById('cp-bmsg'); if (msgBox) msgBox.innerHTML = cs.length > 1 ? '<div class="msg err">Ces trajets appartiennent à plusieurs clients : facturez un client à la fois.</div>' : '';
  const t = ck.reduce((a, c) => a + Number(c.dataset.t), 0), p = Number(document.getElementById('cp-bp').value) || 0;
  document.getElementById('cp-bsum').textContent = ck.length ? ck.length + ' trajet(s) · ' + (Math.round(t * 10) / 10) + ' t · ' + (p ? fmt(Math.round(t * p)) + ' GNF' : 'prix par tonne manquant') : 'Aucun trajet sélectionné.';
}
async function cpBill() {
  const m = document.getElementById('cp-bmsg'), ids = [...document.querySelectorAll('.cp-bt:checked')].map((c) => c.value), cid = document.getElementById('cp-bc').value, p = Number(document.getElementById('cp-bp').value);
  try {
    if (!ids.length) throw new Error('Cochez au moins un trajet.');
    if (!cid) throw new Error('Choisissez le client.');
    if (!(p > 0)) throw new Error('Indiquez le prix par tonne.');
    if (!confirm('Créer la facture pour ' + ids.length + ' trajet(s) ?')) return;
    const inv = await api('/sales/transport/invoice', { method: 'POST', body: { customerId: cid, tripIds: ids, pricePerTon: p } });
    await renderCompta();
    document.getElementById('dp-bar').insertAdjacentHTML('afterend', '<div class="msg ok"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Facture ' + esc(inv.reference) + ' créée : ' + fmt(Math.round(Number(inv.totalAmount))) + ' GNF. Elle est visible dans Ventes › Factures et à encaisser à la Caisse.</div>');
  } catch (e) { m.innerHTML = '<div class="msg err">' + esc(e.message) + '</div>'; }
}
/* ---------- Comptabilité : À traiter · Reçus · Synthèse · Historique ---------- */
let cpTab = 'traiter', cpPeriod = 'month';
const CP_TABS = [['traiter', 'À traiter'], ['recus', 'Reçus'], ['synthese', 'Synthèse'], ['histo', 'Historique'], ['facturer', 'À facturer']];
async function renderCompta() {
  const role = state.user.role, ro = role === 'DIRECTEUR_GENERAL'; // le Directeur général ne voit que la synthèse, sans aucune action
  if (ro) cpTab = 'synthese';
  const rows = await api('/driver-admin/expenses?siteId=' + encodeURIComponent(state.siteId || ''));
  window._cpRows = rows;
  const pend = rows.filter((e) => e.status === 'PENDING'), unpaid = rows.filter((e) => e.status === 'APPROVED' && !e.paidAt), noPaper = rows.filter((e) => e.status === 'APPROVED' && !e.receiptCheckedAt);
  const nb = { traiter: pend.filter((e) => e.sheetStep === 'VALIDATED').length + unpaid.length, recus: noPaper.length };
  const bar = ro ? '' : `<div class="dp-tabs" id="dp-bar">${CP_TABS.map(([k, t]) => `<button class="${cpTab === k ? 'on' : ''}" onclick="cpTab='${k}';renderCompta()">${t}${nb[k] ? ' (' + nb[k] + ')' : ''}</button>`).join('')}</div>`;
  const dd = (x) => new Date(x).toLocaleDateString('fr-FR');
  const nat = (e) => esc(DRV_EXP[e.category] || e.category) + (e.description ? '<div style="font-size:12px;color:var(--muted)">' + esc(e.description) + '</div>' : '');
  const who = (e) => '<b>' + esc(e.driver) + '</b>' + (e.vehicle ? '<div style="font-size:12px;color:var(--muted)">' + esc(e.vehicle) + '</div>' : '');
  const tbl = (head, body) => `<div style="overflow:auto"><table><tr>${head.map((h) => '<th>' + h + '</th>').join('')}</tr>${body || '<tr><td colspan="' + head.length + '"><div class="empty">Rien à afficher.</div></td></tr>'}</table></div>`;
  let body = '';
  if (cpTab === 'traiter') {
    const ready = pend.filter((e) => e.sheetStep === 'VALIDATED'), blocked = pend.filter((e) => e.sheetStep !== 'VALIDATED');
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-receipt"/></svg> Dépenses à traiter <span class="badge ${ready.length ? 'warn' : 'ok'}">${ready.length}</span></h3><div class="desc">Fiches déjà validées par le Responsable des opérations.</div>
      ${tbl(['Date', 'Chauffeur', 'Nature', 'Montant', 'Reçu scanné', 'Reçu papier', ''], ready.map((e) => `<tr><td>${dd(e.date)}</td><td>${who(e)}</td><td>${nat(e)}</td><td class="mono"><b>${fmt(e.amount)}</b> GNF</td><td>${receiptLink(e.receiptUrl)}</td><td>${e.receiptCheckedAt ? '<span class="badge ok"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Conforme</span>' : '<span class="badge warn">Non reçu</span>'}</td><td style="white-space:nowrap"><button class="btn small gold" onclick="decideExpense('${esc(e.id)}','APPROVED')"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Valider</button> <button class="btn small" onclick="decideExpense('${esc(e.id)}','REJECTED')"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg> Refuser</button></td></tr>`).join(''))}</div>
      <div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg> Validées à payer <span class="badge ${unpaid.length ? 'warn' : 'ok'}">${unpaid.length}</span></h3>
      ${tbl(['Date', 'Chauffeur', 'Nature', 'Montant', ''], unpaid.map((e) => `<tr><td>${dd(e.date)}</td><td>${who(e)}</td><td>${nat(e)}</td><td class="mono"><b>${fmt(e.amount)}</b> GNF</td><td><button class="btn small gold" onclick="cpPay('${esc(e.id)}')">Marquer comme payée</button></td></tr>`).join(''))}</div>
      ${blocked.length ? `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> En attente de validation de la fiche <span class="badge info">${blocked.length}</span></h3><div class="desc">Ces dépenses se débloqueront quand le Responsable des opérations aura validé la fiche du chauffeur.</div>
      ${tbl(['Date', 'Chauffeur', 'Nature', 'Montant', 'Fiche'], blocked.map((e) => `<tr style="opacity:.75"><td>${dd(e.date)}</td><td>${who(e)}</td><td>${nat(e)}</td><td class="mono">${fmt(e.amount)} GNF</td><td>${stepBadge(e.sheetStep)}<div style="font-size:12px;color:var(--muted)">Fiche pas encore validée</div></td></tr>`).join(''))}</div>` : ''}`;
  } else if (cpTab === 'facturer') {
    const [bu, cust] = await Promise.all([api('/sales/transport/unbilled?siteId=' + encodeURIComponent(state.siteId || '')), api('/customers')]);
    window._cpBill = bu;
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Trajets validés à facturer <span class="badge ${bu.rows.length ? 'warn' : 'ok'}">${bu.rows.length}</span></h3>
      <div class="desc">Trajets de camions validés par le Responsable des opérations. Cochez ceux du même client, puis créez la facture : le montant = tonnes × prix par tonne.${bu.waitingValidation ? ' <b>' + bu.waitingValidation + '</b> trajet(s) attendent encore la validation des opérations.' : ''}</div>
      ${bu.pricePerTon ? '' : '<div class="msg err">Le prix par tonne n\'est pas fixé : le Responsable logistique doit le fixer (écran Camions), ou saisissez-le ci-dessous.</div>'}
      <div style="overflow:auto"><table><tr><th></th><th>Client</th><th>Date</th><th>Camion</th><th>Chauffeur</th><th>Destination</th><th>Mouvements</th><th>Tonnes</th></tr>${bu.rows.map((r) => `<tr><td><input type="checkbox" class="cp-bt" value="${esc(r.id)}" data-c="${esc(r.customerId || '')}" data-t="${r.tons}" ${r.missingTonnage ? 'disabled' : ''} onchange="cpBillSel()" style="width:22px;height:22px"></td><td>${r.customerName ? '<b>' + esc(r.customerName) + '</b>' : '<span class="badge warn">client non précisé</span>'}</td><td>${dd(r.date)}</td><td>${esc(r.vehicle)}</td><td>${esc(r.driver)}</td><td>${esc(r.destination || '—')}</td><td class="mono">${r.movements}</td><td class="mono">${r.missingTonnage ? '<span class="badge warn">tonnage manquant</span>' : r.tons}</td></tr>`).join('') || '<tr><td colspan="8"><div class="empty">Aucun trajet validé à facturer.</div></td></tr>'}</table></div>
      ${bu.rows.length ? `<div style="margin:10px 0">${[...new Map(bu.rows.filter((r) => r.customerId).map((r) => [r.customerId, r.customerName])).entries()].map(([id, n]) => `<button class="btn small" onclick="cpBillClient('${esc(id)}')">Tous les trajets de ${esc(n)}</button> `).join('')}</div><label>Client à facturer</label><select id="cp-bc"><option value="">— Choisir le client —</option>${cust.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('')}</select>
      <label>Prix par tonne (GNF)</label><input id="cp-bp" type="number" inputmode="numeric" min="1" value="${bu.pricePerTon || ''}" oninput="cpBillSel()">
      <div id="cp-bsum" style="margin:10px 0;font-weight:600;color:var(--navy)">Aucun trajet sélectionné.</div><div id="cp-bmsg"></div>
      <button class="btn gold" style="min-height:48px" onclick="cpBill()"><svg class="ic" aria-hidden="true"><use href="#i-receipt"/></svg> Créer la facture</button>` : ''}</div>`;
  } else if (cpTab === 'recus') {
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Reçus papier à réclamer <span class="badge ${noPaper.length ? 'warn' : 'ok'}">${noPaper.length}</span></h3><div class="desc">Dépenses validées dont le reçu papier n'a pas été déposé chez le responsable. Relancez le Responsable des opérations.</div>
      ${tbl(['Date', 'Chauffeur', 'Nature', 'Montant', 'Attente'], noPaper.map((e) => { const j = Math.max(0, Math.floor((Date.now() - new Date(e.decidedAt || e.date)) / 864e5)); return `<tr><td>${dd(e.date)}</td><td>${who(e)}</td><td>${nat(e)}</td><td class="mono">${fmt(e.amount)} GNF</td><td><span class="badge ${j > 7 ? 'bad' : 'warn'}">${j} j</span></td></tr>`; }).join(''))}</div>`;
  } else if (cpTab === 'synthese') {
    const now = new Date(), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const from = cpPeriod === 'day' ? t0 : cpPeriod === 'week' ? new Date(+t0 - ((now.getDay() + 6) % 7) * 864e5) : new Date(now.getFullYear(), now.getMonth(), 1);
    const sel = rows.filter((e) => e.status === 'APPROVED' && new Date(e.date) >= from);
    window._cpSel = sel;
    const sum = (a) => a.reduce((x, e) => x + e.amount, 0);
    const grp = (f) => { const m = {}; sel.forEach((e) => { const k = f(e) || '—'; m[k] = m[k] || { n: 0, t: 0 }; m[k].n++; m[k].t += e.amount; }); return Object.entries(m).sort((a, b) => b[1].t - a[1].t); };
    const g = (title, list) => `<div class="panel"><h3>${title}</h3>${tbl(['', 'Nombre', 'Total (GNF)'], list.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${v.n}</td><td class="mono"><b>${fmt(v.t)}</b></td></tr>`).join(''))}</div>`;
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-chart"/></svg> Synthèse des dépenses validées${ro ? ' <span class="badge info">Lecture seule</span>' : ''}</h3>
      <div class="dp-sub">${[['day', "Aujourd'hui"], ['week', 'Cette semaine'], ['month', 'Ce mois']].map(([k, t]) => `<button class="${cpPeriod === k ? 'on' : ''}" onclick="cpPeriod='${k}';renderCompta()">${t}</button>`).join('')}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:12px 0">${[[fmt(sum(sel)), 'GNF validés'], [sel.length, 'Dépenses'], [fmt(sum(sel.filter((e) => e.paidAt))), 'GNF payés'], [fmt(sum(sel.filter((e) => !e.paidAt))), 'GNF à payer']].map(([n, l]) => `<div style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:700;color:var(--navy)">${n}</div><div style="font-size:12px;color:var(--muted)">${l}</div></div>`).join('')}</div>
      <button class="btn small" onclick="cpExport()"><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg> Exporter (Excel)</button></div>
      ${g('Par nature', grp((e) => DRV_EXP[e.category] || e.category))}${g('Par chauffeur', grp((e) => e.driver))}${g('Par véhicule', grp((e) => e.vehicle))}`;
  } else {
    const done = rows.filter((e) => e.status !== 'PENDING');
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-archive"/></svg> Historique</h3>${tbl(['Date', 'Chauffeur', 'Nature', 'Montant', 'Décision', 'Paiement'], done.map((e) => `<tr><td>${dd(e.date)}</td><td>${who(e)}</td><td>${nat(e)}</td><td class="mono">${fmt(e.amount)} GNF</td><td>${e.status === 'APPROVED' ? '<span class="badge ok">Validée</span>' : '<span class="badge bad">Refusée</span>'}${e.note ? '<div style="font-size:12px">' + esc(e.note) + '</div>' : ''}</td><td>${e.status !== 'APPROVED' ? '—' : e.paidAt ? '<span class="badge ok">Payée le ' + dd(e.paidAt) + '</span>' : '<span class="badge warn">À payer</span>'}</td></tr>`).join(''))}</div>`;
  }
  root().innerHTML = bar + body;
}
async function cpPay(id) { if (!confirm('Marquer cette dépense comme payée ?')) return; try { await api('/driver-admin/expenses/' + id + '/pay', { method: 'POST', body: {} }); renderCompta(); } catch (e) { alert(e.message); } }
function cpExport() {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [['Date', 'Chauffeur', 'Véhicule', 'Nature', 'Description', 'Montant GNF', 'Payée le'].map(q).join(';')].concat((window._cpSel || []).map((e) => [new Date(e.date).toLocaleDateString('fr-FR'), e.driver, e.vehicle, DRV_EXP[e.category] || e.category, e.description, e.amount, e.paidAt ? new Date(e.paidAt).toLocaleDateString('fr-FR') : ''].map(q).join(';')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'depenses-validees.csv'; a.click();
}
async function decideExpense(id, decision) {
  let note;
  if (decision === 'REJECTED') { note = prompt('Motif du refus (obligatoire) :'); if (!note || !note.trim()) return; }
  try { await api('/driver-admin/expenses/' + id + '/decision', { method: 'POST', body: { decision, note } }); renderView(state.view); }
  catch (e) { alert(e.message); }
}
window._bdKind = window._bdKind || 'ALL';
async function renderDriverBoard(date) {
  const d = date || window._bdDate || new Date().toISOString().slice(0, 10);
  window._bdDate = d;
  const r = await api('/driver-admin/board?date=' + d + '&siteId=' + state.siteId);
  const S = r.summary;
  const tile = (n, l, c) => `<div style="flex:1;min-width:120px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:700;color:${c}">${n}</div><div style="font-size:12px;color:var(--muted)">${l}</div></div>`;
  const wa = (x) => {
    if (!x.phone) return '';
    const num = String(x.phone).replace(/\D/g, ''); const full = num.length === 9 ? '224' + num : num;
    const msg = x.status === 'A_ENVOYER' ? `Bonjour ${x.name}, merci de compléter et d'envoyer votre fiche de bord du jour dans l'application.` : `Bonjour ${x.name}, merci de renseigner votre fiche de bord du jour (départ, carburant, arrivée) dans l'application.`;
    return `<a class="btn small" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${esc(full)}?text=${encodeURIComponent(msg)}">Relancer</a>`;
  };
  const shown = r.drivers.filter((x) => window._bdKind === 'ALL' || x.kind === window._bdKind);
  const BK = r.summary.byKind || {};
  const kindTabs = [['ALL', 'Tous (' + r.drivers.length + ')'], ['TRUCK', '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Camions (' + (BK.TRUCK || 0) + ')'], ['SERVICE_VEHICLE', '<svg class="ic" aria-hidden="true"><use href="#i-car"/></svg> Véhicules de service (' + (BK.SERVICE_VEHICLE || 0) + ')'], ['NONE', 'Sans véhicule (' + (BK.NONE || 0) + ')']].map(([k, t]) => `<button class="btn ${window._bdKind === k ? 'gold' : ''}" style="margin-right:6px" onclick="window._bdKind='${k}';renderDriverBoard()">${t}</button>`).join('');
  const rows = shown.map((x) => { const st = BOARD_ST[x.status]; return `<tr>
    <td><b>${esc(x.name)}</b><div style="font-size:12px;color:var(--muted)">${esc(x.phone || '')}</div></td>
    <td>${esc(x.vehicle || '—')}${x.loader ? `<div style="font-size:12px;color:var(--muted)">Chargeur : ${esc(x.loader)}</div>` : ''}</td>
    <td><span class="badge ${st[2]}">${st[0]} ${st[1]}</span>${x.destination ? `<div style="font-size:12px">${esc(x.destination)}</div>` : ''}</td>
    <td class="mono">${fmt(x.km)} km</td><td class="mono">${x.liters} L</td>
    <td>${x.alerts.map((a) => `<div style="font-size:12px;color:#9A6A0C"><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> ${esc(a)}</div>`).join('') || '<span style="color:var(--muted)">—</span>'}</td>
    <td>${x.status === 'RIEN' || x.status === 'A_ENVOYER' ? wa(x) : ''}</td></tr>`; }).join('');
  root().innerHTML = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-compass"/></svg> Suivi des chauffeurs</h3><div class="desc">Situation de chaque chauffeur pour la journée choisie.</div>
    <div style="margin:8px 0">${kindTabs}</div><label>Jour</label><input type="date" value="${esc(d)}" onchange="renderDriverBoard(this.value)" style="max-width:220px">
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">${tile(S.total, 'Chauffeurs actifs', 'var(--navy)')}${tile(S.absents || 0, 'Absents', '#A8403D')}${tile(S.enMission, 'En mission', '#3F8F6B')}${tile(S.aEnvoyer, 'Fiche à envoyer', '#C98A0B')}${tile(S.envoyees, 'Fiches envoyées', '#3F8F6B')}${tile(S.rien, 'Rien de saisi', '#C0504D')}</div></div>
    <div class="panel"><div style="overflow:auto"><table><tr><th>Chauffeur</th><th>Véhicule</th><th>Situation</th><th>Distance</th><th>Carburant</th><th>Alertes</th><th></th></tr>${rows || '<tr><td colspan="7" class="empty">Aucun chauffeur actif.</td></tr>'}</table></div></div>`;
}
const MS_ST = { PLANNED: ['warn', 'Planifiée'], IN_PROGRESS: ['ok', 'En cours'], COMPLETED: ['ok', 'Terminée'], CANCELLED: ['bad', 'Annulée'] };
window._ms = { page: 1, from: '', to: '', status: '', q: '', kind: 'TRUCK', vehicleId: '' };
function msSigner() { try { return JSON.parse(localStorage.getItem('ms-signer') || '{}'); } catch (e) { return {}; } }
function msReportQs() {
  const f = window._ms; const g = (id) => (document.getElementById(id) || {}).value || '';
  const sg = { name: g('ms-name'), firstNames: g('ms-first'), phone: g('ms-phone'), title: g('ms-title') };
  try { localStorage.setItem('ms-signer', JSON.stringify(sg)); } catch (e) {}
  return { siteId: state.siteId, kind: f.kind, vehicleId: f.vehicleId, from: f.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), to: f.to || new Date().toISOString().slice(0, 10), ...sg };
}
function msCheckSigner(q) { if (!q.name.trim() || !q.firstNames.trim() || !q.phone.trim()) throw new Error('Renseignez votre nom, vos prénoms et votre téléphone de service avant d\'enregistrer ou d\'envoyer le rapport.'); }
async function msPdf(action, audience) {
  const m = document.getElementById('ms-msg');
  try {
    const q = msReportQs(); msCheckSigner(q);
    if (action === 'mail') {
      const r = await api('/reports/missions/send-email', { method: 'POST', body: { ...q, audience, to: document.getElementById(audience === 'ACCOUNTING' ? 'ms-acc' : 'ms-hier').value } });
      m.innerHTML = r.sent ? '<div class="msg ok">Rapport envoyé par e-mail (PDF joint).</div>' : '<div class="msg err">' + esc(r.message || 'Envoi e-mail non configuré sur le serveur (SMTP).') + ' Utilisez l\'enregistrement ou l\'impression du PDF.</div>';
      return;
    }
    const blob = await api('/reports/missions/pdf?' + new URLSearchParams(q));
    const name = `rapport_missions_${q.from}_${q.to}.pdf`;
    if (action === 'folder' && window.showSaveFilePicker) {
      const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Document PDF', accept: { 'application/pdf': ['.pdf'] } }] });
      const w = await h.createWritable(); await w.write(blob); await w.close(); m.innerHTML = '<div class="msg ok">Rapport enregistré dans le dossier choisi.</div>'; return;
    }
    const url = URL.createObjectURL(blob);
    if (action === 'print') { const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; fr.src = url; fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { window.open(url, '_blank'); } setTimeout(() => { fr.remove(); URL.revokeObjectURL(url); }, 60000); }; document.body.appendChild(fr); return; }
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    m.innerHTML = '<div class="msg ok">Rapport téléchargé (dossier « Téléchargements »).</div>';
  } catch (e) { if (e.name !== 'AbortError') m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function renderMissionHistory(reset) {
  const f = window._ms; if (reset) f.page = 1;
  const vehs = (await api('/vehicles?siteId=' + state.siteId).catch(() => [])).filter((v) => v.vehicleType === f.kind);
  const sg = msSigner();
  const qs = new URLSearchParams({ siteId: state.siteId, kind: f.kind, ...(f.vehicleId ? { vehicleId: f.vehicleId } : {}), page: f.page, ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.status ? { status: f.status } : {}), ...(f.q ? { q: f.q } : {}) });
  const r = await api('/driver-admin/missions?' + qs);
  const tr = r.missions.map((m) => `<tr><td><b>${esc(m.reference || '—')}</b><div style="font-size:12px;color:var(--muted)">${esc(drvDt(m.startTime))}</div></td>
    <td>${esc(m.driver)}<div style="font-size:12px;color:var(--muted)">${esc(m.vehicle)}</div></td><td>${esc(m.destination || m.purpose || '—')}</td>
    <td class="mono">${m.km != null ? fmt(m.km) + ' km' : '—'}</td><td class="mono">${m.liters ? m.liters + ' L' : '—'}</td>
    <td><span class="badge ${MS_ST[m.status][0]}">${MS_ST[m.status][1]}</span></td><td><a href="#" onclick="tripTimeline('${esc(m.id)}');return false;"><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg></a></td></tr>`).join('');
  const kt = [['TRUCK', '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Camions'], ['SERVICE_VEHICLE', '<svg class="ic" aria-hidden="true"><use href="#i-car"/></svg> Véhicules de service']].map(([k, t]) => `<button class="btn ${f.kind === k ? 'gold' : ''}" style="margin-right:6px" onclick="window._ms.kind='${k}';window._ms.vehicleId='';renderMissionHistory(1)">${t}</button>`).join('');
  root().innerHTML = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Historique des missions</h3><div style="margin-bottom:8px">${kt}</div><div class="desc">${r.total} mission(s) trouvée(s).</div>
    <div style="margin-bottom:8px"><label>${f.kind === 'TRUCK' ? 'Camion' : 'Véhicule'}</label><select onchange="window._ms.vehicleId=this.value;renderMissionHistory(1)"><option value="">Tous</option>${vehs.map((v) => `<option value="${esc(v.id)}" ${f.vehicleId === v.id ? 'selected' : ''}>${esc(v.internalNumber)} — ${esc(v.registrationNumber)}</option>`).join('')}</select></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div><label>Du</label><input type="date" value="${esc(f.from)}" onchange="window._ms.from=this.value;renderMissionHistory(1)"></div>
      <div><label>Au</label><input type="date" value="${esc(f.to)}" onchange="window._ms.to=this.value;renderMissionHistory(1)"></div>
      <div><label>Statut</label><select onchange="window._ms.status=this.value;renderMissionHistory(1)"><option value="">Tous</option>${Object.entries(MS_ST).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v[1]}</option>`).join('')}</select></div>
      <div><label>Recherche (n° ou destination)</label><input value="${esc(f.q)}" placeholder="TRP-2026-0001, Kindia…" onkeydown="if(event.key==='Enter'){window._ms.q=this.value;renderMissionHistory(1)}" onchange="window._ms.q=this.value;renderMissionHistory(1)"></div>
    </div></div>
    <div class="panel"><div style="overflow:auto"><table><tr><th>N° / départ</th><th>Chauffeur / véhicule</th><th>Destination</th><th>Distance</th><th>Carburant</th><th>Statut</th><th></th></tr>${tr || '<tr><td colspan="7" class="empty">Aucune mission.</td></tr>'}</table></div>
    <div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-receipt"/></svg> Rapport global — à relire, signer et transmettre</h3>
      <div class="desc">Généré automatiquement pour la période choisie (30 derniers jours par défaut), ${f.kind === 'TRUCK' ? 'camions' : 'véhicules de service'}${f.vehicleId ? ', véhicule sélectionné' : ''}. Complétez vos informations : elles figurent sur le rapport.</div>
      <div class="grid-2"><div><label>Nom *</label><input id="ms-name" value="${esc(sg.name || '')}"></div><div><label>Prénoms *</label><input id="ms-first" value="${esc(sg.firstNames || '')}"></div>
      <div><label>Téléphone de service *</label><input id="ms-phone" value="${esc(sg.phone || '')}"></div><div><label>Fonction</label><input id="ms-title" value="${esc(sg.title || 'Responsable logistique')}"></div></div>
      <button class="btn gold" onclick="msPdf('folder')"><svg class="ic" aria-hidden="true"><use href="#i-archive"/></svg> Enregistrer dans un dossier</button> <button class="btn" onclick="msPdf('print')"><svg class="ic" aria-hidden="true"><use href="#i-printer"/></svg> Imprimer</button>
      <div class="grid-2" style="margin-top:12px"><div><label>Hiérarchie — e-mail(s)</label><input id="ms-hier" placeholder="(vide = adresses habituelles)"></div><div><label>Comptabilité — e-mail(s)</label><input id="ms-acc" placeholder="(vide = adresses habituelles)"></div></div>
      <button class="btn" onclick="msPdf('mail','HIERARCHY')"><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg> Envoyer à la hiérarchie</button> <button class="btn" onclick="msPdf('mail','ACCOUNTING')"><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg> Envoyer à la comptabilité</button>
      <div id="ms-msg"></div></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px"><button class="btn small" ${r.page <= 1 ? 'disabled' : ''} onclick="window._ms.page--;renderMissionHistory()">← Précédent</button><span style="font-size:14px">Page ${r.page} / ${r.pages}</span><button class="btn small" ${r.page >= r.pages ? 'disabled' : ''} onclick="window._ms.page++;renderMissionHistory()">Suivant →</button></div></div>`;
}
// Application chauffeur : mes missions passées
async function drvMissionHistory(page) {
  page = page || 1;
  let r;
  try { r = await api('/driver/history?page=' + page); } catch (e) { alert(e.message); return; }
  const old = drvEl('drv-hist-ov'); if (old) old.remove();
  const list = r.missions.map((m) => `<div style="padding:10px 0;border-bottom:1px dashed #D9E0E8"><div style="display:flex;justify-content:space-between"><b>${esc(m.reference || '—')}</b><span class="badge ${MS_ST[m.status][0]}">${MS_ST[m.status][1]}</span></div>
    <div style="font-size:14px;color:#5A6B7D">${esc(drvDt(m.startTime))} · ${esc(m.destination || m.purpose || '—')}</div>
    <div style="font-size:14px">${m.km != null ? fmt(m.km) + ' km' : ''}${m.liters ? ' · ' + m.liters + ' L' : ''} · ${esc(m.vehicle)} · <a href="#" onclick="drvTimeline('${esc(m.id)}');return false;"><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> Chronologie</a></div></div>`).join('');
  const o = document.createElement('div'); o.id = 'drv-hist-ov';
  o.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9000;overflow:auto;padding:16px';
  o.innerHTML = `<a href="#" onclick="document.getElementById('drv-hist-ov').remove();return false;" style="text-decoration:none;font-weight:700;color:#1F3A5F;font-size:14px">← Retour</a><h3><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Mes missions passées</h3><div style="font-size:14px;color:#5A6B7D">${r.total} mission(s)</div>${list || '<div style="padding:20px;color:#5A6B7D">Aucune mission.</div>'}
    <div style="display:flex;justify-content:space-between;margin-top:14px"><button class="drv-btn ghost" style="width:auto" ${r.page <= 1 ? 'disabled' : ''} onclick="drvMissionHistory(${page - 1})">←</button><span>Page ${r.page}/${r.pages}</span><button class="drv-btn ghost" style="width:auto" ${r.page >= r.pages ? 'disabled' : ''} onclick="drvMissionHistory(${page + 1})">→</button></div>`;
  document.body.appendChild(o); if (!page || page === 1) { try { history.pushState({ drv: 1 }, ''); } catch (e) {} }
}
const TL_ICON = { CREATION: '<svg class="ic" aria-hidden="true"><use href="#i-pencil"/></svg>', START: '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg>', FUEL: '<svg class="ic" aria-hidden="true"><use href="#i-fuel"/></svg>', MAINTENANCE: '<svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg>', EXPENSE: '<svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg>', BREAKDOWN: '<svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg>', INCIDENT: '<svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg>', PAUSE: '<svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg>', RESUME: '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg>', ARRIVE: '<svg class="ic" aria-hidden="true"><use href="#i-flag"/></svg>', SHEET_SENT: '<svg class="ic" aria-hidden="true"><use href="#i-upload"/></svg>' };
function timelineHtml(r) {
  const ev = r.events.map((e) => `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px dashed #D9E0E8"><div style="min-width:46px;font-size:12px;color:#5A6B7D">${new Date(e.at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}<br><b>${new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</b></div><div><div>${TL_ICON[e.type] || '•'} <b>${esc(e.title)}</b></div>${e.detail ? `<div style="font-size:14px;color:#5A6B7D">${esc(e.detail)}</div>` : ''}</div></div>`).join('');
  return `<h3 style="margin:0 0 4px"><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> Chronologie — ${esc(r.reference || 'Mission')}</h3><div style="font-size:14px;color:#5A6B7D;margin-bottom:8px">${esc(r.driver)} · ${esc(r.vehicle)}</div>${ev}`;
}
function timelineOverlay(r) {
  const o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  o.innerHTML = `<div style="background:#fff;width:100%;max-width:560px;max-height:85vh;overflow:auto;border-radius:8px 16px 0 0;padding:16px"><a href="#" onclick="this.closest('div[style*=fixed]').remove();return false;" style="text-decoration:none;font-weight:700;color:#1F3A5F">← Fermer</a>${timelineHtml(r)}</div>`;
  o.onclick = (e) => { if (e.target === o) o.remove(); };
  document.body.appendChild(o);
}
async function tripTimeline(id) { try { timelineOverlay(await api('/driver-admin/trips/' + id + '/timeline')); } catch (e) { alert(e.message); } }
async function drvTimeline(id) { try { timelineOverlay(await api('/driver/trips/' + id + '/timeline')); } catch (e) { alert(e.message); } }
const STEP_ST = { DRAFT: ['info', 'Brouillon'], SUBMITTED: ['warn', 'Soumis'], VERIFIED: ['warn', 'Vérifié'], VALIDATED: ['ok', 'Validé'], REJECTED: ['bad', 'Rejeté'] };
const staffStep = (r) => (r.rejectedAt ? 'REJECTED' : r.opsAt ? 'VALIDATED' : r.receivedAt ? 'VERIFIED' : 'SUBMITTED');
const stepBadge = (st) => { const x = STEP_ST[st] || STEP_ST.DRAFT; return `<span class="badge ${x[0]}">${x[1]}</span>`; };
async function sheetAct(kind, driverId, date) {
  let note;
  if (kind === 'reject') { note = prompt('Motif du renvoi au chauffeur (obligatoire) :'); if (!note || !note.trim()) return; }
  else if (kind === 'validate') { if (!confirm('Valider cette fiche et la transférer à la Comptabilité ?')) return; }
  else { note = prompt('Note pour la suite de la chaîne (facultatif) :', ''); if (note === null) return; }
  try { await api('/driver-admin/sheets/' + (kind === 'process' ? 'process' : kind), { method: 'POST', body: { driverId, date, note: note || undefined } }); renderView(state.view); } catch (e) { alert(e.message); }
}
async function receiptCheck(id) {
  if (!confirm('Confirmer : le reçu papier est arrivé et il est conforme ?')) return;
  try { await api('/driver-admin/expenses/' + id + '/receipt-check', { method: 'POST', body: {} }); renderView(state.view); } catch (e) { alert(e.message); }
}
function receiptLink(u) { const base = (state.apiUrl || '').replace(/\/$/, ''); return u ? `<a href="${esc(base + u)}" target="_blank" rel="noopener" style="white-space:nowrap"><svg class="ic" aria-hidden="true"><use href="#i-camera"/></svg> Voir</a>` : '<span class="badge bad">Manquant</span>'; }
function sheetCardHtml(sh) {
  const role = state.user.role, hh = (x) => (x ? new Date(x).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '…');
  const canVerify = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE'].includes(role), canValidate = ['SUPER_ADMIN', 'RESPONSABLE_OPERATIONS'].includes(role), canPaper = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_OPERATIONS'].includes(role), canReject = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'RESPONSABLE_OPERATIONS'].includes(role);
  const did = esc(sh.driver.id), dt = esc(sh.date);
  let acts = '';
  if (sh.step === 'SUBMITTED' && canVerify) acts += `<button class="btn small gold" onclick="sheetAct('process','${did}','${dt}')"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Vérifier et transmettre</button> `;
  if (sh.step === 'VERIFIED' && canValidate) acts += `<button class="btn small gold" onclick="sheetAct('validate','${did}','${dt}')"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Valider et transférer à la Comptabilité</button> `;
  if (['SUBMITTED', 'VERIFIED'].includes(sh.step) && canReject) acts += `<button class="btn small" onclick="sheetAct('reject','${did}','${dt}')"><svg class="ic" aria-hidden="true"><use href="#i-chevron-left"/></svg> Renvoyer au chauffeur</button>`;
  const exps = sh.expenses || [];
  const expTable = exps.length ? `<h4 style="margin:10px 0 4px"><svg class="ic" aria-hidden="true"><use href="#i-banknote"/></svg> Dépenses déclarées</h4><table><tr><th>Heure</th><th>Nature</th><th>Montant (GNF)</th><th>Reçu scanné</th><th>Reçu papier</th></tr>${exps.map((e) => `<tr><td>${hh(e.time)}</td><td>${esc(DRV_EXP[e.category] || e.category)}<div style="font-size:12px">${esc(e.description || '')}</div></td><td class="mono">${fmt(e.amount)}</td><td>${receiptLink(e.receiptUrl)}</td><td>${e.receiptCheckedAt ? '<span class="badge ok"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Conforme</span>' : canPaper ? `<button class="btn small" onclick="receiptCheck('${esc(e.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg> Reçu papier reçu</button>` : '<span class="badge warn">À contrôler</span>'}</td></tr>`).join('')}</table>` : '';
  const fuelRcpt = (f) => (f.source === 'STATION' || f.receiptUrl ? receiptLink(f.receiptUrl) : '—');
  return `<div class="panel"><h3>${esc(sh.driver.name)} ${stepBadge(sh.step)} ${sh.status === 'SENT' ? '<span style="font-size:12px;font-weight:400;color:var(--muted)">envoyée ' + drvDt(sh.sentAt) + '</span>' : ''}</h3>
    ${sh.step === 'REJECTED' ? `<div class="msg err">Renvoyée au chauffeur : ${esc(sh.rejectNote || '')}</div>` : ''}${sh.processNote && sh.step !== 'REJECTED' ? `<div class="desc">Note logistique : ${esc(sh.processNote)}</div>` : ''}
    ${acts ? `<div style="margin:6px 0">${acts}</div>` : ''}
    <div class="desc">${esc(sh.day)} ${esc(sh.date)} · ${esc(sh.driver.phone || '')} · ${sh.driver.activity === 'TRUCK' ? '<svg class="ic" aria-hidden="true"><use href="#i-truck"/></svg> Camion' : '<svg class="ic" aria-hidden="true"><use href="#i-car"/></svg> Véhicule de service'} — <b>${fmt(sh.totals.km)} km</b> · ${sh.totals.liters} L (${fmt(sh.totals.fuelCost)} GNF)${sh.totals.consumption !== null ? ' · ' + sh.totals.consumption + ' L/100 km' : ''}${sh.totals.voyages ? ' · ' + sh.totals.voyages + ' voyage(s)' : ''}${sh.totals.maintenanceCost ? ' · maintenance ' + fmt(sh.totals.maintenanceCost) + ' GNF' : ''}</div>
    <div style="overflow:auto"><table><tr><th>Véhicule</th><th>Destination / motif</th><th>Horaires</th><th>Km départ</th><th>Km arrivée</th><th>Km arrêt</th><th>Distance</th><th>Observations</th></tr>
    ${sh.trips.map((t) => `<tr><td>${esc(t.plate)}<div style="font-size:12px;color:var(--muted)">${esc(t.brand)}</div>${t.reference ? `<div style="font-size:12px"><b>${esc(t.reference)}</b></div><a href="#" onclick="tripTimeline('${esc(t.id)}');return false;" style="font-size:12px"><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> Chronologie</a>` : ''}</td><td>${esc(t.destination || (t.regions || []).join(', ') || '—')}<div style="font-size:12px">${t.route ? esc(t.route) + '<br>' : ''}${esc([t.cargo, t.purpose].filter(Boolean).join(' — '))}${t.loadPlaces && t.loadPlaces.length ? '<br><svg class="ic" aria-hidden="true"><use href="#i-upload"/></svg> ' + esc(t.loadPlaces.join(', ')) + ' → <svg class="ic" aria-hidden="true"><use href="#i-download"/></svg> ' + esc((t.unloadPlaces || []).join(', ')) : ''}${t.pauseMileage != null ? '<br>pause ' + fmt(t.pauseMileage) + ' km' : ''}${t.voyages && t.tonnagePerTrip ? '<br><b>' + esc(t.voyages) + ' voyage(s) × ' + esc(t.tonnagePerTrip) + ' t = ' + (Math.round(t.voyages * t.tonnagePerTrip * 10) / 10) + ' t</b>' : ''}</div></td><td>${hh(t.startTime)} → ${hh(t.endTime)}</td><td class="mono">${fmt(t.startMileage)}</td><td class="mono">${t.arrivalMileage != null ? fmt(t.arrivalMileage) : '—'}</td><td class="mono">${t.endMileage != null ? fmt(t.endMileage) : '…'}</td><td class="mono"><b>${fmt(t.km)}</b></td><td>${t.preCondition === 'ANOMALIE' ? '<span class="badge warn">Anomalie</span> ' + esc(t.preAnomalies) : ''}${t.maintenanceNeeded ? '<div><span class="badge bad">Maintenance</span> ' + esc(t.maintenanceReason) + '</div>' : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Aucune mission.</td></tr>'}</table></div>
    ${sh.fuel.length ? `<h4 style="margin:10px 0 4px"><svg class="ic" aria-hidden="true"><use href="#i-fuel"/></svg> Carburant</h4><table><tr><th>Heure</th><th>Station</th><th>Km</th><th>Litres</th><th>Coût (GNF)</th><th>Reçu scanné</th></tr>${sh.fuel.map((f) => `<tr><td>${hh(f.time)}</td><td>${esc(drvSrc(f))}</td><td class="mono">${fmt(f.mileage)}</td><td class="mono">${f.liters}</td><td class="mono">${fmt(f.cost)}</td><td>${fuelRcpt(f)}</td></tr>`).join('')}</table>` : ''}
    ${sh.maintenance.length ? `<h4 style="margin:10px 0 4px"><svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg> Maintenance</h4><table><tr><th>Nature</th><th>Détail</th><th>Km</th><th>Prochaine vidange</th><th>Coût (GNF)</th></tr>${sh.maintenance.map((m) => `<tr><td>${esc(DRV_NAT[m.nature] || m.nature)}</td><td>${esc(m.detail || '')}</td><td class="mono">${m.mileage != null ? fmt(m.mileage) : '—'}</td><td class="mono">${m.nextServiceKm ? fmt(m.nextServiceKm) + ' km' : '—'}</td><td class="mono">${m.cost != null ? fmt(m.cost) : '—'}</td></tr>`).join('')}</table>` : ''}
    ${expTable}
  </div>`;
}
async function renderDriverSheets(date) {
  const d = date || window._shDate || new Date().toISOString().slice(0, 10);
  window._shDate = d;
  const list = await api('/driver-admin/sheets?date=' + d + '&siteId=' + state.siteId);
  root().innerHTML = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg> Fiches de bord du jour</h3><div class="desc">Une fiche par chauffeur et par jour. Circuit : le chauffeur envoie (<b>Soumis</b>), la logistique vérifie et transmet (<b>Vérifié</b>), le Responsable des opérations valide (<b>Validé</b>), puis la Comptabilité traite les dépenses. Une fiche renvoyée (<b>Rejeté</b>) est rouverte au chauffeur.</div>
    <label>Jour</label><input type="date" value="${esc(d)}" onchange="renderDriverSheets(this.value)" style="max-width:220px"></div><div id="ptr-panel"></div>${list.map(sheetCardHtml).join('') || '<div class="panel"><div class="empty">Aucune saisie ce jour.</div></div>'}`;
  loadPointers(d);
}

/* ---------- Atelier (Mécanicien) : À réparer · En cours · Terminées · Pièces ---------- */
let atTab = 'repair';
const AT_TABS = [['repair', 'À réparer'], ['progress', 'En cours'], ['done', 'Terminées'], ['parts', 'Pièces']];
async function renderAtelier() {
  const [dt, maint, items] = await Promise.all([api('/downtimes?siteId=' + encodeURIComponent(state.siteId || '')), api('/maintenance'), atTab === 'parts' ? api('/inventory/items?siteId=' + encodeURIComponent(state.siteId || '')) : Promise.resolve([])]);
  const open = dt.items.filter((i) => !i.endedAt), closed = dt.items.filter((i) => i.endedAt);
  const mProg = maint.filter((m) => ['IN_PROGRESS', 'PLANNED', 'OVERDUE'].includes(m.status));
  const mDone = maint.filter((m) => m.status === 'COMPLETED').slice(0, 20);
  const nb = { repair: open.length, progress: mProg.length };
  const bar = `<div class="dp-tabs" id="dp-bar">${AT_TABS.map(([k, t]) => `<button class="${atTab === k ? 'on' : ''}" onclick="atTab='${k}';renderAtelier()">${t}${nb[k] ? ' (' + nb[k] + ')' : ''}</button>`).join('')}</div>`;
  const d = (x) => new Date(x).toLocaleDateString('fr-FR');
  const st = { PLANNED: ['warn', 'Planifié'], IN_PROGRESS: ['warn', 'En cours'], OVERDUE: ['bad', 'En retard'], COMPLETED: ['ok', 'Terminé'] };
  let body = '';
  if (atTab === 'repair') {
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> Véhicules à réparer <span class="badge ${open.length ? 'bad' : 'ok'}">${open.length}</span></h3><div class="desc">Pannes déclarées par les chauffeurs et véhicules immobilisés. Prenez la réparation en charge (le premier arrivé), demandez les pièces si besoin, puis cliquez « Réparation terminée » : le véhicule est remis en service.</div>${open.map((i) => `<div class="drv-row" style="align-items:flex-start;flex-wrap:wrap"><span style="flex:1;min-width:200px"><b>${esc(i.vehicle)}</b> ${dtStageHtml(i)}<br><small>${esc(i.category)} · depuis le ${d(i.startedAt)} (${i.days} j)</small><div style="margin-top:4px">${esc(i.reason)}</div>${dtInfoHtml(i)}</span><span style="display:flex;gap:6px;flex-wrap:wrap">${dtButtons(i)}</span></div>`).join('') || '<div class="empty">Aucun véhicule à réparer.</div>'}<button class="btn" style="margin-top:10px" onclick="go('maintenance')"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Nouvelle intervention (entretien)</button></div>`;
  } else if (atTab === 'progress') {
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg> Interventions en cours et à faire</h3>${mProg.map((m) => { const [c, l] = st[m.status] || ['warn', m.status]; return `<div class="drv-row" style="align-items:flex-start;flex-wrap:wrap"><span style="flex:1;min-width:180px"><b>${esc(m.vehicle.internalNumber)}</b> · ${esc((m.maintenanceType && m.maintenanceType.label) || m.description || '—')}<br><small>${d(m.maintenanceDate)}${m.kind === 'PREVENTIVE' ? ' · préventif' : ''}</small>${m.description && m.kind === 'PREVENTIVE' ? '<div style="font-size:13px;color:var(--muted)">' + esc(m.description) + '</div>' : ''}</span><span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="badge ${c}">${l}</span>${['PLANNED', 'IN_PROGRESS'].includes(m.status) ? `<button class="btn small gold" onclick="mpComplete('${esc(m.id)}')">Entretien effectué</button>` : ''}</span></div>`; }).join('') || '<div class="empty">Aucune intervention en cours.</div>'}</div>`;
  } else if (atTab === 'done') {
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg> Réparations terminées</h3>${closed.slice(0, 30).map((i) => `<div class="drv-row" style="align-items:flex-start"><span><b>${esc(i.vehicle)}</b> · ${esc(i.category)}<br><small>${d(i.startedAt)} → ${d(i.endedAt)} (${i.days} j)</small>${i.resolutionNote ? '<div style="font-size:14px">' + esc(i.resolutionNote) + '</div>' : ''}</span><span style="text-align:right">${i.actualCost != null ? '<b>' + fmt(i.actualCost) + ' GNF</b>' : ''}${i.invoiceUrl ? '<br><a href="' + esc((state.apiUrl || '').replace(/\/$/, '') + i.invoiceUrl) + '" target="_blank" rel="noopener" style="font-size:12px"><svg class="ic" aria-hidden="true"><use href="#i-receipt"/></svg> Facture</a>' : ''}</span></div>`).join('') || '<div class="empty">Aucune réparation terminée.</div>'}</div>
      ${mDone.length ? `<div class="panel"><h3>Entretiens réalisés</h3>${mDone.map((m) => `<div class="drv-row"><span><b>${esc(m.vehicle.internalNumber)}</b> · ${esc((m.maintenanceType && m.maintenanceType.label) || '—')}<br><small>${d(m.maintenanceDate)}</small></span><span class="badge ok">Terminé</span></div>`).join('')}</div>` : ''}`;
  } else {
    body = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-package"/></svg> Pièces en stock <span style="font-size:12px;font-weight:400;color:var(--muted)">(consultation)</span></h3><div class="desc">Pour demander une pièce, voyez le magasinier.</div><div style="overflow:auto"><table><tr><th>Article</th><th>Quantité</th><th>État</th></tr>${items.map((i) => `<tr><td>${esc(i.name)}</td><td class="mono">${fmt(i.currentQuantity)} ${esc(i.unit)}</td><td>${Number(i.currentQuantity) <= 0 ? '<span class="badge bad">Rupture</span>' : Number(i.currentQuantity) < Number(i.minimumQuantity) ? '<span class="badge warn">Sous seuil</span>' : '<span class="badge ok">OK</span>'}</td></tr>`).join('') || '<tr><td colspan="3">Aucun article.</td></tr>'}</table></div></div>`;
  }
  root().innerHTML = bar + body;
}
function atResolve(id) {
  DRV_PHOTOS.length = 0;
  const ov = document.createElement('div'); ov.id = 'at-ov'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,25,45,.55);z-index:90;display:flex;align-items:center;justify-content:center;padding:14px';
  ov.innerHTML = `<div class="panel" style="max-width:460px;width:100%;max-height:92vh;overflow:auto;margin:0"><h3><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Réparation terminée</h3>
    <label>Travaux réalisés (obligatoire)</label><textarea id="at-note" rows="3" placeholder="Ex. remplacement plaquettes avant, purge freins"></textarea>
    <label>Coût total pièces + main-d'œuvre (GNF) — 0 si aucun</label><input id="at-cost" type="number" inputmode="numeric" value="0">
    ${drvPhotoField('Photo de la facture — obligatoire si un coût est indiqué', false)}
    <div id="at-msg"></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn gold" style="flex:1;min-height:48px" onclick="atResolveSend('${esc(id)}')">Remettre en service</button><button class="btn" style="min-height:48px" onclick="document.getElementById('at-ov').remove()">Annuler</button></div></div>`;
  document.body.appendChild(ov);
}
async function atResolveSend(id) {
  const m = document.getElementById('at-msg'), note = document.getElementById('at-note').value.trim(), cost = Number(document.getElementById('at-cost').value);
  try {
    if (!note) throw new Error('Indiquez les travaux réalisés.');
    if (!Number.isFinite(cost) || cost < 0) throw new Error('Coût invalide.');
    if (cost > 0 && !DRV_PHOTOS.length) throw new Error('La photo de la facture est obligatoire quand un coût est indiqué.');
    m.innerHTML = '<div class="desc">Envoi en cours…</div>';
    const invoiceUrl = DRV_PHOTOS.length ? await drvUpload(DRV_PHOTOS[0], 'maintenance_invoice') : undefined;
    await api('/downtimes/' + id + '/resolve', { method: 'POST', body: { resolutionNote: note, actualCost: cost, ...(invoiceUrl ? { invoiceUrl } : {}) } });
    document.getElementById('at-ov').remove(); renderAtelier();
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* Responsable des opérations : fiches vérifiées par la logistique, à valider puis transférer à la Comptabilité */
async function renderOpsValidation() {
  const cashAll = await api('/cash-sessions?siteId=' + encodeURIComponent(state.siteId || '')).catch(() => []);
  const cashTo = (cashAll || []).filter((c) => c.closedAt && c.validatedBy && !c.opsAt && !c.rejectedAt);
  const cashHtml = cashTo.length ? `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-archive"/></svg> Caisses vérifiées à valider <span class="badge warn">${cashTo.length}</span></h3>${cashTo.map((c) => `<div class="drv-row" style="align-items:flex-start"><span><b>${new Date(c.openedAt).toLocaleDateString('fr-FR')}</b> · ${esc(c.cashier ? c.cashier.firstName + ' ' + c.cashier.lastName : '')}<br><small>Attendu ${fmt(Math.round(Number(c.expectedCash) || 0))} · compté ${fmt(Math.round(Number(c.countedCash) || 0))} · écart ${fmt(Math.round(Number(c.gapAmount) || 0))} GNF</small>${c.note ? '<div style="font-size:12px;color:var(--muted)">' + esc(c.note) + '</div>' : ''}</span><span style="white-space:nowrap"><button class="btn small gold" onclick="vtCashOps('${esc(c.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Valider</button> <button class="btn small" onclick="vtCashNo('${esc(c.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-chevron-left"/></svg> Rejeter</button></span></div>`).join('')}</div>` : '';
  const [list, staff] = await Promise.all([api('/driver-admin/sheets/pending?siteId=' + encodeURIComponent(state.siteId || '')), api('/staff/reports/pending?siteId=' + encodeURIComponent(state.siteId || '')).catch(() => [])]);
  const staffHtml = staff.length ? `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-user"/></svg>‍<svg class="ic" aria-hidden="true"><use href="#i-factory"/></svg> Rapports du personnel à valider <span class="badge warn">${staff.length}</span></h3>${staff.map((r) => `<div class="drv-row" style="align-items:flex-start"><span><b>${esc(r.name)}</b> · ${esc(r.date)}<br><small>${esc(r.role)}</small><div style="white-space:pre-wrap;font-size:14px;margin-top:4px">${esc(r.activities)}</div>${r.observations ? '<div style="font-size:12px;color:var(--muted);white-space:pre-wrap">' + esc(r.observations) + '</div>' : ''}</span><span style="white-space:nowrap"><button class="btn small gold" onclick="stValidate('${esc(r.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Valider</button> <button class="btn small" onclick="stReject('${esc(r.id)}')"><svg class="ic" aria-hidden="true"><use href="#i-chevron-left"/></svg> Rejeter</button></span></div>`).join('')}</div>` : '';
  root().innerHTML = cashHtml + staffHtml + `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg> Fiches vérifiées à valider</h3><div class="desc">Contrôlez les kilomètres, le carburant, la maintenance et les dépenses (reçus scannés), puis validez : la fiche passe à la Comptabilité. Cochez « Reçu papier reçu » quand le reçu physique a été déposé et est conforme.</div>
    <div style="font-size:20px;font-weight:700;color:var(--navy)">${list.length} <span style="font-size:14px;font-weight:400;color:var(--muted)">fiche(s) en attente</span></div></div>${list.map(sheetCardHtml).join('') || '<div class="panel"><div class="empty">Aucune fiche en attente de validation.</div></div>'}`;
}

/* ---------- Camions : contrôle avec les pointeurs ---------- */
async function loadPointers(d) {
  const box = document.getElementById('ptr-panel'); if (!box) return;
  try {
    const r = await api('/driver-admin/pointers?date=' + d + '&siteId=' + state.siteId);
    const canPrice = ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE'].includes(state.user.role);
    const gap = (g, u) => g === null ? '<span class="badge warn">À saisir</span>' : g === 0 ? '<span class="badge ok">Conforme</span>' : `<span class="badge bad">${g > 0 ? '+' : ''}${g}${u}</span>`;
    box.innerHTML = `<div class="panel"><h3><svg class="ic" aria-hidden="true"><use href="#i-scale"/></svg> Contrôle avec les pointeurs — camions</h3>
      <div class="desc">Mouvements et tonnes déclarés par les chauffeurs (tonnage coché sur la fiche de bord), comparés aux totaux relevés par les pointeurs. Prix par tonne : <b>${r.pricePerTon ? fmt(r.pricePerTon) + ' GNF' : 'non fixé'}</b>
      ${canPrice ? `<button class="btn small" onclick="setTonPrice()">Fixer le prix par tonne</button>` : ''}</div>
      <div style="overflow:auto"><table><thead><tr><th>Camion</th><th>Chauffeur</th><th>Mouvements déclarés</th><th>Tonnes déclarées</th><th>Montant (GNF)</th><th>Pointeur : mouvements</th><th>Pointeur : tonnes</th><th>Écart</th><th></th></tr></thead><tbody>
      ${r.rows.map((x, i) => `<tr><td><b>${esc(x.vehicle)}</b></td><td>${esc(x.driver)}</td><td class="mono">${x.movements}</td><td class="mono">${x.tons}${x.missingTonnage ? ' <span class="badge warn">tonnage manquant</span>' : ''}</td><td class="mono">${r.pricePerTon ? fmt(x.amount) : '—'}</td>
        <td><input id="pm-${i}" type="number" min="0" inputmode="numeric" style="width:80px" value="${x.pointer ? x.pointer.movements : ''}"></td>
        <td><input id="pt-${i}" type="number" min="0" step="0.1" inputmode="decimal" style="width:90px" value="${x.pointer ? x.pointer.tons : ''}"></td>
        <td>${gap(x.gapTons, ' t')}${x.gapMovements ? '<div style="font-size:12px">' + (x.gapMovements > 0 ? '+' : '') + x.gapMovements + ' mouv.</div>' : ''}</td>
        <td><button class="btn small" onclick="savePointer('${esc(x.vehicleId)}', ${i}, '${esc(r.date)}')">Enregistrer</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Aucun camion en mouvement ce jour.</td></tr>'}
      </tbody></table></div><div id="ptr-msg"></div></div>`;
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function savePointer(vehicleId, i, day) {
  const m = parseInt(document.getElementById('pm-' + i).value, 10), t = parseFloat(String(document.getElementById('pt-' + i).value).replace(',', '.'));
  if (isNaN(m) || isNaN(t)) { document.getElementById('ptr-msg').innerHTML = '<div class="msg err">Saisissez les mouvements et les tonnes du pointeur.</div>'; return; }
  try { await api('/driver-admin/pointers?siteId=' + state.siteId, { method: 'POST', body: { vehicleId, day, movements: m, tons: t } }); loadPointers(day); }
  catch (e) { document.getElementById('ptr-msg').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function setTonPrice() {
  const v = prompt('Prix par tonne transportée (GNF) :'); if (v === null) return;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  if (!(n > 0)) { alert('Saisissez un montant supérieur à 0.'); return; }
  try { await api('/settings/TON_PRICE', { method: 'PUT', body: { value: String(n), reason: 'Prix par tonne' } }); loadPointers(window._shDate); } catch (e) { alert(e.message); }
}

/* ============ LICENCE : activation et blocage (actif seulement si le serveur est relié au Master) ============ */
function licScreen(stateName, message) {
  let ov = document.getElementById('lic-ov'); if (ov) ov.remove();
  ov = document.createElement('div'); ov.id = 'lic-ov';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#182F4C;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
  const act = stateName === 'UNACTIVATED';
  ov.innerHTML = `<div style="background:#fff;border-radius:8px;max-width:420px;width:100%;padding:26px;text-align:center;font-family:inherit">
    <div style="font-size:20px">${act ? '<svg class="ic" aria-hidden="true"><use href="#i-key"/></svg>' : '<svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg>'}</div>
    <h2 style="margin:8px 0;color:#1F3A5F;">SYL LOGISTIQUE</h2>
    <p style="color:#4a5a70;font-size:14px">${esc(message || (act ? "Entrez le code d'activation reçu de votre fournisseur." : 'Accès suspendu. Contactez votre fournisseur.'))}</p>
    ${act ? `<input id="lic-code" placeholder="SYLL-XXXXX-XXXXX-XXXXX-XXXXX" autocapitalize="characters" autocomplete="off" style="width:100%;padding:12px;border:1px solid #cdd6e2;border-radius:6px;font-size:14px;text-align:center;margin-top:8px">
    <button class="btn gold" style="width:100%;margin-top:12px" onclick="licActivate()">Activer</button><div id="lic-msg" style="margin-top:10px"></div>` : `<button class="btn" style="width:100%;margin-top:12px" onclick="location.reload()">Réessayer</button>`}
    <div class="powered">Powered by Syllogistique</div></div>`;
  document.body.appendChild(ov);
}
async function licActivate() {
  const m = document.getElementById('lic-msg'); const code = document.getElementById('lic-code').value.trim();
  const base = (document.getElementById('api-url').value || localStorage.getItem('syllo_api_url') || '').replace(/\/$/, '');
  m.innerHTML = '<div class="msg">Activation en cours…</div>';
  try {
    const r = await fetch(base + '/license/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(Array.isArray(j.message) ? j.message.join(', ') : j.message || 'Activation refusée.');
    m.innerHTML = '<div class="msg ok">Activation réussie.</div>'; setTimeout(() => location.reload(), 800);
  } catch (e) { m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
async function licLoad() {
  try {
    const base = (document.getElementById('api-url') ? document.getElementById('api-url').value : '') || localStorage.getItem('syllo_api_url') || '';
    if (!base) return;
    const r = await fetch(base.replace(/\/$/, '') + '/license/status'); if (!r.ok) return;
    const j = await r.json(); window.LIC_MODULES = j.modules || null; window.LIC_PAID = j.paid !== false; try { localStorage.setItem('syllo_modules', JSON.stringify(j.modules || null)); } catch (e) {} if (typeof applyRoleNav === 'function' && state.user) applyRoleNav(); if (!j.enforced) return;
    if (j.state === 'UNACTIVATED' || j.state === 'BLOCKED') licScreen(j.state, j.message);
    else if (j.state === 'WARNING') {
      const b = document.createElement('div'); b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#C9A24D;color:#1b1b1b;padding:8px 12px;font-size:14px;text-align:center';
      b.textContent = j.message; document.body.appendChild(b);
    }
  } catch (e) {}
}
brandLoad();
licLoad();

