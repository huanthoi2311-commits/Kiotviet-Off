import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { TransferTable } from './transfer-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tr-1',
    fromWarehouseId: 'wh-1',
    toWarehouseId: 'wh-2',
    code: 'DC0001',
    status: 'PENDING',
    note: null,
    items: [{ id: 'item-1', productId: 'prod-1', quantity: '10', unitCost: null }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () =>
      HttpResponse.json(
        envelope(
          paginated([
            { id: 'wh-1', name: 'Kho nguồn' },
            { id: 'wh-2', name: 'Kho đích' },
          ]),
        ),
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
      <TransferTable />
    </QueryClientProvider>,
  );
}

describe('TransferTable (T044 Phase L)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    stubRelationLists();
  });

  it('shows warehouse names (id→name lookup) and status for each row', async () => {
    server.use(
      http.get(`${API_BASE_URL}/transfers`, () =>
        HttpResponse.json(envelope(paginated([buildTransfer()]))),
      ),
    );
    renderTable();

    await screen.findByText('DC0001');
    const row = screen.getByRole('row', { name: /DC0001/ });
    expect(within(row).getByText('Kho nguồn')).toBeInTheDocument();
    expect(within(row).getByText('Kho đích')).toBeInTheDocument();
    expect(within(row).getByText('Chờ duyệt')).toBeInTheDocument();
  });

  it('hides the "Tạo phiếu điều chuyển" button for a user without transfer:create', async () => {
    server.use(
      http.get(`${API_BASE_URL}/transfers`, () => HttpResponse.json(envelope(paginated([])))),
    );
    renderTable();
    await screen.findByText('Chưa có phiếu điều chuyển nào');
    expect(screen.queryByRole('link', { name: 'Tạo phiếu điều chuyển' })).not.toBeInTheDocument();
  });

  it('shows the "Tạo phiếu điều chuyển" button for a user with transfer:create', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['transfer:create'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/transfers`, () => HttpResponse.json(envelope(paginated([])))),
    );
    renderTable();
    expect(await screen.findByRole('link', { name: 'Tạo phiếu điều chuyển' })).toHaveAttribute(
      'href',
      '/transfers/new',
    );
  });

  it('re-fetches with the selected status filter', async () => {
    let lastStatus: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/transfers`, ({ request }) => {
        lastStatus = new URL(request.url).searchParams.get('status');
        return HttpResponse.json(envelope(paginated([buildTransfer()])));
      }),
    );

    renderTable();
    await screen.findByText('DC0001');
    expect(lastStatus).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Đã duyệt' }));

    await waitFor(() => expect(lastStatus).toBe('APPROVED'));
  });

  it('renders the empty state when no transfers exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/transfers`, () => HttpResponse.json(envelope(paginated([])))),
    );
    renderTable();
    expect(await screen.findByText('Chưa có phiếu điều chuyển nào')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/transfers`, () =>
        HttpResponse.json(envelope(paginated([buildTransfer()]))),
      ),
    );
    const { container } = renderTable();
    await screen.findByText('DC0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
