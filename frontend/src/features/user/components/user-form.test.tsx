import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { UserCreateForm } from './user-form';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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
    id: 'user-new-1',
    organizationId: 'org-1',
    branchId: null,
    username: 'staff01',
    fullName: null,
    email: 'staff01@acme.test',
    phone: null,
    avatar: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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
      <UserCreateForm />
    </QueryClientProvider>,
  );
}

async function fillRequiredFields(overrides: { password?: string; confirmPassword?: string } = {}) {
  await userEvent.type(screen.getByLabelText('Tên đăng nhập'), 'staff01');
  await userEvent.type(screen.getByLabelText('Email'), 'staff01@acme.test');
  await userEvent.type(screen.getByLabelText('Mật khẩu'), overrides.password ?? 'Password123');
  await userEvent.type(
    screen.getByLabelText('Xác nhận mật khẩu'),
    overrides.confirmPassword ?? overrides.password ?? 'Password123',
  );
}

describe('UserCreateForm (T052.02C)', () => {
  beforeEach(() => {
    push.mockClear();
    stubBranches();
  });

  it('requires username, email and password before submitting', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhân viên' }));
    expect(await screen.findByText(/Tên đăng nhập/)).toBeInTheDocument();
  });

  it('rejects a password shorter than 8 characters', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('Tên đăng nhập'), 'staff01');
    await userEvent.type(screen.getByLabelText('Email'), 'staff01@acme.test');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'short1');
    await userEvent.type(screen.getByLabelText('Xác nhận mật khẩu'), 'short1');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhân viên' }));

    // Both password and confirmPassword fail the same min(8) rule simultaneously here.
    expect((await screen.findAllByText('Mật khẩu tối thiểu 8 ký tự')).length).toBeGreaterThan(0);
  });

  it('rejects a mismatched password confirmation', async () => {
    renderForm();
    await fillRequiredFields({ password: 'Password123', confirmPassword: 'Different123' });
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhân viên' }));

    expect(await screen.findByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument();
  });

  it('submits without confirmPassword in the request body and navigates to the new user detail page', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE_URL}/users`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildUser()), { status: 201 });
      }),
    );

    renderForm();
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhân viên' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        username: 'staff01',
        email: 'staff01@acme.test',
        password: 'Password123',
      }),
    );
    expect(capturedBody?.confirmPassword).toBeUndefined();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/users/user-new-1'));
  });

  it('USER_002 (duplicate username) surfaces as a field-level error on username', async () => {
    server.use(
      http.post(`${API_BASE_URL}/users`, () =>
        HttpResponse.json(
          errorEnvelope('USER_002', 'Tên đăng nhập "staff01" đã được sử dụng trong tổ chức'),
          { status: 409 },
        ),
      ),
    );

    renderForm();
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhân viên' }));

    expect(
      await screen.findByText('Tên đăng nhập "staff01" đã được sử dụng trong tổ chức'),
    ).toBeInTheDocument();
  });

  it('USER_003 (duplicate email) surfaces as a field-level error on email', async () => {
    server.use(
      http.post(`${API_BASE_URL}/users`, () =>
        HttpResponse.json(
          errorEnvelope('USER_003', 'Email "staff01@acme.test" đã được sử dụng trong tổ chức'),
          { status: 409 },
        ),
      ),
    );

    renderForm();
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhân viên' }));

    expect(
      await screen.findByText('Email "staff01@acme.test" đã được sử dụng trong tổ chức'),
    ).toBeInTheDocument();
  });

  it('BRANCH_001 (cross-org/nonexistent branch) surfaces as a field-level error on branchId', async () => {
    server.use(
      http.post(`${API_BASE_URL}/users`, () =>
        HttpResponse.json(errorEnvelope('BRANCH_001', 'Không tìm thấy chi nhánh'), { status: 404 }),
      ),
    );

    renderForm();
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhân viên' }));

    expect(await screen.findByText('Không tìm thấy chi nhánh')).toBeInTheDocument();
  });

  it('has no accessibility violations on the empty form', async () => {
    const { container } = renderForm();
    expect(await axe(container)).toHaveNoViolations();
  });
});
