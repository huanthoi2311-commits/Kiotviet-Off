import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { RoleDetail } from './role-detail';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const ROLE_ID = 'role-1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildRole(overrides: Record<string, unknown> = {}) {
  return {
    id: ROLE_ID,
    organizationId: 'org-1',
    code: 'sales_staff',
    name: 'Nhân viên bán hàng',
    isSystem: false,
    description: 'Vai trò bán hàng',
    permissionCodes: ['product:view'],
    ...overrides,
  };
}

const PERMISSIONS = [
  { id: 'p1', code: 'product:view', group: 'product', description: 'Xem sản phẩm' },
];

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RoleDetail id={ROLE_ID} />
    </QueryClientProvider>,
  );
}

describe('RoleDetail (T052.03C §5)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('renders role metadata and the permission matrix once loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/roles/${ROLE_ID}`, () => HttpResponse.json(envelope(buildRole()))),
      http.get(`${API_BASE_URL}/permissions`, () => HttpResponse.json(envelope(PERMISSIONS))),
    );

    renderDetail();

    expect(await screen.findByText('Nhân viên bán hàng')).toBeInTheDocument();
    expect(screen.getByText('sales_staff')).toBeInTheDocument();
    expect(screen.getByText('Vai trò bán hàng')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /product:view/ })).toBeChecked();
  });

  it('shows the "Hệ thống" badge for isSystem roles', async () => {
    server.use(
      http.get(`${API_BASE_URL}/roles/${ROLE_ID}`, () =>
        HttpResponse.json(envelope(buildRole({ isSystem: true }))),
      ),
      http.get(`${API_BASE_URL}/permissions`, () => HttpResponse.json(envelope(PERMISSIONS))),
    );

    renderDetail();
    expect(await screen.findByText('Hệ thống')).toBeInTheDocument();
  });

  it('renders a dedicated not-found empty state for RBAC_001', async () => {
    server.use(
      http.get(`${API_BASE_URL}/roles/${ROLE_ID}`, () =>
        HttpResponse.json(
          { success: false, code: 'RBAC_001', message: 'Không tìm thấy vai trò', errors: [] },
          { status: 404 },
        ),
      ),
      http.get(`${API_BASE_URL}/permissions`, () => HttpResponse.json(envelope(PERMISSIONS))),
    );

    renderDetail();
    expect(await screen.findByText('Không tìm thấy vai trò')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quay lại danh sách' })).toHaveAttribute(
      'href',
      '/roles',
    );
  });

  it('renders a generic error + retry for any other role-detail error', async () => {
    server.use(
      http.get(`${API_BASE_URL}/roles/${ROLE_ID}`, () =>
        HttpResponse.json(
          { success: false, code: 'HTTP_500', message: 'Đã xảy ra lỗi hệ thống', errors: [] },
          { status: 500 },
        ),
      ),
      http.get(`${API_BASE_URL}/permissions`, () => HttpResponse.json(envelope(PERMISSIONS))),
    );

    renderDetail();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('still renders role metadata with a retry affordance when the permission catalog fails to load (e.g. missing permission:view)', async () => {
    server.use(
      http.get(`${API_BASE_URL}/roles/${ROLE_ID}`, () => HttpResponse.json(envelope(buildRole()))),
      http.get(`${API_BASE_URL}/permissions`, () =>
        HttpResponse.json(
          { success: false, code: 'RBAC_004', message: 'Thiếu quyền: permission:view', errors: [] },
          { status: 403 },
        ),
      ),
    );

    renderDetail();
    expect(await screen.findByText('Nhân viên bán hàng')).toBeInTheDocument();
    expect(screen.getByText('Thiếu quyền: permission:view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('read-only when the user lacks role:update — checkboxes disabled, no Save button', async () => {
    server.use(
      http.get(`${API_BASE_URL}/roles/${ROLE_ID}`, () => HttpResponse.json(envelope(buildRole()))),
      http.get(`${API_BASE_URL}/permissions`, () => HttpResponse.json(envelope(PERMISSIONS))),
    );

    renderDetail();
    await screen.findByText('Nhân viên bán hàng');

    expect(screen.getByRole('checkbox', { name: /product:view/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Lưu quyền' })).not.toBeInTheDocument();
  });

  it('editable when the user holds role:update — Save button present', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['role:update'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/roles/${ROLE_ID}`, () => HttpResponse.json(envelope(buildRole()))),
      http.get(`${API_BASE_URL}/permissions`, () => HttpResponse.json(envelope(PERMISSIONS))),
    );

    renderDetail();
    expect(await screen.findByRole('button', { name: 'Lưu quyền' })).toBeInTheDocument();
  });

  it('has no accessibility violations once loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/roles/${ROLE_ID}`, () => HttpResponse.json(envelope(buildRole()))),
      http.get(`${API_BASE_URL}/permissions`, () => HttpResponse.json(envelope(PERMISSIONS))),
    );

    const { container } = renderDetail();
    await screen.findByText('Nhân viên bán hàng');
    expect(await axe(container)).toHaveNoViolations();
  });
});
