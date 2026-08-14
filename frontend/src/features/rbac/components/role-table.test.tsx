import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { RoleTable } from './role-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RoleTable />
    </QueryClientProvider>,
  );
}

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildRole(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    organizationId: 'org-1',
    code: 'sales_staff',
    name: 'Nhân viên bán hàng',
    isSystem: false,
    description: 'Vai trò cho nhân viên bán hàng',
    ...overrides,
  };
}

describe('RoleTable (T052.03C)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('renders role rows with the expected columns (no permission-count / user-count column)', async () => {
    server.use(http.get(`${API_BASE_URL}/roles`, () => HttpResponse.json(envelope([buildRole()]))));

    renderTable();
    await screen.findByText('Nhân viên bán hàng');
    expect(screen.getByText('sales_staff')).toBeInTheDocument();
    expect(screen.getByText('Vai trò cho nhân viên bán hàng')).toBeInTheDocument();
    expect(screen.queryByText(/permission/i)).not.toBeInTheDocument();
  });

  it('shows a "Hệ thống" badge for isSystem roles, and "—" for non-system roles', async () => {
    server.use(
      http.get(`${API_BASE_URL}/roles`, () =>
        HttpResponse.json(
          envelope([
            buildRole({ id: 'r1', code: 'owner', name: 'Owner', isSystem: true }),
            buildRole({ id: 'r2', code: 'sales_staff', name: 'Sales' }),
          ]),
        ),
      ),
    );

    renderTable();
    await screen.findByText('Owner');
    expect(screen.getByText('Hệ thống')).toBeInTheDocument();
  });

  it('a "Xem" link is always present (row visibility is already gated by the page-level role:view PermissionGate)', async () => {
    server.use(http.get(`${API_BASE_URL}/roles`, () => HttpResponse.json(envelope([buildRole()]))));

    renderTable();
    await screen.findByText('Nhân viên bán hàng');
    expect(screen.getByRole('link', { name: 'Xem' })).toHaveAttribute(
      'href',
      '/roles/a1b2c3d4-0000-0000-0000-000000000001',
    );
  });

  it('filters client-side by name or code as the user types', async () => {
    server.use(
      http.get(`${API_BASE_URL}/roles`, () =>
        HttpResponse.json(
          envelope([
            buildRole({ id: 'r1', code: 'sales_staff', name: 'Nhân viên bán hàng' }),
            buildRole({ id: 'r2', code: 'warehouse_staff', name: 'Nhân viên kho' }),
          ]),
        ),
      ),
    );

    renderTable();
    await screen.findByText('Nhân viên bán hàng');
    expect(screen.getByText('Nhân viên kho')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox'), 'kho');

    await waitFor(() => expect(screen.queryByText('Nhân viên bán hàng')).not.toBeInTheDocument());
    expect(screen.getByText('Nhân viên kho')).toBeInTheDocument();
  });

  it('renders the "nothing exists yet" empty state when no roles exist', async () => {
    server.use(http.get(`${API_BASE_URL}/roles`, () => HttpResponse.json(envelope([]))));

    renderTable();
    expect(await screen.findByText('Chưa có vai trò nào')).toBeInTheDocument();
  });

  it('renders the "no results" empty state when a search filter yields nothing', async () => {
    server.use(http.get(`${API_BASE_URL}/roles`, () => HttpResponse.json(envelope([buildRole()]))));

    renderTable();
    await screen.findByText('Nhân viên bán hàng');
    await userEvent.type(screen.getByRole('textbox'), 'không tồn tại');

    expect(await screen.findByText('Không có kết quả')).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/roles`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { success: false, code: 'HTTP_500', message: 'Đã xảy ra lỗi hệ thống', errors: [] },
            { status: 500 },
          );
        }
        return HttpResponse.json(envelope([buildRole()]));
      }),
    );

    renderTable();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Nhân viên bán hàng')).toBeInTheDocument();
  });

  it('renders skeleton rows while loading', () => {
    server.use(
      http.get(`${API_BASE_URL}/roles`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(envelope([]));
      }),
    );

    const { container } = renderTable();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(http.get(`${API_BASE_URL}/roles`, () => HttpResponse.json(envelope([buildRole()]))));

    const { container } = renderTable();
    await screen.findByText('Nhân viên bán hàng');
    expect(await axe(container)).toHaveNoViolations();
  });
});
