import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { buildAccessToken } from '@/test/build-access-token';
import { useAuthStore } from '@/stores/auth-store';
import TrialSignupPage from './page';

const API_BASE_URL = 'http://localhost:3000/api/v1';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function errorEnvelope(code: string, message: string) {
  return {
    success: false,
    code,
    message,
    errors: [],
    traceId: 't-1',
    timestamp: new Date().toISOString(),
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TrialSignupPage />
    </QueryClientProvider>,
  );
}

async function goThroughRequestStep(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
}

async function goThroughVerifyStep(user: ReturnType<typeof userEvent.setup>, otp: string) {
  await screen.findByLabelText('Mã OTP');
  await user.type(screen.getByLabelText('Mã OTP'), otp);
  await user.click(screen.getByRole('button', { name: 'Xác thực OTP' }));
}

describe('TrialSignupPage (T053.04)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    replace.mockClear();
  });

  it('full happy path: request OTP → verify → setup → redirects to /dashboard authenticated', async () => {
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    server.use(
      http.post(
        `${API_BASE_URL}/trial-signup/request-otp`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.post(`${API_BASE_URL}/trial-signup/verify-otp`, () =>
        HttpResponse.json(
          envelope({ signupProofToken: 'proof-token-abc', expiresAt: new Date().toISOString() }),
        ),
      ),
      http.post(`${API_BASE_URL}/trial-signup`, () =>
        HttpResponse.json(
          envelope({
            accessToken: token,
            userInfo: {
              id: 'user-1',
              email: 'owner@acme.com',
              username: 'owner',
              organizationId: 'org-1',
              branchId: null,
              permissions: [],
            },
          }),
          { status: 201 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderPage();

    await goThroughRequestStep(user, 'owner@acme.com');
    await goThroughVerifyStep(user, '123456');

    await screen.findByLabelText('Tên tổ chức');
    await user.type(screen.getByLabelText('Tên tổ chức'), 'Acme Corp');
    await user.type(screen.getByLabelText('Họ tên'), 'Owner Name');
    await user.type(screen.getByLabelText('Mật khẩu'), 'SuperSecret123');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'SuperSecret123');
    await user.click(screen.getByRole('button', { name: 'Hoàn tất đăng ký' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe(token);
  });

  it('request-otp step: client-side email validation blocks submit without calling the API', async () => {
    const handler = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/trial-signup/request-otp`, () => {
        handler();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    expect(await screen.findByText('Email không hợp lệ')).toBeInTheDocument();
    expect(handler).not.toHaveBeenCalled();
  });

  it('verify-otp step: shows normalized backend error (e.g. OTP_003 sai OTP) without advancing to setup', async () => {
    server.use(
      http.post(
        `${API_BASE_URL}/trial-signup/request-otp`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.post(`${API_BASE_URL}/trial-signup/verify-otp`, () =>
        HttpResponse.json(errorEnvelope('OTP_003', 'OTP không đúng'), { status: 400 }),
      ),
    );

    const user = userEvent.setup();
    renderPage();
    await goThroughRequestStep(user, 'owner@acme.com');
    await goThroughVerifyStep(user, '000000');

    expect(await screen.findByText('OTP không đúng')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tên tổ chức')).not.toBeInTheDocument();
  });

  it('setup step: password confirmation mismatch is caught client-side, API never called', async () => {
    const handler = vi.fn();
    server.use(
      http.post(
        `${API_BASE_URL}/trial-signup/request-otp`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.post(`${API_BASE_URL}/trial-signup/verify-otp`, () =>
        HttpResponse.json(
          envelope({ signupProofToken: 'proof-token-abc', expiresAt: new Date().toISOString() }),
        ),
      ),
      http.post(`${API_BASE_URL}/trial-signup`, () => {
        handler();
        return new HttpResponse(null, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderPage();
    await goThroughRequestStep(user, 'owner@acme.com');
    await goThroughVerifyStep(user, '123456');

    await screen.findByLabelText('Tên tổ chức');
    await user.type(screen.getByLabelText('Tên tổ chức'), 'Acme Corp');
    await user.type(screen.getByLabelText('Họ tên'), 'Owner Name');
    await user.type(screen.getByLabelText('Mật khẩu'), 'SuperSecret123');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'DifferentPassword456');
    await user.click(screen.getByRole('button', { name: 'Hoàn tất đăng ký' }));

    expect(await screen.findByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument();
    expect(handler).not.toHaveBeenCalled();
  });

  it('setup step: shows normalized backend error (e.g. ORGANIZATION_002 slug conflict) without redirecting', async () => {
    server.use(
      http.post(
        `${API_BASE_URL}/trial-signup/request-otp`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.post(`${API_BASE_URL}/trial-signup/verify-otp`, () =>
        HttpResponse.json(
          envelope({ signupProofToken: 'proof-token-abc', expiresAt: new Date().toISOString() }),
        ),
      ),
      http.post(`${API_BASE_URL}/trial-signup`, () =>
        HttpResponse.json(errorEnvelope('ORGANIZATION_002', 'Slug "acme" đã được sử dụng'), {
          status: 409,
        }),
      ),
    );

    const user = userEvent.setup();
    renderPage();
    await goThroughRequestStep(user, 'owner@acme.com');
    await goThroughVerifyStep(user, '123456');

    await screen.findByLabelText('Tên tổ chức');
    await user.type(screen.getByLabelText('Tên tổ chức'), 'Acme Corp');
    await user.type(screen.getByLabelText('Họ tên'), 'Owner Name');
    await user.type(screen.getByLabelText('Mật khẩu'), 'SuperSecret123');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'SuperSecret123');
    await user.click(screen.getByRole('button', { name: 'Hoàn tất đăng ký' }));

    expect(await screen.findByText('Slug "acme" đã được sử dụng')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('setup step: submitting WITHOUT slug (optional field) still succeeds — server derives it (D6)', async () => {
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    let capturedBody: unknown;
    server.use(
      http.post(
        `${API_BASE_URL}/trial-signup/request-otp`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.post(`${API_BASE_URL}/trial-signup/verify-otp`, () =>
        HttpResponse.json(
          envelope({ signupProofToken: 'proof-token-abc', expiresAt: new Date().toISOString() }),
        ),
      ),
      http.post(`${API_BASE_URL}/trial-signup`, async ({ request: req }) => {
        capturedBody = await req.json();
        return HttpResponse.json(
          envelope({
            accessToken: token,
            userInfo: {
              id: 'user-1',
              email: 'owner@acme.com',
              username: 'owner',
              organizationId: 'org-1',
              branchId: null,
              permissions: [],
            },
          }),
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderPage();
    await goThroughRequestStep(user, 'owner@acme.com');
    await goThroughVerifyStep(user, '123456');

    await screen.findByLabelText('Tên tổ chức');
    await user.type(screen.getByLabelText('Tên tổ chức'), 'Acme Corp');
    await user.type(screen.getByLabelText('Họ tên'), 'Owner Name');
    await user.type(screen.getByLabelText('Mật khẩu'), 'SuperSecret123');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'SuperSecret123');
    await user.click(screen.getByRole('button', { name: 'Hoàn tất đăng ký' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect((capturedBody as { organization: { slug?: string } }).organization.slug).toBeUndefined();
  });
});
