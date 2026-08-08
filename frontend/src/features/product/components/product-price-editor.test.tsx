import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { ProductPriceEditor } from './product-price-editor';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const PRODUCT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

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

function buildPriceSet(overrides: Record<string, unknown> = {}) {
  return {
    productId: PRODUCT_ID,
    priceVersion: 1,
    prices: [{ id: 'price-1', type: 'RETAIL', price: '150000' }],
    ...overrides,
  };
}

function mockFindSet(priceSet = buildPriceSet()) {
  server.use(
    http.get(`${API_BASE_URL}/products/${PRODUCT_ID}/prices`, () =>
      HttpResponse.json(envelope(priceSet)),
    ),
  );
}

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductPriceEditor productId={PRODUCT_ID} />
    </QueryClientProvider>,
  );
}

function grantUpdate() {
  const token = buildAccessToken({
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: ['product:update'],
  });
  useAuthStore.getState().setAccessToken(token);
}

describe('ProductPriceEditor (T043 Phase I, T043.07 contract)', () => {
  beforeEach(async () => {
    useAuthStore.getState().clear();
    mockFindSet();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('loads and displays the current price set', async () => {
    grantUpdate();
    renderEditor();
    expect(await screen.findByDisplayValue('150000')).toBeInTheDocument();
  });

  describe('read-only mode (product:update not granted)', () => {
    it('renders the price list without any editable controls', async () => {
      renderEditor();
      expect(await screen.findByText('150000')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Lưu bảng giá' })).not.toBeInTheDocument();
    });
  });

  describe('editable mode (product:update granted)', () => {
    beforeEach(() => grantUpdate());

    it('saves using ONLY priceVersion (never Product.version), bulk-replacing the full set', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      server.use(
        http.patch(`${API_BASE_URL}/products/${PRODUCT_ID}/prices`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(
            envelope(
              buildPriceSet({
                priceVersion: 2,
                prices: [{ id: 'price-1', type: 'RETAIL', price: '160000' }],
              }),
            ),
          );
        }),
      );

      renderEditor();
      const priceInput = await screen.findByDisplayValue('150000');
      await userEvent.clear(priceInput);
      await userEvent.type(priceInput, '160000');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu bảng giá' }));

      await waitFor(() =>
        expect(capturedBody).toMatchObject({
          priceVersion: 1,
          prices: [{ type: 'RETAIL', price: 160000 }],
        }),
      );
      expect(capturedBody?.version).toBeUndefined();
      expect(await screen.findByDisplayValue('160000')).toBeInTheDocument();
    });

    it('adding a second price row and saving sends both rows in one bulk-replace call', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      server.use(
        http.patch(`${API_BASE_URL}/products/${PRODUCT_ID}/prices`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(
            envelope(
              buildPriceSet({
                priceVersion: 2,
                prices: [
                  { id: 'price-1', type: 'RETAIL', price: '150000' },
                  { id: 'price-2', type: 'WHOLESALE', price: '120000' },
                ],
              }),
            ),
          );
        }),
      );

      renderEditor();
      await screen.findByDisplayValue('150000');
      await userEvent.click(screen.getByRole('button', { name: 'Thêm mức giá' }));

      const priceInputs = screen.getAllByRole('spinbutton');
      await userEvent.type(priceInputs[priceInputs.length - 1], '120000');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu bảng giá' }));

      await waitFor(() => expect(capturedBody?.prices).toHaveLength(2));
    });

    it('client-side rejects removing the only RETAIL row before ever calling the API', async () => {
      let patchCalled = false;
      server.use(
        http.patch(`${API_BASE_URL}/products/${PRODUCT_ID}/prices`, () => {
          patchCalled = true;
          return HttpResponse.json(envelope(buildPriceSet()));
        }),
      );

      renderEditor();
      await screen.findByDisplayValue('150000');

      await userEvent.click(screen.getByRole('button', { name: 'Xóa mức giá này' }));
      await userEvent.click(screen.getByRole('button', { name: 'Lưu bảng giá' }));

      expect(await screen.findByText('Phải có ít nhất 1 mức giá')).toBeInTheDocument();
      expect(patchCalled).toBe(false);
    });

    it('PRODUCT_PRICE_001 (stale priceVersion) shows a conflict alert with a Reload button, preserves in-progress edits until reload', async () => {
      const { toast } = await import('sonner');
      let findSetCallCount = 0;
      server.use(
        http.get(`${API_BASE_URL}/products/${PRODUCT_ID}/prices`, () => {
          findSetCallCount += 1;
          return HttpResponse.json(envelope(buildPriceSet({ priceVersion: findSetCallCount })));
        }),
        http.patch(`${API_BASE_URL}/products/${PRODUCT_ID}/prices`, () =>
          HttpResponse.json(
            errorEnvelope(
              'PRODUCT_PRICE_001',
              'Bảng giá sản phẩm vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại',
            ),
            { status: 409 },
          ),
        ),
      );

      renderEditor();
      const priceInput = await screen.findByDisplayValue('150000');
      const callsAfterMount = findSetCallCount;

      await userEvent.clear(priceInput);
      await userEvent.type(priceInput, '999000');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu bảng giá' }));

      expect(
        await screen.findByText(
          'Bảng giá sản phẩm vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại',
        ),
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue('999000')).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
      await waitFor(() => expect(findSetCallCount).toBeGreaterThan(callsAfterMount));
    });

    it('has no accessibility violations', async () => {
      const { container } = renderEditor();
      await screen.findByDisplayValue('150000');
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
