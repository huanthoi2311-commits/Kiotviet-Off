import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { UserEditForm } from './user-edit-form';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const USER_ID = 'user-1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    organizationId: 'org-1',
    branchId: null,
    username: 'sales01',
    fullName: 'Nguyễn Văn A',
    email: 'sales01@pos-erp.local',
    phone: null,
    avatar: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    roleCodes: ['sales_staff'],
    ...overrides,
  };
}

const ROLES = [
  {
    id: 'role-1',
    organizationId: 'org-1',
    code: 'sales_staff',
    name: 'Nhân viên bán hàng',
    isSystem: false,
    description: null,
  },
  {
    id: 'role-2',
    organizationId: 'org-1',
    code: 'warehouse_staff',
    name: 'Nhân viên kho',
    isSystem: false,
    description: null,
  },
];

function mockUserAndBranches() {
  server.use(
    http.get(`${API_BASE_URL}/branches`, () =>
      HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 100 })),
    ),
  );
}

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UserEditForm id={USER_ID} />
    </QueryClientProvider>,
  );
}

describe('UserEditForm — role assignment section (T052.03C §8/§9/§10)', () => {
  beforeEach(async () => {
    useAuthStore.getState().clear();
    mockUserAndBranches();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('without user:update: read-only badges, no "Gán vai trò" button, no remove buttons', async () => {
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => HttpResponse.json(envelope(buildUser()))),
    );

    renderForm();
    await screen.findByText('sales_staff');

    expect(screen.queryByRole('button', { name: 'Gán vai trò' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gỡ vai trò/ })).not.toBeInTheDocument();
  });

  it('with user:update but WITHOUT role:view: still read-only — no role selector fabricated, and GET /roles is never called', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:update'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => HttpResponse.json(envelope(buildUser()))),
      // Deliberately NOT mocking GET /roles — `onUnhandledRequest: 'error'` means this test fails
      // loudly if the component fetches it anyway, proving the hook stays disabled.
    );

    renderForm();
    await screen.findByText('sales_staff');

    expect(screen.queryByRole('button', { name: 'Gán vai trò' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gỡ vai trò/ })).not.toBeInTheDocument();
  });

  it('with role:view but WITHOUT user:update: still read-only (view-only), no assign/remove buttons', async () => {
    const token = buildAccessToken({
      sub: 'viewer-1',
      organizationId: 'org-1',
      permissions: ['role:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => HttpResponse.json(envelope(buildUser()))),
    );

    renderForm();
    await screen.findByText('sales_staff');

    expect(screen.queryByRole('button', { name: 'Gán vai trò' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gỡ vai trò/ })).not.toBeInTheDocument();
  });

  it('with BOTH user:update and role:view: shows "Gán vai trò" and a remove button per assigned role', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:update', 'role:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => HttpResponse.json(envelope(buildUser()))),
      http.get(`${API_BASE_URL}/roles`, () => HttpResponse.json(envelope(ROLES))),
    );

    renderForm();
    await screen.findByText('sales_staff');

    expect(await screen.findByRole('button', { name: 'Gán vai trò' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gỡ vai trò sales_staff' })).toBeInTheDocument();
  });

  it('assign flow: opening the dialog offers only roles not already held, and a successful assign refreshes the user detail', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:update', 'role:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    let userDetailCallCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => {
        userDetailCallCount += 1;
        const roleCodes =
          userDetailCallCount === 1 ? ['sales_staff'] : ['sales_staff', 'warehouse_staff'];
        return HttpResponse.json(envelope(buildUser({ roleCodes })));
      }),
      http.get(`${API_BASE_URL}/roles`, () => HttpResponse.json(envelope(ROLES))),
      http.post(`${API_BASE_URL}/roles/assign`, () =>
        HttpResponse.json(envelope(null), { status: 201 }),
      ),
    );

    renderForm();
    await screen.findByText('sales_staff');

    await userEvent.click(await screen.findByRole('button', { name: 'Gán vai trò' }));
    await userEvent.click(screen.getByRole('combobox'));

    // Already-held role is excluded from the available list.
    expect(screen.queryByRole('option', { name: /sales_staff/ })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('option', { name: /warehouse_staff/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Gán vai trò' }));

    expect(await screen.findByText('warehouse_staff')).toBeInTheDocument();
  });

  it('remove flow: clicking the remove button opens a confirm dialog; confirming removes the role and refreshes user detail', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:update', 'role:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    let userDetailCallCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => {
        userDetailCallCount += 1;
        const roleCodes = userDetailCallCount === 1 ? ['sales_staff'] : [];
        return HttpResponse.json(envelope(buildUser({ roleCodes })));
      }),
      http.get(`${API_BASE_URL}/roles`, () => HttpResponse.json(envelope(ROLES))),
      http.delete(`${API_BASE_URL}/roles/role-1/users/${USER_ID}`, () =>
        HttpResponse.text('', { status: 204 }),
      ),
    );

    renderForm();
    await screen.findByText('sales_staff');

    await userEvent.click(await screen.findByRole('button', { name: 'Gỡ vai trò sales_staff' }));
    expect(await screen.findByText('Gỡ vai trò khỏi người dùng?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Gỡ vai trò' }));

    await waitFor(() =>
      expect(screen.getByText('Chưa có vai trò nào được gán.')).toBeInTheDocument(),
    );
  });

  it('remove flow: RBAC_006 keeps the confirm dialog open with the owner-protection message', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:update', 'role:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => HttpResponse.json(envelope(buildUser()))),
      http.get(`${API_BASE_URL}/roles`, () => HttpResponse.json(envelope(ROLES))),
      http.delete(`${API_BASE_URL}/roles/role-1/users/${USER_ID}`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'RBAC_006',
            message: 'Thao tác sẽ khiến chủ sở hữu tổ chức mất quyền role:update',
            errors: [],
          },
          { status: 409 },
        ),
      ),
    );

    renderForm();
    await screen.findByText('sales_staff');

    await userEvent.click(await screen.findByRole('button', { name: 'Gỡ vai trò sales_staff' }));
    await userEvent.click(screen.getByRole('button', { name: 'Gỡ vai trò' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/role:update/);
    expect(screen.getByText('Gỡ vai trò khỏi người dùng?')).toBeInTheDocument();
  });

  it('has no accessibility violations with the interactive role section rendered', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:update', 'role:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => HttpResponse.json(envelope(buildUser()))),
      http.get(`${API_BASE_URL}/roles`, () => HttpResponse.json(envelope(ROLES))),
    );

    const { container } = renderForm();
    await screen.findByText('sales_staff');
    await screen.findByRole('button', { name: 'Gán vai trò' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
