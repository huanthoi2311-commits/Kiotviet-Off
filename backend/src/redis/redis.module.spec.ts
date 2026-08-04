import Redis from 'ioredis';
import { RedisModule } from './redis.module';

/**
 * T030.9 — trước đây RedisModule KHÔNG có spec nào. Test ở đây nhắm vào chính LỚP `RedisModule`
 * (không phải factory `useFactory` bên trong `@Module({...})`, vốn cần 1 kết nối ioredis thật để
 * kiểm chứng đầy đủ — xem Phase A/B của IMPLEMENTATION REPORT — T030.9) — cụ thể là hợp đồng
 * `onApplicationShutdown()`: đóng đúng 1 lần, idempotent nếu bị gọi nhiều lần, không throw ra
 * ngoài dù `quit()` reject.
 */
describe('RedisModule.onApplicationShutdown() — T030.9', () => {
  let client: { quit: jest.Mock };

  beforeEach(() => {
    client = { quit: jest.fn().mockResolvedValue('OK') };
  });

  it('gọi client.quit() đúng 1 lần khi shutdown', async () => {
    const module = new RedisModule(client as unknown as Redis);
    await module.onApplicationShutdown();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('[T030.9] gọi onApplicationShutdown() 2 lần liên tiếp — quit() CHỈ được gọi 1 lần (idempotent)', async () => {
    const module = new RedisModule(client as unknown as Redis);
    await module.onApplicationShutdown();
    await module.onApplicationShutdown();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('[T030.9] quit() reject (vd client chưa từng kết nối được) — onApplicationShutdown() KHÔNG throw, không chặn phần còn lại của shutdown sequence', async () => {
    client.quit.mockRejectedValue(new Error('connection already closed'));
    const module = new RedisModule(client as unknown as Redis);
    await expect(module.onApplicationShutdown()).resolves.toBeUndefined();
  });

  it('[T030.9] quit() reject vẫn được tính là ĐÃ shutdown — gọi lại lần 2 không thử quit() lại', async () => {
    client.quit.mockRejectedValueOnce(new Error('connection already closed'));
    const module = new RedisModule(client as unknown as Redis);
    await module.onApplicationShutdown();
    await module.onApplicationShutdown();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});
