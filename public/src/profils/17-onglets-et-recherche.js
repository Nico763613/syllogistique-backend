/* =====================================================================
   ONGLETS DE COULEUR (composant commun) · ONGLETS RH · RECHERCHE PAR ÉCRAN
   Un onglet = un écran : seul l'onglet ouvert est chargé.
   ===================================================================== */
const SY_TAB_COLORS = ['navy', 'sage', 'gold', 'terra', 'mauve', 'navy-soft', 'sage', 'gold'];
function syTabs(tabs, cur, fn) { // tabs : [[clé, libellé, icône]]
  if (window._menuLock && window._menuLock.fn === fn && typeof state !== 'undefined' && state.view === window._menuLock.view) return '';
  setTimeout(() => document.querySelectorAll('.sy-tabs').forEach((bar) => { const on = bar.querySelector('.sy-tab.on'); if (on) bar.scrollLeft = on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2; }), 0);
  return `<div class="sy-tabs" role="tablist">${tabs.map((t, i) => `<button role="tab" aria-selected="${t[0] === cur}" class="sy-tab c-${SY_TAB_COLORS[i % SY_TAB_COLORS.length]}${t[0] === cur ? ' on' : ''}" onclick="${fn}('${t[0]}')">${t[2] ? PROF_IC(t[2]) : ''}<span>${t[1]}</span></button>`).join('')}</div>`;
}

/* ---------- Ressources humaines : un onglet par catégorie de personnel ---------- */
const RH_TABS = [
  ['personnel', 'Personnel et responsables', 'briefcase', ['DIRECTEUR_GENERAL', 'ADMIN_LOGISTIQUE']],
  ['staff-managers', 'Responsables', 'briefcase', ['SUPER_ADMIN']],
  ['drivers', 'Chauffeurs', 'truck'],
  ['staff-mech', 'Mécaniciens', 'wrench'],
  ['staff-hse', 'Agents HSE', 'hard-hat'],
  ['staff-store', 'Gestionnaires de stock', 'package'],
  ['staff-pointer', 'Pointeurs', 'clock'],
];
const RH_BAR = false; // désactivé : le menu Ressources humaines liste déjà ces écrans (pas de doublon)
function rhTabsFor() { const r = state.user && state.user.role; return RH_TABS.filter((t) => !t[3] || t[3].includes(r)); }
function rhGo(v) { go(v); }
{
  const _rv = renderView;
  renderView = async function (view) {
    await _rv.apply(this, arguments);
    try {
      const tabs = rhTabsFor();
      if (RH_BAR && PROF.key && state.view === view && tabs.some((t) => t[0] === view) && ['DG', 'LOGI'].includes(PROF.key) && !document.getElementById('rh-tabs')) {
        const html = `<div id="rh-tabs"><div class="sy-tabs-t">${PROF_IC('users')} Ressources humaines</div>${syTabs(tabs, view, 'rhGo')}</div>`;
        const c = document.getElementById('pf-crumb');
        if (c) c.insertAdjacentHTML('afterend', html); else root().insertAdjacentHTML('afterbegin', html);
      }
    } catch (e) {}
  };
}

/* ---------- Recherche : elle ne cherche que ce qui concerne l'écran ouvert ---------- */
const GS_SCOPES = [
  [['stock', 'dash-stock', 'needs', 'purchases', 'reports-stock', 'staff-store'], ['items', 'suppliers'], 'Rechercher un article, un fournisseur…'],
  [['fuel'], ['vehicles'], 'Rechercher un camion ou un véhicule…'],
  [['trucks', 'service-vehicles', 'vehicles', 'fleet-trucks', 'fleet-service', 'maintenance', 'atelier', 'dash-fleet', 'reports-truck'], ['vehicles', 'trips'], 'Rechercher un camion, un véhicule, une mission…'],
  [['drivers', 'personnel', 'staff-managers', 'staff-mech', 'staff-hse', 'staff-pointer', 'driver-devices', 'enrol', 'pointage'], ['drivers'], 'Rechercher un chauffeur…'],
  [['driver-missions', 'driver-board', 'driver-sheets', 'driver-expenses', 'ops-validation'], ['trips', 'drivers', 'vehicles'], 'Rechercher une mission, un chauffeur…'],
];
function gsScope() { const v = state.view || ''; const s = GS_SCOPES.find((x) => x[0].includes(v)); return s ? s[1] : null; }
function gsPlaceholder() {
  const i = document.getElementById('gs-input'); if (!i) return;
  const v = state.view || '', s = GS_SCOPES.find((x) => x[0].includes(v));
  i.placeholder = s ? s[2] : 'Rechercher…';
  const p = document.getElementById('gs-panel'); if (p) p.style.display = 'none';
  gsShow();
}
/* Barre de recherche générale retirée de tous les écrans (demande du client) :
   chaque liste garde ses propres filtres. Le code de recherche reste en place, simplement masqué. */
gsShow = function () { const w = document.getElementById('gs-wrap'); if (w) w.style.display = 'none'; };
{
  const _g = go;
  go = function () { const r = _g.apply(this, arguments); try { gsPlaceholder(); } catch (e) {} return r; };
}
