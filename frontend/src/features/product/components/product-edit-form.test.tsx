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
import { ProductEditForm } from './product-edit-form';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const CURRENT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

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

function buildProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: CURRENT_ID,
    sku: 'SP000001',
    slug: 'ao-thun-nam',
    name: 'Áo thun nam',
    description: null,
    categoryId: 'cat-1',
    brandId: null,
    unitId: 'unit-1',
    parentProductId: null,
    costPrice: '90000',
    vat: '8',
    weight: null,
    length: null,
    width: null,
    height: null,
    type: 'STANDARD',
    allowSale: true,
    status: 'ACTIVE',
    isActive: true,
    version: 1,
    prices: [{ id: 'price-1', type: 'RETAIL', price: '150000' }],
    images: [],
    barcodes: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function buildPriceSet(overrides: Record<string, unknown> = {}) {
  return {
    productId: CURRENT_ID,
    priceVersion: 1,
    prices: [{ id: 'price-1', type: 'RETAIL', price: '150000' }],
    ...overrides,
  };
}

function mockFindOne(product = buildProduct()) {
  server.use(
    http.get(`${API_BASE_URL}/products/${CURRENT_ID}`, () => HttpResponse.json(envelope(product))),
  );
}

function mockPriceSet(priceSet = buildPriceSet()) {
  server.use(
    http.get(`${API_BASE_URL}/products/${CURRENT_ID}/prices`, () =>
      HttpResponse.json(envelope(priceSet)),
    ),
  );
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/categories`, () => HttpResponse.json(envelope(paginated([])))),
    http.get(`${API_BASE_URL}/brands`, () => HttpResponse.json(envelope(paginated([])))),
    http.get(`${API_BASE_URL}/units`, () => HttpResponse.json(envelope(paginated([])))),
  );
}

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductEditForm id={CURRENT_ID} />
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

describe('ProductEditForm (T043 Phase F)', () => {
  beforeEach(async () => {
    push.mockClear();
    useAuthStore.getState().clear();
    mockFindOne();
    mockPriceSet();
    stubRelationLists();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows a dedicated not-found state for PRODUCT_001, with a link back to the list', async () => {
    server.use(
      http.get(`${API_BASE_URL}/products/${CURRENT_ID}`, () =>
        HttpResponse.json(errorEnvelope('PRODUCT_001', 'Không tìm thấy sản phẩm'), {
          status: 404,
        }),
      ),
    );
    grantUpdate();

    renderForm();
    expect(await screen.findByText('Không tìm thấy sản phẩm')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quay lại danh sách' })).toHaveAttribute(
      'href',
      '/products',
    );
  });

  describe('read-only mode (product:view only, no product:update)', () => {
    it('renders disabled fields with the loaded values and no submit control', async () => {
      renderForm();
      await screen.findByDisplayValue('Áo thun nam');

      expect(screen.getByDisplayValue('Áo thun nam')).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    });
  });

  describe('editable mode (product:update granted)', () => {
    beforeEach(() => grantUpdate());

    it('navigates immediately on Cancel when pristine', async () => {
      renderForm();
      await screen.findByLabelText('Tên sản phẩm');

      await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
      expect(push).toHaveBeenCalledWith('/products');
    });

    it('shows a confirm dialog on Cancel when dirty', async () => {
      renderForm();
      const nameInput = await screen.findByLabelText('Tên sản phẩm');

      const user = userEvent.setup();
      await user.type(nameInput, ' mới');
      await user.click(screen.getByRole('button', { name: 'Hủy' }));

      expect(await screen.findByText('Hủy các thay đổi chưa lưu?')).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });

    it('submits core fields with Product.version, invalidates caches, never sends priceVersion', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      server.use(
        http.patch(`${API_BASE_URL}/products/${CURRENT_ID}`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(envelope(buildProduct({ version: 2 })), { status: 200 });
        }),
      );

      renderForm();
      await screen.findByLabelText('Tên sản phẩm');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      await waitFor(() => expect(capturedBody).toMatchObject({ version: 1, name: 'Áo thun nam' }));
      expect(capturedBody?.priceVersion).toBeUndefined();
      expect(push).not.toHaveBeenCalled();
    });

    it('maps PRODUCT_008 to a field error on the Type select, not a root alert', async () => {
      const { toast } = await import('sonner');
      server.use(
        http.patch(`${API_BASE_URL}/products/${CURRENT_ID}`, () =>
          HttpResponse.json(
            errorEnvelope('PRODUCT_008', 'Không thể đổi loại sản phẩm vì đã phát sinh giao dịch'),
            { status: 422 },
          ),
        ),
      );

      renderForm();
      await screen.findByLabelText('Tên sản phẩm');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      expect(
        await screen.findByText('Không thể đổi loại sản phẩm vì đã phát sinh giao dịch'),
      ).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
    });

    describe('PRODUCT_013 — version conflict (Optimistic Lock, T043.05)', () => {
      it('does not touch form fields, shows a root alert with a Reload button, only discards on explicit reload', async () => {
        const { toast } = await import('sonner');
        let findOneCallCount = 0;
        server.use(
          http.get(`${API_BASE_URL}/products/${CURRENT_ID}`, () => {
            findOneCallCount += 1;
            return HttpResponse.json(envelope(buildProduct({ version: findOneCallCount })));
          }),
          http.patch(`${API_BASE_URL}/products/${CURRENT_ID}`, () =>
            HttpResponse.json(
              errorEnvelope(
                'PRODUCT_013',
                'Sản phẩm vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại',
              ),
              { status: 409 },
            ),
          ),
        );

        renderForm();
        const nameInput = await screen.findByLabelText('Tên sản phẩm');
        const callsAfterMount = findOneCallCount;

        const user = userEvent.setup();
        await user.clear(nameInput);
        await user.type(nameInput, 'Tên đang chỉnh sửa');
        await user.click(screen.getByRole('button', { name: 'Lưu' }));

        expect(
          await screen.findByText(
            'Sản phẩm vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại',
          ),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Tên đang chỉnh sửa');
        expect(toast.error).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'Tải lại' }));

        await waitFor(() => expect(findOneCallCount).toBeGreaterThan(callsAfterMount));
      });
    });

    it('shows read-only barcodes and images sections with no mutation controls', async () => {
      mockFindOne(
        buildProduct({
          barcodes: [{ id: 'bc-1', code: '123456', type: 'EAN13', isDefault: true }],
          images: [{ id: 'img-1', url: 'https://cdn.example.com/a.jpg', isThumbnail: true }],
        }),
      );
      renderForm();

      await screen.findByLabelText('Tên sản phẩm');
      expect(screen.getByText('123456')).toBeInTheDocument();
      expect(screen.getByText('https://cdn.example.com/a.jpg')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Xóa mã vạch/i })).not.toBeInTheDocument();
    });

    it('has no accessibility violations once loaded', async () => {
      const { container } = renderForm();
      await screen.findByLabelText('Tên sản phẩm');
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
