import { PrismaService } from '../prisma.service';

// Alertes de stock INSTANTANÉES (en plus du contrôle quotidien de 6h00) : émises au moment
// où une quantité franchit un seuil, une seule fois par franchissement (pas de doublons).
//  - rupture      : le stock passe à 0 ou moins            → CRITIQUE
//  - seuil minimum: le stock passe sous le seuil minimum   → AVERTISSEMENT
//  - seuil maximum: le stock dépasse le seuil maximum      → INFO
// Une panne d'alerte ne doit jamais bloquer une opération de stock : les erreurs sont ignorées.
export async function alertStockThresholds(
  prisma: PrismaService,
  item: { id: string; name: string; unit: string; minimumQuantity: unknown; maximumQuantity?: unknown },
  before: number,
  after: number,
) {
  try {
    const min = Number(item.minimumQuantity ?? 0);
    const max = item.maximumQuantity === null || item.maximumQuantity === undefined ? null : Number(item.maximumQuantity);
    const fmt = (n: number) => n.toLocaleString('fr-FR');
    const make = (title: string, message: string, severity: 'INFO' | 'WARNING' | 'CRITICAL') =>
      prisma.notification.create({ data: { title, message, severity, entity: 'InventoryItem', entityId: item.id } });

    if (after <= 0 && before > 0) {
      await make('Rupture de stock', `${item.name} : stock épuisé (${fmt(after)} ${item.unit}).`, 'CRITICAL');
    } else if (after < min && before >= min) {
      await make(
        'Stock sous le seuil minimum',
        `${item.name} : ${fmt(after)} ${item.unit} restant (seuil minimum : ${fmt(min)}).`,
        'WARNING',
      );
    }
    if (max !== null && after > max && before <= max) {
      await make(
        'Stock au-dessus du seuil maximum',
        `${item.name} : ${fmt(after)} ${item.unit} (seuil maximum : ${fmt(max)}).`,
        'INFO',
      );
    }
  } catch {
    /* alerte non bloquante */
  }
}
