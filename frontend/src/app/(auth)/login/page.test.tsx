import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { buildAccessToken } from '@/test/build-access-token';
import { useAuthStore } from '@/stores/auth-store';
import LoginPage from './page';

const API_BASE_URL = 'http://localhost:3000/api/v1';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

function renderLoginPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginPage />
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    replace.mockClear();
  });

  it('logs in successfully and redirects to /dashboard (AC1, FR1)', async () => {
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () =>
        HttpResponse.json({
          accessToken: token,
          userInfo: {
            id: 'user-1',
            email: 'owner@kiotviet-off.vn',
            username: 'owner',
            organizationId: 'org-1',
            branchId: null,
            permissions: [],
          },
        }),
      ),
    );

    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Mã tổ chức'), 'kiotviet-off');
    await user.type(screen.getByLabelText('Email'), 'owner@kiotviet-off.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'P@ssw0rd123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe(token);
  });

  it('shows the normalized backend error on invalid credentials without redirecting (AC1, FR9)', async () => {
    server.use(
      http.post(
        `${API_BASE_URL}/auth/login`,
        () =>
          HttpResponse.json(
            {
              success: false,
              code: 'AUTH_001',
              message: 'Email hoặc mật khẩu không đúng',
              errors: [],
              traceId: 't-1',
              timestamp: new Date().toISOString(),
            },
            { status: 401 },
          ),
        { once: true },
      ),
    );

    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Mã tổ chức'), 'kiotviet-off');
    await user.type(screen.getByLabelText('Email'), 'owner@kiotviet-off.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Email hoặc mật khẩu không đúng')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('shows client-side validation errors without calling the API', async () => {
    const loginHandler = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () => {
        loginHandler();
        return HttpResponse.json({});
      }),
    );

    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Vui lòng nhập mã tổ chức')).toBeInTheDocument();
    expect(loginHandler).not.toHaveBeenCalled();
  });
});
