import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import type Redis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './helpers/create-e2e-app';
import { AppModule } from '../src/app.module';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Integration Test — T053.06B-1 (Forgot-Password OTP atomicity + throttling hardening). Bao phủ
 * §10 (real-Redis concurrency proof A-D) và §11 (full HTTP flow) của Architect Authorization.
 * Cùng giới hạn với các *.e2e-spec.ts khác: KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- forgot-password.e2e-spec.ts
 *
 * Trước T053.06B-1, module này KHÔNG có e2e-spec riêng nào (xác nhận qua Mandatory Source
 * Verification trước khi viết file này) — chỉ có forgot-password.service.spec.ts (unit, mock
 * repository). File này là bằng chứng tích hợp THẬT đầu tiên (Postgres + Redis thật) cho toàn bộ
 * luồng request-otp → verify-otp → reset-password.
 */
// Cùng lý do với trial-signup.e2e-spec.ts: forgot-password/verify-otp/reset-password đều có
// @Throttle(10/60s) riêng theo route (ThrottlerGuard mặc định key theo class+handler+ip — xác nhận
// qua node_modules/@nestjs/throttler/dist/throttler.guard.js), login có @Throttle(5/60s). Dùng
// retry-với-backoff CHUNG cho MỌI route trong file này thay vì chỉ 2 route như trial-signup, vì file
// này còn gọi cả login nhiều lần (CASE 1).
jest.setTimeout(240_000);

describe('Forgot Password OTP (e2e, integration) — T053.06B-1', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let redis: Redis;
  let organizationId: string;
  const organizationSlug = 'forgot-password-e2e';
  const server = () => app.getHttpServer();

  function uniqueEmail(label: string): string {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@forgot-e2e.local`;
  }

  function otpKey(email: string): string {
    return `auth:otp:${organizationSlug}:${email}`;
  }
  function verifyWindowKey(email: string): string {
    return `auth:otp:verifywindow:${organizationSlug}:${email}`;
  }

  async function createUser(email: string, password: string): Promise<string> {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    const user = await prisma.user.create({
      data: {
        organizationId,
        username: email.split('@')[0],
        email,
        passwordHash,
      },
    });
    return user.id;
  }

  const THROTTLE_MAX_ATTEMPTS = 8;
  const THROTTLE_BACKOFF_MS = 15_000;

  /** Retry-với-backoff CHỈ cho 429 đến từ ThrottlerGuard theo IP (mã lỗi chung `HTTP_429`, xem
   * `STATUS_FALLBACK_CODE` trong `http-exception.filter.ts` — ThrottlerException KHÔNG đi qua
   * `withCode()` nên KHÔNG có errorCode nghiệp vụ cụ thể) — KHÔNG né tránh/vô hiệu hóa throttle
   * thật, chỉ xử lý như 1 client thật cần tôn trọng rate-limit. Đúng pattern đã dùng ở
   * trial-signup.e2e-spec.ts, mở rộng cho MỌI route trong file này.
   *
   * QUAN TRỌNG — 429 mang errorCode nghiệp vụ cụ thể (vd `OTP_008` từ throttle account-scoped §6)
   * là KẾT QUẢ THẬT cần trả về NGAY, KHÔNG phải va chạm hạ tầng cần thử lại: nếu retry vào đó,
   * mỗi lần gọi lại tự làm counter account-scoped tăng thêm (incrementVerifyAttemptWindowCount
   * chạy TRƯỚC bất kỳ throttle-guard nào khác), nên sẽ ngày càng bị 429 chắc chắn hơn, không bao
   * giờ "thử lại thành công" — khác hẳn 429 do IP throttle tạm thời rồi tự hết hạn.
   */
  async function postWithThrottleRetry(
    path: string,
    body: Record<string, string>,
  ): Promise<{ status: number; body: { code?: string; data?: unknown } }> {
    for (let attempt = 1; attempt <= THROTTLE_MAX_ATTEMPTS; attempt += 1) {
      const res = await request(server()).post(path).send(body);
      const isGenericIpThrottle =
        res.status === 429 && res.body?.code === 'HTTP_429';
      if (isGenericIpThrottle) {
        if (attempt === THROTTLE_MAX_ATTEMPTS) {
          throw new Error(
            `[postWithThrottleRetry] ${path} vẫn bị throttle IP (429/HTTP_429) sau ${THROTTLE_MAX_ATTEMPTS} lần retry`,
          );
        }
        await new Promise((resolve) =>
          setTimeout(resolve, THROTTLE_BACKOFF_MS),
        );
        continue;
      }
      return { status: res.status, body: res.body };
    }
    throw new Error('[postWithThrottleRetry] unreachable');
  }

  async function callForgotPassword(
    email: string,
  ): Promise<{ status: number; body: { code?: string } }> {
    return postWithThrottleRetry('/api/v1/auth/forgot-password', {
      organizationSlug,
      email,
    });
  }

  async function callVerifyOtp(
    email: string,
    otp: string,
  ): Promise<{ status: number; body: { code?: string } }> {
    return postWithThrottleRetry('/api/v1/auth/verify-otp', {
      organizationSlug,
      email,
      otp,
    });
  }

  async function callResetPassword(
    email: string,
    newPassword: string,
  ): Promise<{ status: number; body: { code?: string } }> {
    return postWithThrottleRetry('/api/v1/auth/reset-password', {
      organizationSlug,
      email,
      newPassword,
    });
  }

  async function callLogin(
    email: string,
    password: string,
  ): Promise<{ status: number; body: { code?: string } }> {
    return postWithThrottleRetry('/api/v1/auth/login', {
      organizationSlug,
      email,
      password,
    });
  }

  /** Chặn Logger.warn() (MailProcessor log OTP khi SMTP_HOST rỗng ở test env) — ĐÚNG pattern đã
   * xác nhận hoạt động ở trial-signup.e2e-spec.ts/mail.processor.spec.ts. */
  async function captureOtpFromConsole(
    action: () => Promise<void>,
  ): Promise<string> {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    try {
      await action();
      let otpLog: string | undefined;
      for (let attempt = 0; attempt < 30 && !otpLog; attempt += 1) {
        otpLog = warnSpy.mock.calls
          .map((args) => String(args[0]))
          .find((message) => message.includes('otp='));
        if (!otpLog) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      if (!otpLog) {
        throw new Error(
          `Không tìm thấy OTP trong Logger.warn() sau khi chờ ~6s — các lời gọi: ${JSON.stringify(
            warnSpy.mock.calls.map((args) => String(args[0])),
          )}`,
        );
      }
      const match = otpLog.match(/otp=(\d{6})/);
      if (!match) {
        throw new Error(
          `Logger.warn() có OTP nhưng không khớp định dạng 6 chữ số: ${otpLog}`,
        );
      }
      return match[1];
    } finally {
      warnSpy.mockRestore();
    }
  }

  async function requestAndCaptureOtp(email: string): Promise<string> {
    return captureOtpFromConsole(async () => {
      const res = await callForgotPassword(email);
      expect(res.status).toBe(204);
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: organizationSlug },
      create: {
        code: 'ORG-FORGOT-PW-E2E',
        displayName: 'Forgot Password E2E Org',
        slug: organizationSlug,
      },
      update: {},
    });
    organizationId = organization.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // =========================================================================
  // SECTION A — full HTTP flow (Architect Authorization T053.06B-1 §11)
  // =========================================================================

  it('CASE 1: request → verify → reset → mật khẩu cũ bị từ chối, mật khẩu mới đăng nhập được, MỌI session cũ bị thu hồi', async () => {
    const email = uniqueEmail('case1');
    const oldPassword = 'OldPass@123';
    const newPassword = 'NewPass@456';
    const userId = await createUser(email, oldPassword);

    const login1 = await callLogin(email, oldPassword);
    expect(login1.status).toBe(200);
    const login2 = await callLogin(email, oldPassword);
    expect(login2.status).toBe(200);

    const otp = await requestAndCaptureOtp(email);
    const verifyRes = await callVerifyOtp(email, otp);
    expect(verifyRes.status).toBe(204);

    const resetRes = await callResetPassword(email, newPassword);
    expect(resetRes.status).toBe(204);

    const loginOld = await callLogin(email, oldPassword);
    expect(loginOld.status).toBe(401);
    expect(loginOld.body.code).toBe('AUTH_001');

    const loginNew = await callLogin(email, newPassword);
    expect(loginNew.status).toBe(200);

    const revokedCount = await prisma.session.count({
      where: { userId, revokedAt: { not: null } },
    });
    expect(revokedCount).toBeGreaterThanOrEqual(2);
  });

  it('CASE 2: request-otp KHÔNG tiết lộ email có tồn tại hay không — response 204 GIỐNG HỆT cho email không tồn tại', async () => {
    const emailReal = uniqueEmail('case2-real');
    await createUser(emailReal, 'SomePass@123');
    const emailFake = uniqueEmail('case2-fake');

    const resReal = await callForgotPassword(emailReal);
    const resFake = await callForgotPassword(emailFake);

    expect(resReal.status).toBe(204);
    expect(resFake.status).toBe(204);
    expect(resReal.body).toEqual(resFake.body);
  });

  it('CASE 3: OTP sai → 400 OTP_003 (OTP_INCORRECT)', async () => {
    const email = uniqueEmail('case3');
    await createUser(email, 'SomePass@123');
    await requestAndCaptureOtp(email);

    const res = await callVerifyOtp(email, '000000');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_003');
  });

  it('CASE 4: vượt quá 5 lần thử → OTP_004, sau đó OTP ĐÚNG cũng không còn dùng được (§10.C — exhausted OTP không thể hồi sinh)', async () => {
    const email = uniqueEmail('case4');
    await createUser(email, 'SomePass@123');
    const otp = await requestAndCaptureOtp(email);

    let lastStatus = 0;
    let lastCode = '';
    for (let i = 0; i < 6; i += 1) {
      const res = await callVerifyOtp(email, '000000');
      lastStatus = res.status;
      lastCode = res.body.code ?? '';
    }
    expect(lastStatus).toBe(400);
    expect(lastCode).toBe('OTP_004');

    const afterExhaustion = await callVerifyOtp(email, otp);
    expect(afterExhaustion.status).toBe(400);
    expect(afterExhaustion.body.code).toBe('OTP_002');
  });

  it('CASE 5: OTP hết hạn (TTL 5 phút, mô phỏng bằng xoá thẳng key Redis) → 400 OTP_002', async () => {
    const email = uniqueEmail('case5');
    await createUser(email, 'SomePass@123');
    await requestAndCaptureOtp(email);
    await redis.del(otpKey(email));

    const res = await callVerifyOtp(email, '123456');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_002');
  });

  it('CASE 6: reset-password khi CHƯA xác thực OTP → 400 OTP_005 (OTP_NOT_VERIFIED)', async () => {
    const email = uniqueEmail('case6');
    await createUser(email, 'SomePass@123');
    await requestAndCaptureOtp(email);
    // Chưa gọi verify-otp.

    const res = await callResetPassword(email, 'NewPass@456');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_005');
  });

  it('CASE 7: replay — sau khi reset thành công, verify lại OTP đã tiêu thụ → OTP_002; reset lại (không re-verify) → OTP_005', async () => {
    const email = uniqueEmail('case7');
    await createUser(email, 'OldPass@123');
    const otp = await requestAndCaptureOtp(email);
    await callVerifyOtp(email, otp);
    await callResetPassword(email, 'NewPass@456');

    // otpRepository.delete() trong resetPassword() xoá CẢ 2 key (otp + verified) — verify lại
    // KHÔNG còn record nào để so khớp.
    const replayVerify = await callVerifyOtp(email, otp);
    expect(replayVerify.status).toBe(400);
    expect(replayVerify.body.code).toBe('OTP_002');

    // reset lại mà không re-verify → cờ verified đã bị xoá → OTP_NOT_VERIFIED, KHÔNG cho phép reset lần 2.
    const replayReset = await callResetPassword(email, 'AnotherPass@789');
    expect(replayReset.status).toBe(400);
    expect(replayReset.body.code).toBe('OTP_005');
  });

  it('CASE 8: throttle account-scoped (§6) — 25 lần thử/giờ được phép, lần thứ 26 bị chặn 429 OTP_008, tính cả với identifier CHƯA từng yêu cầu OTP nào (không tạo oracle)', async () => {
    const email = uniqueEmail('case8');
    // Seed trực tiếp ngưỡng còn 1 lần trước khi chạm 25 — tương đương 24 lần gọi thật trước đó,
    // tránh tốn ~24 lượt HTTP thật/ngân sách IP throttle chỉ để dựng trạng thái xác định (đúng kỹ
    // thuật đã dùng ở CASE 4/CASE 6 của trial-signup.e2e-spec.ts để mô phỏng TTL hết hạn).
    await redis.set(verifyWindowKey(email), '24', 'EX', 3600);

    const at25 = await callVerifyOtp(email, '000000');
    expect(at25.status).toBe(400);
    expect(at25.body.code).toBe('OTP_002'); // NOT_FOUND thật — chưa từng request OTP, không phải throttle.

    const at26 = await callVerifyOtp(email, '000000');
    expect(at26.status).toBe(429);
    expect(at26.body.code).toBe('OTP_008');
  });

  // =========================================================================
  // SECTION B — real-Redis concurrency proof (Architect Authorization T053.06B-1 §10 A-D)
  // =========================================================================

  it('§10.A: 5 lần verify SAI OTP đồng thời → KHÔNG mất lượt đếm (lần thứ 6 tuần tự phải là MAX_ATTEMPTS, không phải INCORRECT) — chứng minh Lua EVAL atomic, không còn race GET→SET', async () => {
    const email = uniqueEmail('concurrent-wrong');
    await createUser(email, 'SomePass@123');
    await requestAndCaptureOtp(email);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => callVerifyOtp(email, '000000')),
    );
    // Nếu có lượt đếm bị mất do race, sẽ có ít hơn 5 lỗi INCORRECT thật (một vài request có thể vô
    // tình thấy MAX_ATTEMPTS sớm hoặc NOT_FOUND — nhưng với đúng 5 lần và ngưỡng 5, tất cả PHẢI là
    // INCORRECT, KHÔNG có bất kỳ MAX_ATTEMPTS/NOT_FOUND nào lọt vào giữa).
    expect(
      results.every((r) => r.status === 400 && r.body.code === 'OTP_003'),
    ).toBe(true);

    // Lần thứ 6 (tuần tự, SAU khi 5 lần đồng thời đã hoàn tất) — nếu 5 lần trên bị mất lượt đếm
    // (vd chỉ đếm được 3/5), lần này vẫn sẽ là INCORRECT thay vì MAX_ATTEMPTS.
    const sixth = await callVerifyOtp(email, '000000');
    expect(sixth.status).toBe(400);
    expect(sixth.body.code).toBe('OTP_004');
  });

  it('§10.B: 2 lần verify ĐÚNG OTP đồng thời → CHỈ 1 request thắng (204), request còn lại NOT_FOUND (record đã bị Lua script tiêu thụ atomic) — không double-consume', async () => {
    const email = uniqueEmail('concurrent-correct');
    await createUser(email, 'SomePass@123');
    const otp = await requestAndCaptureOtp(email);

    const [resA, resB] = await Promise.all([
      callVerifyOtp(email, otp),
      callVerifyOtp(email, otp),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([204, 400]);
    const loser = resA.status === 400 ? resA : resB;
    expect(loser.body.code).toBe('OTP_002');
  });

  it('§10.D: TTL của OTP KHÔNG bị reset về 300s khi có 1 lần thử SAI — Lua script giữ nguyên TTL còn lại, chỉ tăng attempts', async () => {
    const email = uniqueEmail('ttl-preserved');
    await createUser(email, 'SomePass@123');
    await requestAndCaptureOtp(email);

    // Rút ngắn TTL thật (mô phỏng đã gần hết hạn) — vẫn đúng cơ chế TTL thật của Redis, chỉ đẩy
    // nhanh thời gian chờ trong test thay vì chờ ~5 phút thật.
    await redis.expire(otpKey(email), 5);
    const ttlBefore = await redis.ttl(otpKey(email));
    expect(ttlBefore).toBeGreaterThan(0);
    expect(ttlBefore).toBeLessThanOrEqual(5);

    const wrongAttempt = await callVerifyOtp(email, '000000');
    expect(wrongAttempt.status).toBe(400);
    expect(wrongAttempt.body.code).toBe('OTP_003');

    const ttlAfter = await redis.ttl(otpKey(email));
    // Nếu bị reset về hạn đầy đủ (300s), ttlAfter sẽ >> 5. Chứng minh KHÔNG bị reset.
    expect(ttlAfter).toBeGreaterThan(0);
    expect(ttlAfter).toBeLessThanOrEqual(5);
  });
});
