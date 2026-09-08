import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors();
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
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads/' });

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

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 SYLLOGISTIQUE API démarrée sur http://localhost:${port}`);
  console.log(`📘 Documentation Swagger : http://localhost:${port}/docs`);
}
bootstrap();
