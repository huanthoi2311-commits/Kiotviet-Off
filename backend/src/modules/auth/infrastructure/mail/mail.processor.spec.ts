import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MailProcessor } from './mail.processor';
import { SendOtpEmailJobData } from './mail.constants';

const sendMailMock = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: sendMailMock })),
}));

function makeConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function makeJob(data: SendOtpEmailJobData): Job<SendOtpEmailJobData> {
  return { id: 'job-1', data } as Job<SendOtpEmailJobData>;
}

/**
 * T030.9 — trước đây KHÔNG có spec nào cho MailProcessor. Tập trung vào "queued jobs are not
 * silently discarded": nếu `process()` NUỐT lỗi gửi mail (không rethrow), BullMQ coi job là
 * completed và KHÔNG BAO GIỜ retry — silently discarding chính là hành vi ĐÓ, không phải job bị
 * xóa khỏi Redis. Do vậy phải chứng minh lỗi transporter được propagate nguyên vẹn.
 */
describe('MailProcessor — T030.9', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('SMTP chưa cấu hình (SMTP_HOST rỗng) — log OTP thay vì gửi thật, KHÔNG throw (hành vi hiện có, không đổi)', async () => {
    const processor = new MailProcessor(makeConfig({ 'mail.from': 'a@b.com' }));
    await expect(
      processor.process(
        makeJob({
          to: 'user@example.com',
          otp: '123456',
          purpose: 'PASSWORD_RESET',
        }),
      ),
    ).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('SMTP đã cấu hình — gọi transporter.sendMail() với đúng to/subject/text chứa OTP', async () => {
    sendMailMock.mockResolvedValue(undefined);
    const processor = new MailProcessor(
      makeConfig({
        'mail.host': 'smtp.example.com',
        'mail.port': 587,
        'mail.from': 'noreply@pos-erp.local',
      }),
    );
    await processor.process(
      makeJob({
        to: 'user@example.com',
        otp: '654321',
        purpose: 'PASSWORD_RESET',
      }),
    );
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: 'noreply@pos-erp.local',
        text: expect.stringContaining('654321'),
      }),
    );
  });

  it('[T030.9] transporter.sendMail() reject → process() PROPAGATE lỗi nguyên vẹn (không nuốt) để BullMQ tự retry theo defaultJobOptions, KHÔNG bị coi là completed giả', async () => {
    const smtpError = new Error('SMTP connection refused');
    sendMailMock.mockRejectedValue(smtpError);
    const processor = new MailProcessor(
      makeConfig({
        'mail.host': 'smtp.example.com',
        'mail.port': 587,
        'mail.from': 'noreply@pos-erp.local',
      }),
    );
    await expect(
      processor.process(
        makeJob({
          to: 'user@example.com',
          otp: '111111',
          purpose: 'PASSWORD_RESET',
        }),
      ),
    ).rejects.toBe(smtpError);
  });
});

/**
 * T030.11 (DISCOVERY-T030 F17) — trước đây `logger.warn(...)` in NGUYÊN giá trị OTP thật vào log,
 * ghi tới winston's `DailyRotateFile` (giữ 14 ngày) — secret sống trên đĩa. Từ T030.11, giá trị bị
 * che ở production, GIỮ NGUYÊN hành vi cũ (đọc OTP qua log) ở mọi môi trường khác — đây là cách
 * duy nhất đọc OTP khi chưa cấu hình SMTP thật cho local dev (đã tài liệu hóa).
 */
describe('MailProcessor — T030.11 (OTP logging redaction)', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    warnSpy.mockRestore();
  });

  it('env=production + SMTP chưa cấu hình → log KHÔNG chứa giá trị OTP thật, chỉ "[REDACTED]"', async () => {
    const processor = new MailProcessor(
      makeConfig({ env: 'production', 'mail.from': 'a@b.com' }),
    );
    await processor.process(
      makeJob({
        to: 'user@example.com',
        otp: '999999',
        purpose: 'PASSWORD_RESET',
      }),
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = warnSpy.mock.calls[0][0] as string;
    expect(logged).not.toContain('999999');
    expect(logged).toContain('[REDACTED]');
    // Vẫn giữ đủ ngữ cảnh vận hành để chẩn đoán — email người nhận không bị che.
    expect(logged).toContain('user@example.com');
  });

  it('env=development + SMTP chưa cấu hình → log VẪN chứa OTP thật (hành vi dev-convenience hiện có, không đổi)', async () => {
    const processor = new MailProcessor(
      makeConfig({ env: 'development', 'mail.from': 'a@b.com' }),
    );
    await processor.process(
      makeJob({
        to: 'user@example.com',
        otp: '888888',
        purpose: 'PASSWORD_RESET',
      }),
    );

    const logged = warnSpy.mock.calls[0][0] as string;
    expect(logged).toContain('888888');
  });

  it('env không set (mặc định coi như không phải production) → log VẪN chứa OTP thật', async () => {
    const processor = new MailProcessor(makeConfig({ 'mail.from': 'a@b.com' }));
    await processor.process(
      makeJob({
        to: 'user@example.com',
        otp: '777777',
        purpose: 'PASSWORD_RESET',
      }),
    );

    const logged = warnSpy.mock.calls[0][0] as string;
    expect(logged).toContain('777777');
  });

  it('env=production + SMTP ĐÃ cấu hình (gửi thật, không rơi vào nhánh fallback) → không log gì liên quan OTP', async () => {
    sendMailMock.mockResolvedValue(undefined);
    const processor = new MailProcessor(
      makeConfig({
        env: 'production',
        'mail.host': 'smtp.example.com',
        'mail.port': 587,
        'mail.from': 'noreply@pos-erp.local',
      }),
    );
    await processor.process(
      makeJob({
        to: 'user@example.com',
        otp: '555555',
        purpose: 'PASSWORD_RESET',
      }),
    );

    expect(warnSpy).not.toHaveBeenCalled();
    expect(sendMailMock).toHaveBeenCalled();
  });
});
