import { Response } from 'express';
import { AppController } from './app.controller';
import { PrismaService } from './prisma/prisma.service';

/**
 * T027.7 (SPEC-T027-SystemIntegration-Recovery-v2 §11, Implementation-Plan-T027-SystemIntegration
 * §T027.7) — file này KHÔNG tồn tại trước T027.7. `check()` dùng `@Res()` để tự kiểm soát response
 * (bỏ qua TransformInterceptor/HttpExceptionFilter mặc định), nên phải mock trực tiếp
 * `res.status().json()` thay vì assert trên giá trị trả về của method.
 */
describe('AppController', () => {
  let controller: AppController;
  let prisma: { $queryRaw: jest.Mock };
  let redis: { ping: jest.Mock };
  let res: { status: jest.Mock; json: jest.Mock };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    redis = { ping: jest.fn().mockResolvedValue('PONG') };
    res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);

    controller = new AppController(
      prisma as unknown as PrismaService,
      redis as never,
    );
  });

  it('trả về HTTP 200 kèm envelope success khi database và redis đều healthy', async () => {
    await controller.check(res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: {
          status: 'ok',
          uptime: expect.any(Number),
          dependencies: { database: 'up', redis: 'up' },
        },
        meta: null,
        traceId: null,
        timestamp: expect.any(String),
      }),
    );
  });

  it('trả về HTTP 503 kèm envelope cấu trúc giống hệt khi 1 dependency down (T027.7 — Health Endpoint Behavior)', async () => {
    redis.ping.mockRejectedValue(new Error('ECONNREFUSED'));

    await controller.check(res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: {
          status: 'degraded',
          uptime: expect.any(Number),
          dependencies: { database: 'up', redis: 'down' },
        },
        meta: null,
        traceId: null,
        timestamp: expect.any(String),
      }),
    );
  });

  it('[T030.9] redis.ping() TREO VÔ THỜI HẠN (Redis đang retry kết nối nội bộ) — /health VẪN trả 503 trong giới hạn thời gian xác định, KHÔNG chờ ping() mãi mãi', async () => {
    jest.useFakeTimers();
    try {
      redis.ping.mockReturnValue(new Promise(() => {}));

      const checkPromise = controller.check(res as unknown as Response);
      // Đủ lớn hơn REDIS_HEALTH_CHECK_TIMEOUT_MS (1500ms) — nếu logic timeout không hoạt động,
      // promise này sẽ KHÔNG BAO GIỜ resolve và test sẽ timeout thật (fail rõ ràng, không treo im lặng).
      await jest.advanceTimersByTimeAsync(2000);
      await checkPromise;

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'degraded',
            dependencies: { database: 'up', redis: 'down' },
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
