import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { VALIDATION_PIPE_OPTIONS } from '../../src/main';

/**
 * T030.12D — helper dùng CHUNG cho mọi `*.e2e-spec.ts` khởi tạo `INestApplication` từ 1
 * `TestingModule` đã compile sẵn (`Test.createTestingModule({ imports: [AppModule] }).compile()`,
 * KHÔNG đổi bước này — helper chỉ nhận module đã compile, không tự compile).
 *
 * Trước T030.12D: 21/22 file `*.e2e-spec.ts` tự lặp lại `createNestApplication()` +
 * `setGlobalPrefix(...)` + `app.init()` NHƯNG KHÔNG gọi `useGlobalPipes(new ValidationPipe(...))`
 * — vì cơ chế đó chỉ tồn tại bên trong `bootstrap()` (main.ts), một hàm E2E test không bao giờ gọi
 * (E2E dùng `Test.createTestingModule` + `createNestApplication()` trực tiếp, không qua
 * `NestFactory.create` + `bootstrap()`). Hậu quả: request thiếu/sai field lẽ ra phải bị chặn ở
 * tầng validation (400) lại lọt thẳng xuống service/repository, gây lỗi 500 không kiểm soát được ở
 * tầng sai (xem docs/setup/T030.12-CARRY-OVER-SOURCE-CLASSIFICATION.md và báo cáo điều tra
 * "PRODUCT TYPE CONTRACT INVESTIGATION REPORT — T030.12C").
 *
 * Helper này dùng CHÍNH `VALIDATION_PIPE_OPTIONS` export từ `src/main.ts` — không định nghĩa lại
 * một bộ tùy chọn khác — để E2E không bao giờ lệch khỏi hợp đồng validation thật của production.
 * KHÔNG import/gọi `bootstrap()` — E2E vẫn hoàn toàn không phụ thuộc side-effect của main.ts
 * (helmet/CORS/Swagger/WebSocket adapter/`app.listen()` không áp dụng ở đây, đúng như trước).
 */
export async function createE2eApp(
  moduleFixture: TestingModule,
): Promise<INestApplication> {
  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
  await app.init();
  return app;
}
