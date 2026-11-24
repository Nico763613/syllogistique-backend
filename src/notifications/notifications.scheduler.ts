import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';
import { RoleAlertsService } from './role-alerts.service';

// Exécute automatiquement les vérifications d'alerte chaque jour à 6h00
// (permis, stock sous seuil, entretiens en retard) — plus besoin d'appeler
// /notifications/run-checks manuellement.
@Injectable()
export class NotificationsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(private notificationsService: NotificationsService, private roleAlerts: RoleAlertsService) {}

  // Rattrapage au réveil : sur un hébergement qui met le service en veille, les horaires de 06:00/06:30 peuvent être manqués.
  // Les contrôles sont sans doublon (une alerte déjà émise n'est pas recréée), on peut donc les relancer sans risque.
  onApplicationBootstrap() {
    setTimeout(async () => {
      try {
        const r = await this.notificationsService.runDailyChecksAllSites();
        const n = await this.roleAlerts.run();
        this.logger.log(`Rattrapage au démarrage : ${r.generated} alerte(s) générale(s), ${n} alerte(s) par rôle.`);
      } catch (e) {
        this.logger.error(`Rattrapage au démarrage en échec : ${(e as Error).message}`);
      }
    }, 90_000);
  }

  @Cron('0 6 * * *') // tous les jours à 06:00
  async handleDailyChecks() {
    const result = await this.notificationsService.runDailyChecksAllSites();
    this.logger.log(`Vérifications quotidiennes : ${result.generated} alerte(s) générée(s) sur ${result.sitesChecked} site(s).`);
  }
}
