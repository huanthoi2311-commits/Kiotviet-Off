import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { winstonLogger } from './logger/winston.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: winstonLogger });
  const config = app.get(ConfigService);

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.enableCors({
    origin: config.get<string>('cors.origin'),
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
