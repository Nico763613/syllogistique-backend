import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';

// Exécute automatiquement les vérifications d'alerte chaque jour à 6h00
// (permis, stock sous seuil, entretiens en retard) — plus besoin d'appeler
// /notifications/run-checks manuellement.
@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(private notificationsService: NotificationsService) {}

  @Cron('0 6 * * *') // tous les jours à 06:00
  async handleDailyChecks() {
    const result = await this.notificationsService.runDailyChecksAllSites();
    this.logger.log(`Vérifications quotidiennes : ${result.generated} alerte(s) générée(s) sur ${result.sitesChecked} site(s).`);
  }
}
