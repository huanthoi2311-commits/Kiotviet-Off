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
import { StockCountDetail } from './stock-count-detail';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const STOCK_COUNT_ID = 'sc-1';

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

function buildStockCount(overrides: Record<string, unknown> = {}) {
  return {
    id: STOCK_COUNT_ID,
    warehouseId: 'wh-1',
    code: 'KK0001',
    status: 'DRAFT',
    note: null,
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        systemQty: '100',
        actualQty: null,
        difference: null,
        remark: null,
      },
    ],
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
      <StockCountDetail id={STOCK_COUNT_ID} />
    </QueryClientProvider>,
  );
}

describe('StockCountDetail (T044 Phase N)', () => {
  beforeEach(async () => {
    stubRelationLists();
    useAuthStore.getState().clear();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the "not found" empty state for STOCK_COUNT_001', async () => {
    server.use(
      http.get(`${API_BASE_URL}/stock-count/${STOCK_COUNT_ID}`, () =>
        HttpResponse.json(errorEnvelope('STOCK_COUNT_001', 'Không tìm thấy phiếu kiểm kê'), {
          status: 404,
        }),
      ),
    );
    renderDetail();
    expect(await screen.findByText('Không tìm thấy phiếu kiểm kê')).toBeInTheDocument();
  });

  it('DRAFT status shows a read-only items table and a "Bắt đầu kiểm kê" button', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['stock_count:start'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/stock-count/${STOCK_COUNT_ID}`, () =>
        HttpResponse.json(envelope(buildStockCount({ status: 'DRAFT' }))),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Bắt đầu kiểm kê' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tất kiểm kê' })).not.toBeInTheDocument();
  });

  it('clicking "Bắt đầu kiểm kê" opens a confirm dialog and calls PATCH .../start on confirm', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['stock_count:start'],
    });
    useAuthStore.getState().setAccessToken(token);
    let startCalled = false;
    server.use(
      http.get(`${API_BASE_URL}/stock-count/${STOCK_COUNT_ID}`, () =>
        HttpResponse.json(envelope(buildStockCount({ status: 'DRAFT' }))),
      ),
      http.patch(`${API_BASE_URL}/stock-count/${STOCK_COUNT_ID}/start`, () => {
        startCalled = true;
        return HttpResponse.json(envelope(buildStockCount({ status: 'COUNTING' })));
      }),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Bắt đầu kiểm kê' }));
    expect(screen.getByText('Bắt đầu kiểm kê?')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bắt đầu' }));

    await waitFor(() => expect(startCalled).toBe(true));
  });

  it('COUNTING status renders the real per-row Complete form with a blank actualQty (not pre-filled with systemQty)', async () => {
    server.use(
      http.get(`${API_BASE_URL}/stock-count/${STOCK_COUNT_ID}`, () =>
        HttpResponse.json(envelope(buildStockCount({ status: 'COUNTING' }))),
      ),
    );
    renderDetail();

    await screen.findByRole('button', { name: 'Hoàn tất kiểm kê' });
    expect(screen.getByText('100')).toBeInTheDocument();
    const actualQtyInput = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(actualQtyInput.value).toBe('0');
  });

  it('submits the Complete payload with itemId/actualQty and shows a success toast', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${API_BASE_URL}/stock-count/${STOCK_COUNT_ID}`, () =>
        HttpResponse.json(envelope(buildStockCount({ status: 'COUNTING' }))),
      ),
      http.patch(`${API_BASE_URL}/stock-count/${STOCK_COUNT_ID}/complete`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildStockCount({ status: 'COMPLETED' })));
      }),
    );
    renderDetail();

    await screen.findByRole('button', { name: 'Hoàn tất kiểm kê' });
    const user = userEvent.setup();
    const actualQtyInput = screen.getByRole('spinbutton');
    await user.clear(actualQtyInput);
    await user.type(actualQtyInput, '95');
    await user.click(screen.getByRole('button', { name: 'Hoàn tất kiểm kê' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({ items: [{ itemId: 'item-1', actualQty: 95 }] }),
    );
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã hoàn tất kiểm kê'));
  });

  it('COMPLETED status shows the read-only items table with actual/difference columns, no action buttons', async () => {
    server.use(
      http.get(`${API_BASE_URL}/stock-count/${STOCK_COUNT_ID}`, () =>
        HttpResponse.json(
          envelope(
            buildStockCount({
              status: 'COMPLETED',
              items: [
                {
                  id: 'item-1',
                  productId: 'prod-1',
                  systemQty: '100',
                  actualQty: '95',
                  difference: '-5',
                  remark: null,
                },
              ],
            }),
          ),
        ),
      ),
    );
    renderDetail();

    await screen.findByText('KK0001');
    expect(screen.getByText('95')).toBeInTheDocument();
    expect(screen.getByText('-5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bắt đầu kiểm kê' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tất kiểm kê' })).not.toBeInTheDocument();
  });

  it('has no accessibility violations in DRAFT state', async () => {
    server.use(
      http.get(`${API_BASE_URL}/stock-count/${STOCK_COUNT_ID}`, () =>
        HttpResponse.json(envelope(buildStockCount({ status: 'DRAFT' }))),
      ),
    );
    const { container } = renderDetail();
    await screen.findByText('KK0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
