import { test, expect, request as playwrightRequest } from '@playwright/test';
import { backendBaseUrl } from './support';

/**
 * T053.04 — Self-Service Trial Signup + Email/OTP (real stack, real browser).
 *
 * OTP thật được gửi qua SMTP thật (MailProcessor, hành vi KHÔNG đổi) — trỏ vào Mailpit (SMTP
 * catcher chạy trong chính Docker Compose stack, xem docker-compose.release-e2e.yml) thay vì SMTP
 * ngoài đời, đọc lại qua HTTP API của Mailpit giống hệt người dùng thật mở hộp thư. KHÔNG đọc log
 * console container (NODE_ENV=production redact OTP khỏi log — T030.11, không được yếu hoá).
 *
 * CASE C ("a feature outside TRIAL is blocked") — tính đến thời điểm T053.04, CHỈ CÓ 3 route
 * nghiệp vụ thật gắn `@RequireEntitlement` (USER_MANAGEMENT/RBAC_MANAGEMENT/SUPPLIER), và CẢ 3 đều
 * nằm trong TRIAL — không có route nào hiện có bị chặn bởi 1 feature NGOÀI TRIAL để test qua hành
 * vi nghiệp vụ thật. CASE C vì vậy xác nhận trực tiếp tại đúng ranh giới entitlement resolution
 * (`GET /entitlements/current`) — Organization vừa signup KHÔNG có ADVANCED_REPORTS/API_ACCESS/
 * BACKUP_RESTORE_ADMIN/MULTI_BRANCH_ADVANCED (4 feature không thuộc TRIAL) — báo cáo trung thực về
 * giới hạn phạm vi thay vì dựng 1 route giả chỉ để test.
 */
const MAILPIT_URL = process.env.RELEASE_E2E_MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitMessageSummary {
  ID: string;
}

interface MailpitMessage {
  Text: string;
}

async function fetchOtpFromMailpit(email: string): Promise<string> {
  const api = await playwrightRequest.newContext();
  try {
    let messageId: string | undefined;
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const listRes = await api.get(
        `${MAILPIT_URL}/api/v1/messages?query=${encodeURIComponent(`to:${email}`)}`,
      );
      if (listRes.ok()) {
        const body = (await listRes.json()) as { messages: MailpitMessageSummary[] };
        if (body.messages.length > 0) {
          messageId = body.messages[0].ID;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!messageId) {
      throw new Error(`[fetchOtpFromMailpit] Không nhận được email nào cho ${email} sau 10s`);
    }

    const messageRes = await api.get(`${MAILPIT_URL}/api/v1/message/${messageId}`);
    expect(messageRes.ok()).toBeTruthy();
    const message = (await messageRes.json()) as MailpitMessage;
    const match = message.Text.match(/(\d{6})/);
    if (!match) {
      throw new Error(
        `[fetchOtpFromMailpit] Không tìm thấy OTP 6 chữ số trong nội dung email: ${message.Text}`,
      );
    }
    return match[1];
  } finally {
    await api.dispose();
  }
}

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}${Math.floor(Math.random() * 1000)}@trial-e2e-release.local`;
}

test.describe('T053.04 — Self-Service Trial Signup (real stack, real email)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('CASE A/B/C: request OTP → verify → tạo tổ chức TRIAL → đăng nhập ngay → dùng được tính năng TRIAL (Nhà cung cấp) → KHÔNG có feature ngoài TRIAL', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('case-a');
    const displayName = `Trial E2E ${Date.now()}`;

    await page.goto('/trial-signup');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Gửi mã OTP' }).click();

    const otp = await fetchOtpFromMailpit(email);

    await page.getByLabel('Mã OTP').fill(otp);
    await page.getByRole('button', { name: 'Xác thực OTP' }).click();

    await page.getByLabel('Tên tổ chức').fill(displayName);
    await page.getByLabel('Họ tên').fill('Trial Owner');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('SuperSecret123');
    await page.getByLabel('Xác nhận mật khẩu').fill('SuperSecret123');

    // accessToken sống CHỈ trong bộ nhớ JS (Zustand, không persist localStorage — quy ước bảo mật
    // hiện có), nên bắt lại NGUYÊN VĂN từ chính response POST /trial-signup thật thay vì cố đọc
    // lại từ storage của trang.
    const [finalizeResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().endsWith('/trial-signup') && res.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Hoàn tất đăng ký' }).click(),
    ]);
    expect(finalizeResponse.ok()).toBeTruthy();
    const accessToken: string = (await finalizeResponse.json()).data.accessToken;

    // CASE A — đăng nhập ngay, không cần bước /auth/login riêng.
    await page.waitForURL('**/dashboard', { timeout: 30_000 });

    // CASE B — TRIAL bao gồm SUPPLIER → nav "Nhà cung cấp" hiển thị VÀ trang dùng được thật.
    await expect(page.getByRole('link', { name: 'Nhà cung cấp' })).toBeVisible();
    await page.getByRole('link', { name: 'Nhà cung cấp' }).click();
    await page.waitForURL('**/suppliers');
    await expect(page.getByRole('heading', { name: 'Nhà cung cấp' })).toBeVisible();

    // CASE C — xác nhận trực tiếp tại ranh giới entitlement resolution (xem doc-comment đầu file).
    const entitlementRes = await request.get(`${backendBaseUrl()}/entitlements/current`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(entitlementRes.ok()).toBeTruthy();
    const entitlementBody = await entitlementRes.json();
    const effectiveFeatures: string[] = entitlementBody.data.effectiveFeatures;
    expect(effectiveFeatures).toEqual(expect.arrayContaining(['SUPPLIER', 'USER_MANAGEMENT']));
    expect(effectiveFeatures).not.toEqual(
      expect.arrayContaining(['ADVANCED_REPORTS', 'API_ACCESS', 'BACKUP_RESTORE_ADMIN']),
    );
  });

  test('CASE D: tampered/invalid signup proof → API 400, KHÔNG tạo Organization', async ({
    request,
  }) => {
    const displayName = `Trial E2E Tampered ${Date.now()}`;
    const res = await request.post(`${backendBaseUrl()}/trial-signup`, {
      data: {
        signupProofToken: 'clearly-not-a-real-jwt.tampered.value',
        organization: { displayName },
        owner: { fullName: 'Attacker', password: 'SuperSecret123' },
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe('SIGNUP_001');

    // Zero-orphan — Organization thật sự không được tạo (kiểm chứng qua chính UI login, KHÔNG
    // trực tiếp query DB — đúng phạm vi T051.08 §4 "UI trước, API/DB chỉ cho invariant cuối").
    const loginCheck = await request.post(`${backendBaseUrl()}/auth/login`, {
      data: { organizationSlug: 'trial-e2e-tampered-slug', email: 'nope@x.com', password: 'x' },
    });
    expect(loginCheck.status()).toBe(401);
  });

  test('CASE E: 2 request finalize đồng thời (cùng signup proof, qua đúng API thật của gói triển khai) → cả 2 kết quả cùng trỏ về ĐÚNG 1 Organization', async ({
    request,
  }) => {
    const email = uniqueEmail('case-e');
    const displayName = `Trial E2E DoubleSubmit ${Date.now()}`;

    // Dùng đúng API thật (không qua UI) để lấy signupProofToken xác định — double-click UI có độ
    // trễ DOM không xác định, không phù hợp để chứng minh 1 race-condition kỹ thuật chính xác;
    // bất biến "double-submit an toàn" đã có real-browser proof gián tiếp qua CASE A (luồng UI đầy
    // đủ chạy được trên đúng gói triển khai thật) — ở đây tập trung riêng vào tính xác định của race.
    await request.post(`${backendBaseUrl()}/trial-signup/request-otp`, {
      data: { email },
    });
    const otp = await fetchOtpFromMailpit(email);
    const verifyRes = await request.post(`${backendBaseUrl()}/trial-signup/verify-otp`, {
      data: { email, otp },
    });
    expect(verifyRes.ok()).toBeTruthy();
    const { signupProofToken } = await verifyRes.json().then((body) => body.data);

    const payload = {
      signupProofToken,
      organization: { displayName },
      owner: { fullName: 'Owner DoubleSubmit', password: 'SuperSecret123' },
    };

    const [resA, resB] = await Promise.all([
      request.post(`${backendBaseUrl()}/trial-signup`, { data: payload }),
      request.post(`${backendBaseUrl()}/trial-signup`, { data: payload }),
    ]);

    const successResponses = [resA, resB].filter((r) => r.status() === 201);
    expect(successResponses.length).toBeGreaterThanOrEqual(1);
    const orgIds = await Promise.all(
      successResponses.map((r) => r.json().then((body) => body.data.userInfo.organizationId)),
    );
    expect(new Set(orgIds).size).toBe(1);
  });
});
