import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
// Import compatible CommonJS / ESM (évite tout souci de typage selon la version de helmet)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const helmetModule = require('helmet');
const helmet = helmetModule.default ?? helmetModule;
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Derrière le proxy de l'hébergeur (Render…) : nécessaire pour que la limite
  // de requêtes s'applique par visiteur et non pour tout le monde à la fois.
  app.set('trust proxy', 1);

  // En-têtes de sécurité HTTP. CORP « cross-origin » : le site Netlify doit pouvoir
  // afficher les images téléversées. Pas de CSP : l'API ne sert que du JSON et des fichiers.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));

  // CORS : seuls les sites listés dans CORS_ORIGINS (séparés par des virgules) peuvent appeler l'API.
  const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length) {
    app.enableCors({ origin: origins });
  } else {
    console.warn('⚠️  CORS_ORIGINS non défini : tous les sites sont autorisés. Définissez-le en production.');
    app.enableCors();
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Fichiers uploadés (photos, reçus, documents) servis statiquement.
  // En production sur un disque éphémère (Render, Railway…), pensez à un volume
  // persistant ou à basculer vers un stockage S3-compatible (voir uploads.controller.ts).
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads/', index: false, dotfiles: 'deny' });

  // Application web SYLLOGISTIQUE (PWA) servie sur /app/ — même adresse que l'API, donc sans CORS.
  app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/app/', index: 'index.html', dotfiles: 'deny' });

  // Site de vente SYLLOGISTIQUE (page d'accueil, paiement Orange Money, espace abonné) servi sur /site/.
  app.useStaticAssets(join(__dirname, '..', 'public', 'site'), { prefix: '/site/', index: 'index.html', dotfiles: 'deny' });

  // Documentation Swagger : désactivée en production (ENABLE_DOCS=true pour la réactiver).
  const docsEnabled = process.env.ENABLE_DOCS === 'true' || process.env.NODE_ENV !== 'production';
  if (docsEnabled) {
    const config = new DocumentBuilder()
      .setTitle('SYLLOGISTIQUE API')
      .setDescription(
        "API de gestion logistique, transport, flotte et stocks — Offline-First",
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 SYLLOGISTIQUE API démarrée sur http://localhost:${port}`);
  if (docsEnabled) console.log(`📘 Documentation Swagger : http://localhost:${port}/docs`);
}
bootstrap();
