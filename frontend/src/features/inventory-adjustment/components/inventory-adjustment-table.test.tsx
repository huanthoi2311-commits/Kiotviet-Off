import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { InventoryAdjustmentTable } from './inventory-adjustment-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildAdjustment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'adj-1',
    warehouseId: 'wh-1',
    code: 'DC0001',
    status: 'DRAFT',
    reason: 'LOST',
    note: null,
    items: [{ id: 'item-1', productId: 'prod-1', quantity: '-5', remark: null }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'wh-1', name: 'Kho trung tâm' }]))),
    ),
  );
}

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InventoryAdjustmentTable />
    </QueryClientProvider>,
  );
}

describe('InventoryAdjustmentTable (T044 Phase M)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    stubRelationLists();
  });

  it('shows warehouse name, reason, and status for each row', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments`, () =>
        HttpResponse.json(envelope(paginated([buildAdjustment()]))),
      ),
    );
    renderTable();

    await screen.findByText('DC0001');
    const row = screen.getByRole('row', { name: /DC0001/ });
    expect(within(row).getByText('Kho trung tâm')).toBeInTheDocument();
    expect(within(row).getByText('Thất lạc')).toBeInTheDocument();
    expect(within(row).getByText('Nháp')).toBeInTheDocument();
  });

  it('hides "Tạo phiếu điều chỉnh" for a user without inventory:adjust', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments`, () =>
        HttpResponse.json(envelope(paginated([]))),
      ),
    );
    renderTable();
    await screen.findByText('Chưa có phiếu điều chỉnh nào');
    expect(screen.queryByRole('link', { name: 'Tạo phiếu điều chỉnh' })).not.toBeInTheDocument();
  });

  it('shows "Tạo phiếu điều chỉnh" for a user with inventory:adjust', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['inventory:adjust'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments`, () =>
        HttpResponse.json(envelope(paginated([]))),
      ),
    );
    renderTable();
    expect(await screen.findByRole('link', { name: 'Tạo phiếu điều chỉnh' })).toHaveAttribute(
      'href',
      '/inventory-adjustments/new',
    );
  });

  it('re-fetches with the selected reason filter', async () => {
    let lastReason: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments`, ({ request }) => {
        lastReason = new URL(request.url).searchParams.get('reason');
        return HttpResponse.json(envelope(paginated([buildAdjustment()])));
      }),
    );

    renderTable();
    await screen.findByText('DC0001');
    expect(lastReason).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo lý do' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Hư hỏng' }));

    await waitFor(() => expect(lastReason).toBe('DAMAGED'));
  });

  it('renders the empty state when no adjustments exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments`, () =>
        HttpResponse.json(envelope(paginated([]))),
      ),
    );
    renderTable();
    expect(await screen.findByText('Chưa có phiếu điều chỉnh nào')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments`, () =>
        HttpResponse.json(envelope(paginated([buildAdjustment()]))),
      ),
    );
    const { container } = renderTable();
    await screen.findByText('DC0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
