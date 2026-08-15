import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { RoleCreateForm } from './role-form';

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

function buildRole(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    organizationId: 'org-1',
    code: 'sales_staff',
    name: 'Nhân viên bán hàng',
    isSystem: false,
    description: null,
    ...overrides,
  };
}

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RoleCreateForm />
    </QueryClientProvider>,
  );
}

describe('RoleCreateForm (T052.03C §4)', () => {
  beforeEach(async () => {
    push.mockClear();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('renders every field with an accessible label — code/name/description only, no isSystem field', async () => {
    renderForm();
    await screen.findByLabelText('Mã vai trò');

    expect(screen.getByLabelText('Mã vai trò')).toBeInTheDocument();
    expect(screen.getByLabelText('Tên vai trò')).toBeInTheDocument();
    expect(screen.getByLabelText('Mô tả')).toBeInTheDocument();
    expect(screen.queryByLabelText(/hệ thống/i)).not.toBeInTheDocument();
  });

  it('validates code against the backend regex client-side (lowercase/digits/underscore only)', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/roles`, () => {
        called = true;
        return HttpResponse.json(envelope(buildRole()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Mã vai trò');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã vai trò'), 'Sales-Staff!');
    await user.type(screen.getByLabelText('Tên vai trò'), 'Nhân viên bán hàng');
    await user.click(screen.getByRole('button', { name: 'Tạo vai trò' }));

    expect(
      await screen.findByText('Mã vai trò chỉ gồm chữ thường, số và dấu gạch dưới'),
    ).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('submits with only required fields and calls create with the expected payload, then navigates to the new role detail', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${API_BASE_URL}/roles`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(envelope(buildRole({ id: 'new-role-1' })), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Mã vai trò');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã vai trò'), 'sales_staff');
    await user.type(screen.getByLabelText('Tên vai trò'), 'Nhân viên bán hàng');
    await user.click(screen.getByRole('button', { name: 'Tạo vai trò' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({ code: 'sales_staff', name: 'Nhân viên bán hàng' }),
    );
    expect(capturedBody).not.toHaveProperty('description');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/roles/new-role-1'));
  });

  it('blocks submission and makes zero network calls when a required field is invalid', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/roles`, () => {
        called = true;
        return HttpResponse.json(envelope(buildRole()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Mã vai trò');

    await userEvent.click(screen.getByRole('button', { name: 'Tạo vai trò' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Mã vai trò')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(called).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a field-level error on code for RBAC_002 (duplicate), with no duplicate global toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.post(`${API_BASE_URL}/roles`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'RBAC_002',
            message: 'Mã vai trò đã tồn tại',
            errors: [],
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 409 },
        ),
      ),
    );

    renderForm();
    await screen.findByLabelText('Mã vai trò');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã vai trò'), 'sales_staff');
    await user.type(screen.getByLabelText('Tên vai trò'), 'Trùng mã');
    await user.click(screen.getByRole('button', { name: 'Tạo vai trò' }));

    expect(await screen.findByText('Mã vai trò đã tồn tại')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows a root-level alert (not a field error) for any other error code, with no duplicate global toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.post(`${API_BASE_URL}/roles`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'HTTP_500',
            message: 'Đã xảy ra lỗi hệ thống',
            errors: [],
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 500 },
        ),
      ),
    );

    renderForm();
    await screen.findByLabelText('Mã vai trò');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã vai trò'), 'sales_staff');
    await user.type(screen.getByLabelText('Tên vai trò'), 'Nhân viên');
    await user.click(screen.getByRole('button', { name: 'Tạo vai trò' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Đã xảy ra lỗi hệ thống');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('navigates immediately on Cancel when the form is pristine', async () => {
    renderForm();
    await screen.findByLabelText('Mã vai trò');

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(push).toHaveBeenCalledWith('/roles');
    expect(screen.queryByText('Hủy các thay đổi chưa lưu?')).not.toBeInTheDocument();
  });

  it('shows a confirm dialog on Cancel when the form is dirty, and only navigates after confirming', async () => {
    renderForm();
    await screen.findByLabelText('Mã vai trò');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã vai trò'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(await screen.findByText('Hủy các thay đổi chưa lưu?')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Hủy thay đổi' }));
    expect(push).toHaveBeenCalledWith('/roles');
  });

  it('has no accessibility violations on the empty form', async () => {
    const { container } = renderForm();
    await screen.findByLabelText('Mã vai trò');
    expect(await axe(container)).toHaveNoViolations();
  });
});
