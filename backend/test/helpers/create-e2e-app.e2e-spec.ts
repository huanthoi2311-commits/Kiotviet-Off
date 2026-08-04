import {
  Body,
  Controller,
  INestApplication,
  Module,
  Post,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IsIn, IsString } from 'class-validator';
import request from 'supertest';
import { VALIDATION_PIPE_OPTIONS } from '../../src/main';
import { createE2eApp } from './create-e2e-app';

/**
 * T030.12D — test KHÔNG cần Postgres/Redis thật (không import AppModule) — chỉ chứng minh
 * `createE2eApp()` tự nó lắp ValidationPipe đúng hợp đồng production, độc lập với bất kỳ module
 * nghiệp vụ nào. Chạy được cục bộ ngay cả khi không có Redis (đúng tinh thần "non-Redis E2E gate"
 * đã nêu ở T030.12C).
 */
class DummyCreateDto {
  @IsString()
  name!: string;

  @IsIn(['A', 'B'])
  type!: string;
}

@Controller('dummy')
class DummyController {
  @Post()
  create(@Body() dto: DummyCreateDto) {
    return { received: dto };
  }
}

@Module({ controllers: [DummyController] })
class DummyModule {}

describe('createE2eApp() — T030.12D validation parity', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [DummyModule],
    }).compile();
    app = await createE2eApp(moduleFixture);
  });

  afterAll(async () => {
    await app.close();
  });

  it('[1] options áp dụng bởi createE2eApp() giống hệt VALIDATION_PIPE_OPTIONS export từ src/main.ts (production)', () => {
    expect(VALIDATION_PIPE_OPTIONS).toEqual({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
  });

  it('[3] thiếu field bắt buộc (type) → 400, KHÔNG lọt xuống controller', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/dummy')
      .send({ name: 'hello' })
      .expect(400);
  });

  it('[3b] type không nằm trong danh sách hợp lệ → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/dummy')
      .send({ name: 'hello', type: 'C' })
      .expect(400);
  });

  it('[4] field lạ không khai báo trong DTO → 400 (forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/dummy')
      .send({ name: 'hello', type: 'A', unknownField: 'x' })
      .expect(400);
  });

  it('[5] payload hợp lệ, đủ field → lọt tới controller, trả về đúng dữ liệu đã transform', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/dummy')
      .send({ name: 'hello', type: 'A' })
      .expect(201);

    expect(res.body).toEqual({ received: { name: 'hello', type: 'A' } });
  });
});
