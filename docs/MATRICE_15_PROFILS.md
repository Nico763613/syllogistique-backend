# Matrice des droits de consultation (15 profils) — résultat du serveur

Source : intégration continue, exécution 46084766008 (commit e2e831d), étape « Recette des 15 profils ». Résultat : 106 écrans × 15 profils, aucun accès non prévu, 0 refus à examiner, 5 refus voulus par une règle métier (appareil chauffeur non activé, compte sans fiche chauffeur).

À noter : 43 écrans de consultation (véhicules, missions, clients, transferts…) sont ouverts à tous les profils sauf Chauffeur, à l'intérieur de leur entreprise et de leur site. C'est le fonctionnement prévu du code actuel ; le restreindre davantage serait une évolution à décider (voir le rapport final, réserves).

Généré par scripts/profils15.js le 2026-11-28T00:30:46.771Z sur une base de test.
« oui » = accès accordé et prévu ; « non » = refus (403) prévu ; « 403? » = refus alors que le code l'autorise ; « NNN! » = accès NON prévu (faille) ; « appareil » = rôle autorisé mais refus voulu par la règle « un appareil activé par chauffeur ».

| Écran | SA | DG | LOG | FLO | MAG | CHF | LEC | COM | CAI | GHSE | AHSE | MEC | POI | CPT | OPS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/audit` | oui | oui | oui | oui | oui | non | non | non | non | non | non | non | non | non | non |
| `/auth/photo` | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/cash-sessions` | oui | oui | oui | non | non | non | oui | oui | oui | non | non | non | non | oui | oui |
| `/cash-sessions/current` | oui | non | oui | non | non | non | non | oui | oui | non | non | non | non | non | non |
| `/costs/summary` | oui | oui | oui | oui | non | non | oui | non | non | non | non | non | non | non | non |
| `/customers` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/customers/check-duplicates` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/dashboards/commercial` | oui | oui | oui | non | non | non | oui | oui | oui | non | non | non | non | non | non |
| `/dashboards/direction` | oui | oui | non | non | non | non | non | non | non | non | non | non | non | non | non |
| `/dashboards/executive` | oui | oui | oui | non | non | non | oui | non | non | non | non | non | non | non | non |
| `/dashboards/fleet` | oui | oui | oui | oui | non | non | oui | non | non | non | non | non | non | non | non |
| `/dashboards/hse` | oui | oui | oui | non | non | non | oui | non | non | oui | oui | non | non | non | non |
| `/dashboards/logistics` | oui | oui | oui | non | oui | non | oui | non | non | non | non | non | non | non | non |
| `/dashboards/stock` | oui | oui | oui | non | oui | non | oui | non | non | non | non | non | non | non | non |
| `/dashboards/workspace` | non | non | non | non | oui | non | non | non | non | oui | oui | oui | oui | non | non |
| `/documents` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/documents/compliance` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/downtimes` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/driver-admin/board` | oui | non | oui | oui | non | non | non | non | non | non | non | non | non | non | non |
| `/driver-admin/changes` | oui | non | oui | oui | non | non | non | non | non | non | non | non | non | oui | oui |
| `/driver-admin/expenses` | oui | oui | oui | oui | non | non | non | non | non | non | non | non | non | oui | oui |
| `/driver-admin/missions` | oui | non | oui | oui | non | non | non | non | non | non | non | non | non | non | non |
| `/driver-admin/overview` | oui | non | oui | oui | non | non | non | non | non | non | non | non | non | non | non |
| `/driver-admin/pointers` | oui | non | oui | oui | non | non | non | non | non | non | non | non | non | non | non |
| `/driver-admin/reports/day` | oui | oui | oui | oui | non | non | oui | non | non | non | non | non | non | non | oui |
| `/driver-admin/sheets` | oui | non | oui | oui | non | non | non | non | non | non | non | non | non | non | oui |
| `/driver-admin/sheets/pending` | oui | non | non | non | non | non | non | non | non | non | non | non | non | non | oui |
| `/driver-signup` | oui | non | oui | oui | non | non | non | non | non | non | non | non | non | non | non |
| `/driver-signup/link` | oui | non | oui | oui | non | non | non | non | non | non | non | non | non | non | non |
| `/driver/history` | non | non | non | non | non | appareil | non | non | non | non | non | non | non | non | non |
| `/driver/me` | non | non | non | non | non | appareil | non | non | non | non | non | non | non | non | non |
| `/driver/sheet` | non | non | non | non | non | appareil | non | non | non | non | non | non | non | non | non |
| `/driver/transmissions` | non | non | non | non | non | appareil | non | non | non | non | non | non | non | non | non |
| `/driver/vehicles` | non | non | non | non | non | appareil | non | non | non | non | non | non | non | non | non |
| `/drivers` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/drivers/attendance/day` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/expenses` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/fuel` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/hse/actions` | oui | oui | oui | non | non | non | oui | non | non | oui | oui | non | non | non | non |
| `/hse/incidents` | oui | oui | oui | non | non | non | oui | non | non | oui | oui | non | non | non | non |
| `/hse/inspections` | oui | oui | oui | non | non | non | oui | non | non | oui | oui | non | non | non | non |
| `/hse/talks` | oui | oui | oui | non | non | non | oui | non | non | oui | oui | non | non | non | non |
| `/inventory/analysis` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/inventory/categories` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/inventory/counts` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/inventory/delivery-note` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/inventory/items` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/inventory/movements` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/inventory/movements/export/excel` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/inventory/valuation` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/maintenance` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/maintenance-plans` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/maintenance/alerts` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/maintenance/recap` | oui | oui | oui | oui | non | non | oui | non | non | non | non | non | non | non | oui |
| `/maintenance/types` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/needs` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/needs/suggestions` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/notifications` | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/payments` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/payments/pending` | oui | oui | oui | non | non | non | non | oui | oui | non | non | non | non | oui | non |
| `/pointer/day` | oui | non | non | non | non | non | non | non | non | non | non | non | oui | non | non |
| `/purchases/invoices` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/purchases/orders` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/purchases/price-requests` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/purchases/reorder` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/reports/daily` | oui | oui | oui | oui | oui | non | oui | non | non | non | non | non | non | oui | oui |
| `/reports/daily/export/pdf` | oui | oui | oui | oui | oui | non | oui | non | non | non | non | non | non | oui | oui |
| `/reports/dashboard` | oui | oui | oui | oui | oui | non | oui | non | non | non | non | non | non | oui | oui |
| `/reports/fleet-recap` | oui | oui | oui | oui | non | non | oui | non | non | non | non | non | non | non | oui |
| `/reports/missions/pdf` | oui | non | oui | oui | non | non | non | non | non | non | non | non | non | non | non |
| `/reports/period` | oui | oui | oui | oui | oui | non | oui | non | non | non | non | non | non | oui | oui |
| `/reports/period/export/excel` | oui | oui | oui | oui | oui | non | oui | non | non | non | non | non | non | oui | oui |
| `/reports/period/export/pdf` | oui | oui | oui | oui | oui | non | oui | non | non | non | non | non | non | oui | oui |
| `/reports/period/whatsapp-link` | oui | oui | oui | oui | oui | non | oui | non | non | non | non | non | non | oui | oui |
| `/sales/dashboard` | oui | oui | oui | non | non | non | non | oui | non | non | non | non | non | oui | non |
| `/sales/invoices` | oui | oui | oui | non | oui | non | oui | oui | oui | non | non | non | non | oui | non |
| `/sales/orders` | oui | oui | oui | non | oui | non | oui | oui | oui | non | non | non | non | oui | non |
| `/sales/reports/pdf` | oui | oui | oui | non | non | non | non | oui | non | non | non | non | non | oui | non |
| `/sales/reports/xlsx` | oui | oui | oui | non | non | non | non | oui | non | non | non | non | non | oui | non |
| `/sales/returns` | oui | oui | oui | non | non | non | oui | oui | oui | non | non | non | non | non | non |
| `/sales/tariffs` | oui | oui | oui | non | oui | non | non | oui | oui | non | non | non | non | oui | non |
| `/sales/transport/unbilled` | oui | oui | oui | non | non | non | oui | oui | non | non | non | non | non | oui | oui |
| `/search` | oui | oui | oui | oui | non | non | oui | non | non | non | non | non | non | non | oui |
| `/settings` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/settings/fuel-price` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/settings/numbering` | oui | oui | oui | non | non | non | non | non | non | non | non | non | non | non | non |
| `/settings/organization` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/sites` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/staff` | oui | oui | oui | non | non | non | oui | non | non | oui | non | non | non | non | non |
| `/staff/enrolment` | oui | oui | oui | non | non | non | oui | non | non | oui | non | non | non | non | non |
| `/staff/reports` | oui | oui | oui | non | non | non | oui | non | non | oui | non | non | non | non | non |
| `/staff/reports/mine` | non | non | non | non | oui | non | non | non | non | oui | oui | oui | oui | non | non |
| `/staff/reports/pending` | oui | non | non | non | non | non | non | non | non | non | non | non | non | non | oui |
| `/suppliers` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/support/reports` | oui | non | non | non | non | non | non | non | non | non | non | non | non | non | non |
| `/sync/conflicts` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/sync/conflicts/count` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/sync/log` | oui | non | oui | oui | non | non | non | non | non | non | non | non | non | non | non |
| `/sync/pending-count` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/transfers` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/trips` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/user-devices` | oui | non | non | non | non | non | non | non | non | non | non | non | non | non | non |
| `/users` | oui | oui | oui | non | non | non | oui | non | non | non | non | non | non | non | non |
| `/vehicles` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/vehicles/availability` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| `/vehicles/fleet-overview` | oui | oui | oui | oui | oui | non | oui | oui | oui | oui | oui | oui | oui | oui | oui |

Légende : SA = SUPER_ADMIN, DG = DIRECTEUR_GENERAL, LOG = ADMIN_LOGISTIQUE, FLO = GESTIONNAIRE_FLOTTE, MAG = MAGASINIER, CHF = CHAUFFEUR, LEC = LECTEUR, COM = RESPONSABLE_COMMERCIAL, CAI = CAISSIER, GHSE = GESTIONNAIRE_HSE, AHSE = AGENT_HSE, MEC = MECANICIEN, POI = POINTEUR, CPT = COMPTABLE, OPS = RESPONSABLE_OPERATIONS.
