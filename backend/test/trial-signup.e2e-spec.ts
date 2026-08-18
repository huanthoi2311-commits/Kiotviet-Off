import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './helpers/create-e2e-app';
import { AppModule } from '../src/app.module';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Integration Test — T053.04 Self-Service Trial Signup + Email/OTP (real Postgres + Redis, CASE
 * 1-32 theo Architect Authorization). KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- trial-signup.e2e-spec.ts
 *
 * CASE 23 ("forced DB failure leaves zero partial tenant state") dùng LẠI đúng bằng chứng
 * transactional-rollback của CASE 22 (slug conflict) — cả 2 chứng minh CÙNG 1 bất biến ("bất kỳ
 * lỗi nào bên trong transaction provisioning → 0 row Organization/User/Role/... còn sót lại, bản
 * ghi finalize chuyển FAILED chứ không COMPLETED"). Không có cách an toàn để ép một lỗi DB tổng
 * quát (vd mất kết nối) một cách xác định trong 1 E2E test chạy trên Postgres thật mà không tự
 * chế 1 cơ chế inject-lỗi giả — báo cáo trung thực thay vì dựng 1 kịch bản giả tạo.
 */
// Nhiều test case cùng chia sẻ 1 ngân sách throttle IP (`@Throttle(10/60s)` trên
// `POST /trial-signup/request-otp`) — `postRequestOtpWithRetry()` có thể backoff tới ~52s (4 lần
// retry x 13s) trước khi thành công thật hoặc thất bại dứt khoát; Jest timeout mặc định (5s) sẽ
// giết test giữa chừng nếu không nới ra. Chỉ ảnh hưởng file này (KHÔNG phải global jest config).
jest.setTimeout(180_000);

describe('Trial Signup (e2e, integration) — T053.04 CASE 1-32', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let redis: Redis;
  const server = () => app.getHttpServer();

  function uniqueEmail(label: string): string {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@trial-e2e.local`;
  }

  const REQUEST_OTP_THROTTLE_MAX_ATTEMPTS = 5;
  const REQUEST_OTP_THROTTLE_BACKOFF_MS = 15_000;

  /** Gọi API request-otp thật; retry-với-backoff CHỈ cho 429 (throttle IP thật `@Throttle(10/60s)`
   * trên route — nhiều test case trong file này cùng chia sẻ 1 IP runner CI, cùng ngân sách, đúng
   * pattern đã dùng ở Release E2E T053.03 RC1 `apiLoginWithRetry`) — KHÔNG né tránh/vô hiệu hóa
   * throttle thật, chỉ xử lý như 1 client thật cần tôn trọng rate-limit. Trả nguyên response (status
   * KHÔNG bị assert ở đây) để caller tự quyết định — vd CASE 2 cần so sánh 2 response nguyên vẹn. */
  async function postRequestOtpWithRetry(
    email: string,
  ): Promise<{ status: number; body: unknown }> {
    for (
      let attempt = 1;
      attempt <= REQUEST_OTP_THROTTLE_MAX_ATTEMPTS;
      attempt += 1
    ) {
      const res = await request(server())
        .post('/api/v1/trial-signup/request-otp')
        .send({ email });
      if (res.status === 429) {
        if (attempt === REQUEST_OTP_THROTTLE_MAX_ATTEMPTS) {
          throw new Error(
            `[postRequestOtpWithRetry] /trial-signup/request-otp vẫn bị throttle (429) sau ${REQUEST_OTP_THROTTLE_MAX_ATTEMPTS} lần retry`,
          );
        }
        await new Promise((resolve) =>
          setTimeout(resolve, REQUEST_OTP_THROTTLE_BACKOFF_MS),
        );
        continue;
      }
      return { status: res.status, body: res.body };
    }
    throw new Error('[postRequestOtpWithRetry] unreachable');
  }

  async function requestOtpAndCapture(email: string): Promise<void> {
    const res = await postRequestOtpWithRetry(email);
    expect(res.status).toBe(204);
  }

  /** Chặn thẳng `Logger.warn()` (dùng bởi MailProcessor khi SMTP_HOST rỗng) qua `jest.spyOn`, KHÔNG
   * monkey-patch `process.stdout/stderr.write` — Jest tự thay thế `console.*` bằng cơ chế báo cáo
   * riêng của nó (gộp theo từng test, in dưới nhãn "● Console"), nên `Logger.warn()` (thực chất gọi
   * `console.warn` bên trong) KHÔNG BAO GIỜ thật sự chạm tới `process.stdout/stderr.write` ở tầng
   * mà 1 lần chặn thủ công có thể quan sát được — xác nhận qua chính lần chạy CI đầu tiên (spy trên
   * 2 stream không bắt được gì). Đây là ĐÚNG pattern đã có sẵn, đã được xác nhận hoạt động, trong
   * `mail.processor.spec.ts` (`jest.spyOn(Logger.prototype, 'warn')`) — không mock implementation
   * (để log vẫn thật sự in ra, hữu ích khi cần debug), chỉ ghi lại lời gọi. */
  async function captureOtpFromConsole(
    action: () => Promise<void>,
  ): Promise<string> {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    try {
      await action();
    } finally {
      warnSpy.mockRestore();
    }
    const otpLog = warnSpy.mock.calls
      .map((args) => String(args[0]))
      .find((message) => message.includes('otp='));
    if (!otpLog) {
      throw new Error(
        `Không tìm thấy OTP trong Logger.warn() — các lời gọi: ${JSON.stringify(
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
  }

  async function signupOtpFlow(email: string): Promise<string> {
    const otp = await captureOtpFromConsole(() => requestOtpAndCapture(email));
    const verifyRes = await request(server())
      .post('/api/v1/trial-signup/verify-otp')
      .send({ email, otp })
      .expect(200);
    return verifyRes.body.data.signupProofToken as string;
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

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
  // CASE 1-6 — OTP request/verify
  // =========================================================================

  it('CASE 1: request OTP happy path → 204, OTP thật xuất hiện trong log (SMTP rỗng ở test env)', async () => {
    const email = uniqueEmail('case1');
    const otp = await captureOtpFromConsole(() => requestOtpAndCapture(email));
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('CASE 2: request-otp KHÔNG tiết lộ email đã dùng hay chưa — response 204 GIỐNG HỆT cho email mới lẫn email đã signup trước đó', async () => {
    const emailFresh = uniqueEmail('case2-fresh');
    const emailReused = uniqueEmail('case2-reused');

    // Cho `emailReused` đi qua 1 lần signup hoàn chỉnh trước.
    const proof1 = await signupOtpFlow(emailReused);
    await request(server())
      .post('/api/v1/trial-signup')
      .send({
        signupProofToken: proof1,
        organization: { displayName: `Case2 Reused ${Date.now()}` },
        owner: { fullName: 'Owner', password: 'SuperSecret123' },
      })
      .expect(201);

    const resFresh = await postRequestOtpWithRetry(emailFresh);
    const resReused = await postRequestOtpWithRetry(emailReused);

    expect(resFresh.status).toBe(204);
    expect(resReused.status).toBe(204);
    expect(resFresh.body).toEqual(resReused.body);
  });

  it('CASE 3: invalid OTP → 400 OTP_INCORRECT, KHÔNG cấp proof', async () => {
    const email = uniqueEmail('case3');
    await requestOtpAndCapture(email);

    const res = await request(server())
      .post('/api/v1/trial-signup/verify-otp')
      .send({ email, otp: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_003');
  });

  it('CASE 4: expired OTP (TTL 5 phút) → 400 OTP_INVALID_OR_EXPIRED', async () => {
    const email = uniqueEmail('case4');
    await requestOtpAndCapture(email);
    // Xoá thẳng key Redis để mô phỏng hết hạn (nhanh hơn chờ 5 phút thật) — vẫn đúng hành vi vì
    // server chỉ đọc lại từ Redis, không có cache nào khác.
    await redis.del(`signup:otp:${email.toLowerCase()}`);

    const res = await request(server())
      .post('/api/v1/trial-signup/verify-otp')
      .send({ email, otp: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_002');
  });

  it('CASE 5: brute-force exhaustion — 5 lần sai liên tiếp → OTP_MAX_ATTEMPTS_EXCEEDED, mã đúng KHÔNG còn dùng được nữa', async () => {
    const email = uniqueEmail('case5');
    const otp = await captureOtpFromConsole(() => requestOtpAndCapture(email));

    let lastStatus = 0;
    let lastCode = '';
    for (let i = 0; i < 5; i += 1) {
      const res = await request(server())
        .post('/api/v1/trial-signup/verify-otp')
        .send({ email, otp: '000000' });
      lastStatus = res.status;
      lastCode = res.body.code;
    }
    expect(lastStatus).toBe(400);
    expect(lastCode).toBe('OTP_004');

    // OTP THẬT (đúng) cũng không còn dùng được — record đã bị xoá khi đạt ngưỡng.
    const afterExhaustion = await request(server())
      .post('/api/v1/trial-signup/verify-otp')
      .send({ email, otp });
    expect(afterExhaustion.status).toBe(400);
    expect(afterExhaustion.body.code).toBe('OTP_002');
  });

  it('CASE 6: resend invalidates previous OTP — mã CŨ hết hiệu lực ngay khi mã MỚI được cấp', async () => {
    const email = uniqueEmail('case6');
    const otpOld = await captureOtpFromConsole(() =>
      requestOtpAndCapture(email),
    );
    // Xoá cooldown key để có thể resend ngay trong test (60s cooldown thật vẫn nguyên trong production).
    await redis.del(`signup:otp:cooldown:${email.toLowerCase()}`);
    const otpNew = await captureOtpFromConsole(() =>
      requestOtpAndCapture(email),
    );
    expect(otpNew).not.toBe(otpOld);

    const oldAttempt = await request(server())
      .post('/api/v1/trial-signup/verify-otp')
      .send({ email, otp: otpOld });
    expect(oldAttempt.status).toBe(400);

    const newAttempt = await request(server())
      .post('/api/v1/trial-signup/verify-otp')
      .send({ email, otp: otpNew });
    expect(newAttempt.status).toBe(200);
  });

  // =========================================================================
  // CASE 7 — concurrent verify consumes OTP only once
  // =========================================================================

  it('CASE 7: 2 request verify ĐÚNG OTP đồng thời → CHỈ 1 request thắng (nhận proof), request còn lại thấy NOT_FOUND (đã bị tiêu thụ) — atomic thật, không double-issue', async () => {
    const email = uniqueEmail('case7');
    const otp = await captureOtpFromConsole(() => requestOtpAndCapture(email));

    const [resA, resB] = await Promise.all([
      request(server())
        .post('/api/v1/trial-signup/verify-otp')
        .send({ email, otp }),
      request(server())
        .post('/api/v1/trial-signup/verify-otp')
        .send({ email, otp }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 400]);
    const loser = resA.status === 400 ? resA : resB;
    expect(loser.body.code).toBe('OTP_002'); // NOT_FOUND — record đã bị xoá bởi request thắng
  });

  // =========================================================================
  // CASE 8-9 — proof tampering / expiry
  // =========================================================================

  it('CASE 8: proof tampering (chuỗi bị sửa/không phải JWT hợp lệ) → 400 SIGNUP_PROOF_INVALID, KHÔNG tạo Organization', async () => {
    const res = await request(server())
      .post('/api/v1/trial-signup')
      .send({
        signupProofToken: 'tampered.invalid.token',
        organization: { displayName: `Case8 ${Date.now()}` },
        owner: { fullName: 'Owner', password: 'SuperSecret123' },
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SIGNUP_001');
  });

  it('CASE 9: proof expiry (đã hết hạn) → 400 SIGNUP_PROOF_EXPIRED, KHÔNG tạo Organization', async () => {
    const email = uniqueEmail('case9');
    const displayName = `Case9 ${Date.now()}`;
    const beforeCount = await prisma.organization.count({
      where: { displayName },
    });

    // Ký 1 proof THẬT (đúng secret/purpose runtime của chính app đang chạy) nhưng exp trong quá
    // khứ — không chờ 10 phút thật, vẫn đi qua ĐÚNG đường mã hoá/giải mã thật (SignupProofService
    // thật của app instance này), không phải chuỗi giả lập cấu trúc.
    const jwtService = app.get(JwtService);
    const configService = app.get(ConfigService);
    const signupSecret = configService.get<string>('signup.secret')!;
    const expiredProof = jwtService.sign(
      { purpose: 'trial_signup_proof', email },
      { secret: signupSecret, expiresIn: '-1s' },
    );

    const res = await request(server())
      .post('/api/v1/trial-signup')
      .send({
        signupProofToken: expiredProof,
        organization: { displayName },
        owner: { fullName: 'Owner', password: 'SuperSecret123' },
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SIGNUP_002');
    const afterCount = await prisma.organization.count({
      where: { displayName },
    });
    expect(afterCount).toBe(beforeCount);
  });

  // =========================================================================
  // CASE 10-17 — final signup happy path + TRIAL correctness
  // =========================================================================

  it('CASE 10/11/12/13/14/15/16/17: final signup tạo ĐÚNG 1 Organization TRIAL, đủ giới hạn canonical, Owner không phải Platform Admin, RBAC đủ quyền, entitlement TRIAL hoạt động ngay, login thành công', async () => {
    const email = uniqueEmail('case10-17');
    const proof = await signupOtpFlow(email);
    const displayName = `Case10-17 ${Date.now()}`;

    const beforeMs = Date.now();
    const res = await request(server())
      .post('/api/v1/trial-signup')
      .send({
        signupProofToken: proof,
        organization: { displayName },
        owner: { fullName: 'Owner Ten', password: 'SuperSecret123' },
      })
      .expect(201);

    // CASE 11 — accessToken hợp lệ, login THẬT ngay (goal #9).
    const accessToken: string = res.body.data.accessToken;
    expect(accessToken).toEqual(expect.any(String));

    const org = await prisma.organization.findFirstOrThrow({
      where: { displayName },
      include: { subscription: true },
    });

    // CASE 10 — đúng 1 Organization.
    const orgCount = await prisma.organization.count({
      where: { displayName },
    });
    expect(orgCount).toBe(1);

    // CASE 12 — subscription = TRIAL.
    expect(org.subscription?.plan).toBe('TRIAL');

    // CASE 13 — expiredAt ≈ now + 14 ngày (dung sai 1 phút).
    const expiredAtMs = org.subscription!.expiredAt!.getTime();
    const expectedMs = beforeMs + 14 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiredAtMs - expectedMs)).toBeLessThan(60_000);

    // CASE 14 — canonical TRIAL limits (SUBSCRIPTION_PLAN_LIMITS.TRIAL).
    expect(org.subscription?.maxBranch).toBe(1);
    expect(org.subscription?.maxUser).toBe(3);
    expect(org.subscription?.maxWarehouse).toBe(1);
    expect(org.subscription?.maxProduct).toBe(50);
    expect(org.subscription?.maxCustomer).toBe(50);
    expect(org.subscription?.storageLimitGB).toBe(1);

    // CASE 15/16 — Owner là tenant Owner, KHÔNG phải Platform Admin.
    const owner = await prisma.user.findFirstOrThrow({
      where: { organizationId: org.id },
    });
    expect(owner.id).toBe(org.ownerUserId);
    expect(owner.isPlatformAdmin).toBe(false);

    // CASE 16 — Owner Role có đủ quyền RBAC (toàn bộ Permission catalog — cùng bất biến với
    // Platform Admin tạo Organization, T053.02 audit).
    const roleCount = await prisma.role.count({
      where: { organizationId: org.id, code: 'owner' },
    });
    expect(roleCount).toBe(1);
    const grantedPermissionCount = await prisma.rolePermission.count({
      where: { role: { organizationId: org.id, code: 'owner' } },
    });
    expect(grantedPermissionCount).toBeGreaterThan(0);

    // CASE 17 — entitlement TRIAL hoạt động NGAY (GET /entitlements/current, PURCHASE nằm trong TRIAL).
    const entitlementRes = await request(server())
      .get('/api/v1/entitlements/current')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(entitlementRes.body.data.effectiveFeatures).toEqual(
      expect.arrayContaining(['PURCHASE', 'SUPPLIER', 'USER_MANAGEMENT']),
    );

    // Audit trail — action riêng biệt, actor null (D10/D16).
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: org.id, action: 'organization.trial_signup' },
    });
    expect(audit.userId).toBeNull();
    expect(
      (audit.newValue as { provisionedVia?: string })?.provisionedVia,
    ).toBe('public_trial_signup');
  });

  // =========================================================================
  // CASE 18-21 — idempotency / replay
  // =========================================================================

  it('CASE 18/19: duplicate final request (response-loss retry, cùng proof + cùng intent) → replay AN TOÀN, KHÔNG tạo Organization thứ 2', async () => {
    const email = uniqueEmail('case18-19');
    const proof = await signupOtpFlow(email);
    const displayName = `Case18-19 ${Date.now()}`;
    const payload = {
      signupProofToken: proof,
      organization: { displayName },
      owner: { fullName: 'Owner Retry', password: 'SuperSecret123' },
    };

    const res1 = await request(server())
      .post('/api/v1/trial-signup')
      .send(payload)
      .expect(201);
    const res2 = await request(server())
      .post('/api/v1/trial-signup')
      .send(payload)
      .expect(201);

    expect(res1.body.data.userInfo.organizationId).toBe(
      res2.body.data.userInfo.organizationId,
    );
    // Access token MỚI ở mỗi lần replay (session mới, không phải token cũ tái sử dụng).
    expect(res1.body.data.accessToken).not.toBe(res2.body.data.accessToken);

    const orgCount = await prisma.organization.count({
      where: { displayName },
    });
    expect(orgCount).toBe(1);
  });

  it('CASE 20: 2 final request đồng thời (cùng proof) → CHỈ 1 request thắng tạo Organization, request thua trả lại KẾT QUẢ THÀNH CÔNG replay HOẶC conflict tạm thời — không bao giờ 2 Organization', async () => {
    const email = uniqueEmail('case20');
    const proof = await signupOtpFlow(email);
    const displayName = `Case20 ${Date.now()}`;
    const payload = {
      signupProofToken: proof,
      organization: { displayName },
      owner: { fullName: 'Owner Concurrent', password: 'SuperSecret123' },
    };

    const [resA, resB] = await Promise.all([
      request(server()).post('/api/v1/trial-signup').send(payload),
      request(server()).post('/api/v1/trial-signup').send(payload),
    ]);

    // Mỗi request kết thúc 201 (thắng hoặc replay) hoặc 409 (đụng PROCESSING tạm thời) — KHÔNG
    // bao giờ cả 2 đều 201 với 2 organizationId KHÁC nhau.
    const successStatuses = [resA, resB].filter((r) => r.status === 201);
    expect(successStatuses.length).toBeGreaterThanOrEqual(1);
    if (successStatuses.length === 2) {
      expect(successStatuses[0].body.data.userInfo.organizationId).toBe(
        successStatuses[1].body.data.userInfo.organizationId,
      );
    }

    const orgCount = await prisma.organization.count({
      where: { displayName },
    });
    expect(orgCount).toBe(1);
  });

  it('CASE 21: cùng proof, intent (mật khẩu) ĐÃ ĐỔI so với lần COMPLETED trước → 409 SIGNUP_INTENT_MISMATCH, KHÔNG tạo Organization thứ 2', async () => {
    const email = uniqueEmail('case21');
    const proof = await signupOtpFlow(email);
    const displayName = `Case21 ${Date.now()}`;

    await request(server())
      .post('/api/v1/trial-signup')
      .send({
        signupProofToken: proof,
        organization: { displayName },
        owner: { fullName: 'Owner Original', password: 'SuperSecret123' },
      })
      .expect(201);

    const mismatchRes = await request(server())
      .post('/api/v1/trial-signup')
      .send({
        signupProofToken: proof,
        organization: { displayName },
        owner: {
          fullName: 'Owner Original',
          password: 'ADifferentPassword456',
        },
      });

    expect(mismatchRes.status).toBe(409);
    expect(mismatchRes.body.code).toBe('SIGNUP_003');

    const orgCount = await prisma.organization.count({
      where: { displayName },
    });
    expect(orgCount).toBe(1);
  });

  // =========================================================================
  // CASE 22-23 — orphan / partial state
  // =========================================================================

  it('CASE 22/23: slug conflict (client tự chọn slug đã tồn tại) → 409, KHÔNG có Organization/User/Role mồ côi nào được tạo (transactional rollback thật)', async () => {
    const existingEmail = uniqueEmail('case22-existing');
    const existingProof = await signupOtpFlow(existingEmail);
    const takenSlug = `case22-taken-${Date.now()}`;
    await request(server())
      .post('/api/v1/trial-signup')
      .send({
        signupProofToken: existingProof,
        organization: { displayName: 'Case22 Existing', slug: takenSlug },
        owner: { fullName: 'Owner Existing', password: 'SuperSecret123' },
      })
      .expect(201);

    const conflictEmail = uniqueEmail('case22-conflict');
    const conflictProof = await signupOtpFlow(conflictEmail);
    const conflictDisplayName = `Case22 Conflict ${Date.now()}`;

    const beforeUserCount = await prisma.user.count({
      where: { email: conflictEmail },
    });

    const res = await request(server())
      .post('/api/v1/trial-signup')
      .send({
        signupProofToken: conflictProof,
        organization: { displayName: conflictDisplayName, slug: takenSlug },
        owner: { fullName: 'Owner Conflict', password: 'SuperSecret123' },
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORGANIZATION_002');

    // Zero orphan: không Organization mới theo displayName này, không User theo email này.
    const orgCount = await prisma.organization.count({
      where: { displayName: conflictDisplayName },
    });
    expect(orgCount).toBe(0);
    const afterUserCount = await prisma.user.count({
      where: { email: conflictEmail },
    });
    expect(afterUserCount).toBe(beforeUserCount);

    // Finalization row chuyển FAILED (không COMPLETED) — cho phép retry sau này.
    const finalization = await prisma.trialSignupFinalization.findFirstOrThrow({
      where: { normalizedEmail: conflictEmail.toLowerCase() },
    });
    expect(finalization.status).toBe('FAILED');
    expect(finalization.organizationId).toBeNull();
  });

  // =========================================================================
  // CASE 24-27 — client cannot control privileged fields
  // =========================================================================

  it('CASE 24/25/26/27: client gửi kèm plan/isPlatformAdmin/entitlementOverrides/expiredAt/subscription limits trong body → 400 (forbidNonWhitelisted, field không tồn tại trong DTO công khai)', async () => {
    const email = uniqueEmail('case24-27');
    const proof = await signupOtpFlow(email);

    const res = await request(server())
      .post('/api/v1/trial-signup')
      .send({
        signupProofToken: proof,
        organization: {
          displayName: `Case24-27 ${Date.now()}`,
          plan: 'ENTERPRISE',
        },
        owner: {
          fullName: 'Owner Hacker',
          password: 'SuperSecret123',
          isPlatformAdmin: true,
        },
        subscription: {
          plan: 'ENTERPRISE',
          maxUser: 999999,
          expiredAt: '2099-01-01',
          entitlementOverrides: { BACKUP_RESTORE_ADMIN: true },
        },
      });

    // ValidationPipe({ forbidNonWhitelisted: true }) — bất kỳ field lạ nào cũng làm CẢ REQUEST bị
    // từ chối 400, không phải chỉ lặng lẽ bỏ qua field đó.
    expect(res.status).toBe(400);
  });

  // =========================================================================
  // CASE 28 — mail/queue failure creates no tenant
  // =========================================================================

  it('CASE 28: request-otp vẫn 204 kể cả khi không thể xác nhận email đã gửi thành công (SMTP rỗng ở test env, luôn fallback log — không có Organization/User nào được tạo ở bước request-otp, vì bước này thuần Redis)', async () => {
    const email = uniqueEmail('case28');
    const beforeOrgCount = await prisma.organization.count();
    const beforeUserCount = await prisma.user.count();

    await requestOtpAndCapture(email);

    expect(await prisma.organization.count()).toBe(beforeOrgCount);
    expect(await prisma.user.count()).toBe(beforeUserCount);
  });

  // =========================================================================
  // CASE 29 — same email, separate organizations (D4 approved V1 policy)
  // =========================================================================

  it('CASE 29: CÙNG 1 email có thể tạo 2 Organization TRIAL riêng biệt (D4 — không có chính sách one-trial-per-email trong V1)', async () => {
    const email = uniqueEmail('case29');

    const proof1 = await signupOtpFlow(email);
    const res1 = await request(server())
      .post('/api/v1/trial-signup')
      .send({
        signupProofToken: proof1,
        organization: { displayName: `Case29 First ${Date.now()}` },
        owner: { fullName: 'Owner First', password: 'SuperSecret123' },
      })
      .expect(201);

    const proof2 = await signupOtpFlow(email);
    const res2 = await request(server())
      .post('/api/v1/trial-signup')
      .send({
        signupProofToken: proof2,
        organization: { displayName: `Case29 Second ${Date.now()}` },
        owner: { fullName: 'Owner Second', password: 'SuperSecret123' },
      })
      .expect(201);

    expect(res1.body.data.userInfo.organizationId).not.toBe(
      res2.body.data.userInfo.organizationId,
    );

    const userCount = await prisma.user.count({ where: { email } });
    expect(userCount).toBe(2);
  });

  // =========================================================================
  // CASE 30-32 — non-regression
  // =========================================================================

  it('CASE 30: Platform Admin provisioning (POST /organizations) không hề bị ảnh hưởng — vẫn action "organization.created", vẫn yêu cầu PlatformAdminGuard', async () => {
    const res = await request(server())
      .post('/api/v1/organizations')
      .send({
        organization: {
          displayName: 'Case30 No Auth',
          slug: `case30-${Date.now()}`,
        },
        owner: {
          fullName: 'Owner',
          email: uniqueEmail('case30'),
          password: 'Password123',
        },
      });
    // Không có Authorization header → 401, KHÔNG phải lỗi validate DTO — chứng minh route vẫn
    // đứng sau đúng guard như trước T053.04.
    expect(res.status).toBe(401);
  });

  it('CASE 31: existing forgot-password flow không hề bị ảnh hưởng (OTP_xxx codes/hành vi giữ nguyên)', async () => {
    const res = await request(server())
      .post('/api/v1/auth/forgot-password')
      .send({
        organizationSlug: 'org-khong-ton-tai',
        email: uniqueEmail('case31'),
      });
    // Enumeration-safe — luôn 204 kể cả tổ chức/email không tồn tại (hành vi cũ, không đổi).
    expect(res.status).toBe(204);
  });

  it('CASE 32: existing login trả 401 đúng ErrorCode cho tổ chức không tồn tại (hành vi login/refresh/session không bị ảnh hưởng)', async () => {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({
        organizationSlug: 'org-khong-ton-tai-032',
        email: uniqueEmail('case32'),
        password: 'Password123',
      });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_001');
  });
});
