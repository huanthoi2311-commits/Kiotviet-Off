import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { validateEnv } from '../src/config/env.validation';

/**
 * T032.03 (RFC-T031 §20, Decision D06) — standalone script producing
 * docs/api/openapi.json, the committed source of truth for Orval codegen
 * (frontend/orval.config.ts). Uses the exact same DocumentBuilder call as
 * main.ts's runtime Swagger setup (kept manually in sync — see the comment
 * there) so the exported document matches what the live app would serve.
 *
 * Never calls app.listen() — boots just far enough to build the document,
 * then exits. Requires a reachable Postgres: PrismaService.onModuleInit()
 * eagerly calls $connect() during Nest's module-initialization phase,
 * confirmed the sole hard blocker (Redis is not — RedisModule connects
 * lazily). Changes zero production runtime behavior.
 */
const OUTPUT_PATH = resolve(__dirname, '../../docs/api/openapi.json');

async function exportOpenApi(): Promise<void> {
  validateEnv(process.env);

  const app = await NestFactory.create(AppModule, { logger: false });
  // Must match main.ts's setGlobalPrefix call exactly — SwaggerModule
  // introspects the app's actual registered routes, so omitting this
  // silently produced paths without the /api/v1 prefix (caught by manually
  // inspecting the first export's output during T032.03 implementation).
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('POS ERP Enterprise API')
      .setDescription('API cho hệ thống POS ERP Enterprise v1.0')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth(
        'refresh_token',
        { type: 'apiKey', in: 'cookie', name: 'refresh_token' },
        'refreshCookie',
      )
      .build(),
  );

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(document, null, 2) + '\n');

  console.log(`OpenAPI document written to ${OUTPUT_PATH}`);
  // T032.04A — deliberately NOT awaiting app.close(). Booting the full AppModule
  // wires up BullMQ's MailProcessor Worker (@nestjs/bullmq), whose internal
  // shutdown sequence races against its own not-yet-settled blocking Redis
  // connection in a process this short-lived: app.close() itself resolves
  // cleanly, but a dangling background handle fires an unhandled "Connection
  // is closed" error afterward (root-caused in T032.04), crashing a process
  // that had already succeeded. The document is already synchronously and
  // durably written by this point (writeFileSync above) — exiting immediately
  // sidesteps the race entirely rather than tolerating or catching it.
  process.exit(0);
}

exportOpenApi().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
