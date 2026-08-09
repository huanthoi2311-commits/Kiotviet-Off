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
import { InventoryAdjustmentDetail } from './inventory-adjustment-detail';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const ADJUSTMENT_ID = 'adj-1';

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

function buildAdjustment(overrides: Record<string, unknown> = {}) {
  return {
    id: ADJUSTMENT_ID,
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
    http.get(`${API_BASE_URL}/products`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'prod-1', name: 'Áo thun nam', sku: 'SP001' }]))),
    ),
  );
}

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InventoryAdjustmentDetail id={ADJUSTMENT_ID} />
    </QueryClientProvider>,
  );
}

describe('InventoryAdjustmentDetail (T044 Phase M)', () => {
  beforeEach(async () => {
    stubRelationLists();
    useAuthStore.getState().clear();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the "not found" empty state for INVENTORY_ADJUSTMENT_001', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments/${ADJUSTMENT_ID}`, () =>
        HttpResponse.json(
          errorEnvelope('INVENTORY_ADJUSTMENT_001', 'Không tìm thấy phiếu điều chỉnh'),
          { status: 404 },
        ),
      ),
    );
    renderDetail();
    expect(await screen.findByText('Không tìm thấy phiếu điều chỉnh')).toBeInTheDocument();
  });

  it('shows the signed quantity delta for each item', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments/${ADJUSTMENT_ID}`, () =>
        HttpResponse.json(envelope(buildAdjustment())),
      ),
    );
    renderDetail();

    expect(await screen.findByText('-5')).toBeInTheDocument();
  });

  it('DRAFT status shows only "Gửi duyệt", given inventory:adjust', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['inventory:adjust', 'inventory:approve', 'inventory:complete'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments/${ADJUSTMENT_ID}`, () =>
        HttpResponse.json(envelope(buildAdjustment({ status: 'DRAFT' }))),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Gửi duyệt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tất' })).not.toBeInTheDocument();
  });

  it('SUBMITTED status shows only "Duyệt"', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['inventory:adjust', 'inventory:approve', 'inventory:complete'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments/${ADJUSTMENT_ID}`, () =>
        HttpResponse.json(envelope(buildAdjustment({ status: 'SUBMITTED' }))),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Duyệt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).not.toBeInTheDocument();
  });

  it('APPROVED status shows only "Hoàn tất"', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['inventory:adjust', 'inventory:approve', 'inventory:complete'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments/${ADJUSTMENT_ID}`, () =>
        HttpResponse.json(envelope(buildAdjustment({ status: 'APPROVED' }))),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Hoàn tất' })).toBeInTheDocument();
  });

  it('COMPLETED status shows no action buttons', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments/${ADJUSTMENT_ID}`, () =>
        HttpResponse.json(envelope(buildAdjustment({ status: 'COMPLETED' }))),
      ),
    );
    renderDetail();

    await screen.findByText('DC0001');
    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tất' })).not.toBeInTheDocument();
  });

  it('clicking "Gửi duyệt" opens the confirm dialog and calls PATCH .../submit on confirm', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['inventory:adjust'],
    });
    useAuthStore.getState().setAccessToken(token);
    let submitCalled = false;
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments/${ADJUSTMENT_ID}`, () =>
        HttpResponse.json(envelope(buildAdjustment({ status: 'DRAFT' }))),
      ),
      http.patch(`${API_BASE_URL}/inventory-adjustments/${ADJUSTMENT_ID}/submit`, () => {
        submitCalled = true;
        return HttpResponse.json(envelope(buildAdjustment({ status: 'SUBMITTED' })));
      }),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Gửi duyệt' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi duyệt' }));

    await waitFor(() => expect(submitCalled).toBe(true));
  });

  it('has no accessibility violations once loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory-adjustments/${ADJUSTMENT_ID}`, () =>
        HttpResponse.json(envelope(buildAdjustment({ status: 'DRAFT' }))),
      ),
    );
    const { container } = renderDetail();
    await screen.findByText('DC0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
