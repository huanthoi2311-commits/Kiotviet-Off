import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { WarehouseTable } from './warehouse-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildWarehouse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wh-1',
    branchId: 'branch-1',
    managerId: null,
    code: 'KHO01',
    name: 'Kho trung tâm',
    type: 'MAIN',
    address: null,
    phone: null,
    email: null,
    description: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/branches`, () =>
      HttpResponse.json(
        envelope(paginated([{ id: 'branch-1', name: 'Chi nhánh 1', code: 'CN1' }])),
      ),
    ),
  );
}

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WarehouseTable />
    </QueryClientProvider>,
  );
}

describe('WarehouseTable (T044 Phase F/J)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    stubRelationLists();
  });

  it('shows a "Sửa" link for a user with warehouse:update, pointing at /warehouses/:id', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['warehouse:update'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () =>
        HttpResponse.json(envelope(paginated([buildWarehouse()]))),
      ),
    );

    renderTable();
    await screen.findByText('Kho trung tâm');

    expect(screen.getByRole('link', { name: 'Sửa' })).toHaveAttribute('href', '/warehouses/wh-1');
  });

  it('hides "Sửa"/"Xóa" for a user with no warehouse permissions', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () =>
        HttpResponse.json(envelope(paginated([buildWarehouse()]))),
      ),
    );

    renderTable();
    await screen.findByText('Kho trung tâm');

    expect(screen.queryByRole('link', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa' })).not.toBeInTheDocument();
  });

  it('archived rows show only "Khôi phục", even with warehouse:update/warehouse:delete', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['warehouse:update', 'warehouse:delete', 'warehouse:restore'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, ({ request }) => {
        const url = new URL(request.url);
        const archived = url.searchParams.get('archived') === 'true';
        return HttpResponse.json(envelope(paginated(archived ? [buildWarehouse()] : [])));
      }),
    );

    renderTable();
    await waitFor(() => expect(screen.getByText('Chưa có kho nào')).toBeInTheDocument());

    await userEvent.click(screen.getByLabelText('Hiển thị đã xóa'));

    await screen.findByText('Kho trung tâm');
    expect(screen.queryByRole('link', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khôi phục' })).toBeInTheDocument();
  });

  it('re-fetches with archived=true only after the checkbox is checked (T044.05)', async () => {
    let lastArchivedParam: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, ({ request }) => {
        lastArchivedParam = new URL(request.url).searchParams.get('archived');
        return HttpResponse.json(envelope(paginated([buildWarehouse()])));
      }),
    );

    renderTable();
    await screen.findByText('Kho trung tâm');
    expect(lastArchivedParam).toBe('false');

    await userEvent.click(screen.getByLabelText('Hiển thị đã xóa'));

    await waitFor(() => expect(lastArchivedParam).toBe('true'));
  });

  it('clicking "Xóa" opens the archive confirmation dialog for that row\'s warehouse', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['warehouse:delete'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () =>
        HttpResponse.json(envelope(paginated([buildWarehouse()]))),
      ),
    );

    renderTable();
    await screen.findByText('Kho trung tâm');

    await userEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    expect(screen.getByText('Xóa kho?')).toBeInTheDocument();
    expect(screen.getByText(/"Kho trung tâm"/)).toBeInTheDocument();
  });

  it('renders the empty state when no warehouses exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(envelope(paginated([])))),
    );

    renderTable();
    expect(await screen.findByText('Chưa có kho nào')).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            {
              success: false,
              code: 'WAREHOUSE_500',
              message: 'Đã xảy ra lỗi hệ thống',
              errors: [],
            },
            { status: 500 },
          );
        }
        return HttpResponse.json(envelope(paginated([buildWarehouse()])));
      }),
    );

    renderTable();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Kho trung tâm')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouses`, () =>
        HttpResponse.json(envelope(paginated([buildWarehouse()]))),
      ),
    );

    const { container } = renderTable();
    await screen.findByText('Kho trung tâm');
    expect(await axe(container)).toHaveNoViolations();
  });
});
