import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { winstonLogger } from './logger/winston.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: winstonLogger });
  const config = app.get(ConfigService);

  app.use(
    helmet({
      // Swagger UI cần inline <script>/<style> để bootstrap — nới CSP đúng phần này,
      // vẫn chặn tải script/style từ domain lạ (default-src 'self').
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          scriptSrc: [`'self'`, `'unsafe-inline'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          imgSrc: [`'self'`, 'data:'],
        },
      },
    }),
  );
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  const corsOrigins = config.get<string[]>('cors.origins')!;
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Request không có Origin header (curl, server-to-server, health check...) luôn cho qua.
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(
          new Error(`Origin "${origin}" không nằm trong CORS whitelist`),
        );
      }
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (config.get<boolean>('swagger.enabled')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('POS ERP Enterprise API')
        .setDescription('API cho hệ thống POS ERP Enterprise v1.0')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(config.get<string>('swagger.path')!, app, document);
  }

  await app.listen(config.get<number>('port')!);
}
void bootstrap();
