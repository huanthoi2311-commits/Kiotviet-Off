import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { UserEditForm } from './user-edit-form';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const USER_ID = 'user-1';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    organizationId: 'org-1',
    branchId: null,
    username: 'staff01',
    fullName: 'Nguyễn Văn A',
    email: 'staff01@acme.test',
    phone: '0987654321',
    avatar: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    roleCodes: [],
    ...overrides,
  };
}

function stubBranches() {
  server.use(
    http.get(`${API_BASE_URL}/branches`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'branch-1', name: 'Chi nhánh 1' }]))),
    ),
  );
}

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UserEditForm id={USER_ID} />
    </QueryClientProvider>,
  );
}

describe('UserEditForm (T052.02C)', () => {
  beforeEach(async () => {
    useAuthStore.getState().clear();
    stubBranches();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the "not found" empty state for USER_001', async () => {
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () =>
        HttpResponse.json(errorEnvelope('USER_001', 'Không tìm thấy người dùng'), { status: 404 }),
      ),
    );
    renderForm();
    expect(await screen.findByText('Không tìm thấy nhân viên')).toBeInTheDocument();
  });

  it('renders detail fields, including read-only username/email', async () => {
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => HttpResponse.json(envelope(buildUser()))),
    );
    renderForm();

    await screen.findByDisplayValue('staff01');
    expect(screen.getByLabelText('Tên đăng nhập')).toBeDisabled();
    expect(screen.getByLabelText('Email')).toBeDisabled();
  });

  it('renders roleCodes in a read-only section, with no assign/remove controls', async () => {
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () =>
        HttpResponse.json(envelope(buildUser({ roleCodes: ['owner', 'sales_staff'] }))),
      ),
    );
    renderForm();

    await screen.findByDisplayValue('staff01');
    expect(screen.getByText('owner')).toBeInTheDocument();
    expect(screen.getByText('sales_staff')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Gán vai trò|Assign Role/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Gỡ vai trò|Remove Role/i }),
    ).not.toBeInTheDocument();
  });

  it('shows "Chưa có vai trò nào được gán" when roleCodes is empty', async () => {
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () =>
        HttpResponse.json(envelope(buildUser({ roleCodes: [] }))),
      ),
    );
    renderForm();
    expect(await screen.findByText('Chưa có vai trò nào được gán.')).toBeInTheDocument();
  });

  it('renders a disabled read-only form for a user without user:update', async () => {
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => HttpResponse.json(envelope(buildUser()))),
    );
    renderForm();

    const fullNameInput = await screen.findByLabelText('Họ tên');
    expect(fullNameInput).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đặt lại mật khẩu' })).not.toBeInTheDocument();
  });

  it('updates fullName/phone/branchId only (approved whitelist)', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:update'],
    });
    useAuthStore.getState().setAccessToken(token);
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => HttpResponse.json(envelope(buildUser()))),
      http.patch(`${API_BASE_URL}/users/${USER_ID}`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildUser({ fullName: 'Tên mới' })));
      }),
    );
    renderForm();

    await screen.findByDisplayValue('Nguyễn Văn A');
    const fullNameInput = screen.getByLabelText('Họ tên');
    await userEvent.clear(fullNameInput);
    await userEvent.type(fullNameInput, 'Tên mới');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ fullName: 'Tên mới' }));
    expect(capturedBody).not.toHaveProperty('username');
    expect(capturedBody).not.toHaveProperty('email');
    expect(capturedBody).not.toHaveProperty('status');
    expect(capturedBody).not.toHaveProperty('organizationId');
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã cập nhật nhân viên'));
  });

  it('BRANCH_001 on save surfaces as a field-level error on branchId', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:update'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => HttpResponse.json(envelope(buildUser()))),
      http.patch(`${API_BASE_URL}/users/${USER_ID}`, () =>
        HttpResponse.json(errorEnvelope('BRANCH_001', 'Không tìm thấy chi nhánh'), { status: 404 }),
      ),
    );
    renderForm();

    await screen.findByDisplayValue('Nguyễn Văn A');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Không tìm thấy chi nhánh')).toBeInTheDocument();
  });

  it('ACTIVE status shows only "Vô hiệu hóa" for a user with both permissions', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:deactivate', 'user:activate'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () =>
        HttpResponse.json(envelope(buildUser({ status: 'ACTIVE' }))),
      ),
    );
    renderForm();

    expect(await screen.findByRole('button', { name: 'Vô hiệu hóa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kích hoạt lại' })).not.toBeInTheDocument();
  });

  it('INACTIVE status shows only "Kích hoạt lại"', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:deactivate', 'user:activate'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () =>
        HttpResponse.json(envelope(buildUser({ status: 'INACTIVE' }))),
      ),
    );
    renderForm();

    expect(await screen.findByRole('button', { name: 'Kích hoạt lại' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vô hiệu hóa' })).not.toBeInTheDocument();
  });

  it('deactivate action invalidates queries and shows a success toast', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:deactivate'],
    });
    useAuthStore.getState().setAccessToken(token);
    let deactivateCalled = false;
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () =>
        HttpResponse.json(envelope(buildUser({ status: 'ACTIVE' }))),
      ),
      http.patch(`${API_BASE_URL}/users/${USER_ID}/deactivate`, () => {
        deactivateCalled = true;
        return HttpResponse.json(envelope(buildUser({ status: 'INACTIVE' })));
      }),
    );
    renderForm();

    await userEvent.click(await screen.findByRole('button', { name: 'Vô hiệu hóa' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Vô hiệu hóa' }));

    await waitFor(() => expect(deactivateCalled).toBe(true));
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã vô hiệu hóa nhân viên'));
  });

  it('USER_CANNOT_DEACTIVATE_SELF shows an explicit dialog error without navigating away', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:deactivate'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () =>
        HttpResponse.json(envelope(buildUser({ status: 'ACTIVE' }))),
      ),
      http.patch(`${API_BASE_URL}/users/${USER_ID}/deactivate`, () =>
        HttpResponse.json(
          errorEnvelope('USER_CANNOT_DEACTIVATE_SELF', 'Không thể tự vô hiệu hóa chính mình'),
          { status: 422 },
        ),
      ),
    );
    renderForm();

    await userEvent.click(await screen.findByRole('button', { name: 'Vô hiệu hóa' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Vô hiệu hóa' }));

    expect(await screen.findByText('Không thể tự vô hiệu hóa chính mình')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('USER_CANNOT_DEACTIVATE_OWNER shows an explicit dialog error', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:deactivate'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () =>
        HttpResponse.json(envelope(buildUser({ status: 'ACTIVE' }))),
      ),
      http.patch(`${API_BASE_URL}/users/${USER_ID}/deactivate`, () =>
        HttpResponse.json(
          errorEnvelope('USER_CANNOT_DEACTIVATE_OWNER', 'Không thể vô hiệu hóa chủ sở hữu tổ chức'),
          { status: 422 },
        ),
      ),
    );
    renderForm();

    await userEvent.click(await screen.findByRole('button', { name: 'Vô hiệu hóa' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Vô hiệu hóa' }));

    expect(await screen.findByText('Không thể vô hiệu hóa chủ sở hữu tổ chức')).toBeInTheDocument();
  });

  it('USER_INVALID_TRANSITION shows an explicit dialog error', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:activate'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () =>
        HttpResponse.json(envelope(buildUser({ status: 'INACTIVE' }))),
      ),
      http.patch(`${API_BASE_URL}/users/${USER_ID}/reactivate`, () =>
        HttpResponse.json(
          errorEnvelope(
            'USER_INVALID_TRANSITION',
            'Không thể chuyển user từ trạng thái ACTIVE sang ACTIVE',
          ),
          { status: 422 },
        ),
      ),
    );
    renderForm();

    await userEvent.click(await screen.findByRole('button', { name: 'Kích hoạt lại' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Kích hoạt lại' }));

    expect(
      await screen.findByText('Không thể chuyển user từ trạng thái ACTIVE sang ACTIVE'),
    ).toBeInTheDocument();
  });

  it('opens the reset-password dialog for a user with user:update', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:update'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => HttpResponse.json(envelope(buildUser()))),
    );
    renderForm();

    await userEvent.click(await screen.findByRole('button', { name: 'Đặt lại mật khẩu' }));
    expect(screen.getByRole('dialog', { name: 'Đặt lại mật khẩu' })).toBeInTheDocument();
  });

  it('has no accessibility violations once loaded', async () => {
    const token = buildAccessToken({
      sub: 'admin-1',
      organizationId: 'org-1',
      permissions: ['user:update', 'user:deactivate'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/users/${USER_ID}`, () => HttpResponse.json(envelope(buildUser()))),
    );

    const { container } = renderForm();
    await screen.findByDisplayValue('Nguyễn Văn A');
    expect(await axe(container)).toHaveNoViolations();
  });
});
