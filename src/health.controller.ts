import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

// Contrôle de santé pour l'hébergeur (remplace /docs, désactivé en production).
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  ok() {
    return { status: 'ok' };
  }
}
