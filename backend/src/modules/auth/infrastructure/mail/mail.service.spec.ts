import { Queue } from 'bullmq';
import { MailService } from './mail.service';
import { SEND_OTP_EMAIL_JOB } from './mail.constants';

/**
 * T030.9 — trước đây KHÔNG có spec nào cho MailService (xác nhận qua Mandatory Source
 * Verification). Tập trung vào yêu cầu "Redis-backed operations must fail deterministically and
 * promptly" — cụ thể là hành vi timeout mới thêm quanh `Queue.add()`, vì BullMQ's connection dùng
 * `maxRetriesPerRequest: null` (bắt buộc), nghĩa là bản thân `.add()` có thể treo vô thời hạn nếu
 * không có giới hạn ở tầng gọi.
 */
describe('MailService — T030.9', () => {
  let service: MailService;
  let queue: jest.Mocked<Pick<Queue, 'add'>>;

  beforeEach(() => {
    queue = { add: jest.fn() };
    service = new MailService(queue as unknown as Queue);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('happy path — enqueue đúng tên job + đúng data (to/otp), Redis khả dụng bình thường', async () => {
    queue.add.mockResolvedValue(undefined as never);
    await service.sendOtpEmail('user@example.com', '123456');
    expect(queue.add).toHaveBeenCalledWith(
      SEND_OTP_EMAIL_JOB,
      expect.objectContaining({ to: 'user@example.com', otp: '123456' }),
    );
  });

  it('Queue.add() reject bình thường (vd lỗi nghiệp vụ BullMQ) → propagate nguyên vẹn, không bị timeout logic nuốt mất', async () => {
    const queueError = new Error('some bullmq error');
    queue.add.mockRejectedValue(queueError);
    await expect(
      service.sendOtpEmail('user@example.com', '123456'),
    ).rejects.toBe(queueError);
  });

  it('[T030.9] Queue.add() treo vô thời hạn (Redis/BullMQ không khả dụng) → sendOtpEmail() vẫn reject NHANH VÀ CÓ GIỚI HẠN (không treo mãi request HTTP gọi nó)', async () => {
    jest.useFakeTimers();
    // .add() không bao giờ resolve/reject — mô phỏng đúng tình huống ioredis giữ lệnh trong
    // offline queue vô thời hạn khi maxRetriesPerRequest: null + Redis không khả dụng.
    queue.add.mockReturnValue(new Promise(() => {}) as never);

    const promise = service.sendOtpEmail('user@example.com', '123456');
    const assertion = expect(promise).rejects.toThrow(
      /Redis\/BullMQ có thể đang không khả dụng/,
    );

    await jest.advanceTimersByTimeAsync(3000);
    await assertion;
  });

  it('[T030.9] KHÔNG timeout sớm hơn cần thiết — Queue.add() resolve TRƯỚC mốc timeout vẫn coi là thành công', async () => {
    jest.useFakeTimers();
    queue.add.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(undefined), 500);
        }) as never,
    );

    const promise = service.sendOtpEmail('user@example.com', '123456');
    await jest.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toBeUndefined();
  });
});
