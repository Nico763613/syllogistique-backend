import { PrismaService } from '../prisma.service';

// Émetteur d'un document : nom, téléphone et fonction de l'agent connecté (traçabilité des documents)
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Administrateur Général',
  ADMIN_LOGISTIQUE: 'Administrateur Logistique',
  GESTIONNAIRE_FLOTTE: 'Gestionnaire de flotte',
  MAGASINIER: 'Magasinier',
  CHAUFFEUR: 'Chauffeur',
  LECTEUR: 'Lecteur / Superviseur',
  DIRECTEUR_GENERAL: 'Directeur Général',
  MECANICIEN: 'Mécanicien',
  POINTEUR: 'Pointeur',
  COMPTABLE: 'Comptabilité',
};

export async function getIssuer(prisma: PrismaService, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  return {
    name: user ? `${user.firstName} ${user.lastName}` : '—',
    phone: user?.phone ?? '',
    service: user ? ROLE_LABELS[user.role.name] ?? user.role.name : '',
  };
}
