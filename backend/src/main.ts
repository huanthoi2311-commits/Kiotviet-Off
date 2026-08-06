import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { isOriginAllowed } from './config/cors.util';
import { validateEnv } from './config/env.validation';
import { winstonLogger } from './logger/winston.logger';
import { ValidatedCorsIoAdapter } from './websocket/validated-cors.adapter';

/**
 * T030.12D — trích xuất thành hằng số export được để E2E test (backend/test/helpers/
 * create-e2e-app.ts) dùng CHUNG chính xác cùng 1 bộ tùy chọn với production, thay vì mỗi
 * `*.e2e-spec.ts` tự định nghĩa lại (hoặc quên định nghĩa — đây chính là nguyên nhân gốc khiến
 * 21/22 E2E suite trước đó không hề áp dụng ValidationPipe). Không đổi giá trị, không đổi hành vi
 * production — chỉ đặt tên cho object đã có sẵn.
 */
export const VALIDATION_PIPE_OPTIONS = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
} as const;

/**
 * T030.7 (AD-5 point 1/2) — điểm gọi validation TƯỜNG MINH, đứng trước bước khởi tạo Nest app
 * trong chính văn bản của hàm này. Xác minh nguồn (Mandatory Source Verification) cho thấy
 * `ConfigModule.forRoot({ validate: validateEnv })` (app.module.ts) đã tự chạy `validateEnv`
 * ĐỒNG BỘ ngay khi `ConfigModule.forRoot(...)` được gọi — tức là trong lúc `app.module.ts` được
 * `import`, TRƯỚC CẢ khi `bootstrap()` bắt đầu chạy — nên trên thực tế, cấu hình sai đã fail-fast
 * từ trước khi tới được dòng này. Lệnh gọi tường minh dưới đây KHÔNG thay thế cơ chế đó (không sửa
 * ConfigModule ownership, không thêm khung cấu hình thứ 2 — vẫn cùng 1 hàm `validateEnv` duy
 * nhất): nó tồn tại để (a) không phụ thuộc vào một chi tiết triển khai nội bộ của `@nestjs/config`
 * mà bản thân file `main.ts` không hề thể hiện, và (b) đảm bảo lỗi cấu hình luôn được log qua
 * `winstonLogger` với định dạng nhất quán, thay vì đôi khi rơi vào stack trace thô của Node khi
 * throw xảy ra ở thời điểm module-import.
 */
export function handleBootstrapFailure(
  error: unknown,
  exit: (code: number) => never = (code) => process.exit(code),
): void {
  winstonLogger.error(
    error instanceof Error ? error.stack : error,
    undefined,
    'BootstrapFailure',
  );
  exit(1);
}

async function bootstrap() {
  // AD-5 point 1 — cổng fail-fast tường minh, chạy trước bước khởi tạo Nest app bên dưới. Xem
  // comment trên handleBootstrapFailure() để biết vì sao lệnh gọi này an toàn/không trùng lặp có hại.
  validateEnv(process.env);

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
  // T032.01E (R1 recovery) — /metrics phải nằm ngoài prefix api/v1, cùng quy ước với /health.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] });

  const corsOrigins = config.get<string[]>('cors.origins')!;
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (isOriginAllowed(origin, corsOrigins)) {
        callback(null, true);
      } else {
        callback(
          new Error(`Origin "${origin}" không nằm trong CORS whitelist`),
        );
      }
    },
    credentials: true,
  });
  // T030.6 — WebSocket dùng CHUNG danh sách origin đã validate ở trên (không tự đọc biến môi
  // trường CORS_ORIGIN, không parse lại) — xem websocket/validated-cors.adapter.ts.
  app.useWebSocketAdapter(new ValidatedCorsIoAdapter(app, corsOrigins));

  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));

  if (config.get<boolean>('swagger.enabled')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('POS ERP Enterprise API')
        .setDescription('API cho hệ thống POS ERP Enterprise v1.0')
        .setVersion('1.0')
        .addBearerAuth()
        // T032.03 (RFC-T031 D09) — WEB client gửi refresh token qua HttpOnly
        // cookie (auth.controller.ts's REFRESH_COOKIE_NAME), chưa từng được
        // đăng ký làm security scheme nên @ApiCookieAuth() ở route không có
        // gì để tham chiếu tới trước bản sửa này.
        .addCookieAuth(
          'refresh_token',
          { type: 'apiKey', in: 'cookie', name: 'refresh_token' },
          'refreshCookie',
        )
        .build(),
    );
    SwaggerModule.setup(config.get<string>('swagger.path')!, app, document);
  }

  await app.listen(config.get<number>('port')!);
}
// T030.7 (AD-5 point 2) — trước đây khởi chạy bootstrap() mà không gắn .catch() khiến 1 rejection
// trong quá trình khởi tạo Nest app (vd PrismaService.onModuleInit()'s $connect() thất bại —
// DISCOVERY-T030 F15/F33) chỉ đi qua unhandledRejection handler ở trên (log-only, KHÔNG
// process.exit) — tiến trình treo vô hạn, không bao giờ bind port, không bao giờ thoát. Đây là cơ
// chế lifecycle SẴN CÓ hẹp nhất để sửa: bắt đúng promise mà bootstrap() đã trả về, không thêm
// probe/retry/redesign Prisma nào.
//
// `require.main === module` — CHỈ tự chạy bootstrap khi file này được thực thi trực tiếp (`node
// dist/main.js`/`ts-node src/main.ts`), KHÔNG chạy khi bị `import` (vd từ main.spec.ts để test
// handleBootstrapFailure trong cô lập) — thiếu guard này, riêng việc import file sẽ kích hoạt toàn
// bộ quá trình khởi tạo Nest app thật bên trong tiến trình Jest, phát hiện thật khi viết test cho
// T030.7.
if (require.main === module) {
  bootstrap().catch(handleBootstrapFailure);
}
