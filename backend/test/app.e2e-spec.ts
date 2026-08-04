import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  // T030.9 — trước đây `.expect(200)` cứng, viết TRƯỚC T027.7 (Health Endpoint Behavior) và
  // chưa từng được cập nhật theo — sai khi Redis không khả dụng (200 chỉ đúng khi MỌI dependency
  // healthy; Redis down là 503 "degraded", ĐÚNG chính sách, không phải lỗi). Sửa theo đúng mẫu đã
  // dùng ở `platform.e2e-spec.ts` (chấp nhận cả 200 lẫn 503, chỉ assert hình dạng envelope).
  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect((res: Response) => {
        if (res.status !== 200 && res.status !== 503) {
          throw new Error(`Expected HTTP 200 or 503, got ${res.status}`);
        }
        const body = res.body as { data?: { status?: string } };
        if (!body?.data?.status) {
          throw new Error(
            'Expected health check response to include data.status',
          );
        }
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
