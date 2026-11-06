import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Un profil chauffeur = un seul appareil actif. L'appareil envoie son identifiant dans l'en-tête x-device-id.
// Appareil bloqué / révoqué / inconnu => 403 DEVICE_BLOCKED (l'application se verrouille).
@Injectable()
export class DriverDeviceGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const deviceId = req.headers['x-device-id'];
    const deny = (message: string) => new ForbiddenException({ code: 'DEVICE_BLOCKED', message });
    if (!user) throw deny('Authentification requise.');
    if (!deviceId || typeof deviceId !== 'string') throw deny("Cet appareil n'est pas activé. Activez-le avec le code remis par le gestionnaire de flotte.");
    const device = await this.prisma.driverDevice.findUnique({ where: { id: deviceId } });
    if (!device || device.userId !== user.userId) throw deny("Appareil inconnu pour ce compte.");
    if (device.status === 'BLOCKED') throw deny(`Appareil bloqué par l'administration${device.blockedReason ? ` : ${device.blockedReason}` : '.'}`);
    if (device.status !== 'ACTIVE') throw deny("Appareil non actif (révoqué ou en attente d'activation).");
    if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 60_000) {
      await this.prisma.driverDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
    req.driverDevice = device;
    return true;
  }
}
