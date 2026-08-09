import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { CartPanel } from './cart-panel';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildCart(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        productId: 'prod-1',
        productName: 'Áo thun nam',
        quantity: '2',
        price: '150000',
        discount: '0',
        promotion: '0',
        voucher: '0',
        tax: '0',
        total: '300000',
      },
    ],
    subtotal: '300000',
    totalDiscount: '0',
    totalPromotion: '0',
    totalVoucher: '0',
    totalTax: '0',
    totalAmount: '300000',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function emptyCart() {
  return buildCart({
    items: [],
    subtotal: '0',
    totalAmount: '0',
  });
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/products`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'prod-1', name: 'Áo thun nam', sku: 'SP001' }]))),
    ),
  );
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CartPanel />
    </QueryClientProvider>,
  );
}

describe('CartPanel (T046 §4)', () => {
  beforeEach(async () => {
    stubRelationLists();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('renders the empty state when the cart has no items', async () => {
    server.use(http.get(`${API_BASE_URL}/cart`, () => HttpResponse.json(envelope(emptyCart()))));
    renderPanel();

    expect(await screen.findByText('Giỏ hàng đang trống')).toBeInTheDocument();
  });

  it('shows cart items and totals exactly as returned by the backend, with no client-side stock indicator', async () => {
    server.use(http.get(`${API_BASE_URL}/cart`, () => HttpResponse.json(envelope(buildCart()))));
    renderPanel();

    expect(await screen.findByText('Áo thun nam')).toBeInTheDocument();
    expect(screen.getAllByText('300000').length).toBeGreaterThan(0);
    expect(screen.queryByText(/còn hàng|còn lại|in stock/i)).not.toBeInTheDocument();
  });

  it('adding a selected product calls POST /cart/add with the chosen quantity', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${API_BASE_URL}/cart`, () => HttpResponse.json(envelope(emptyCart()))),
      http.post(`${API_BASE_URL}/cart/add`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildCart()), { status: 201 });
      }),
    );
    renderPanel();
    await screen.findByText('Giỏ hàng đang trống');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Sản phẩm' }));
    await user.click(await screen.findByRole('option', { name: 'Áo thun nam (SP001)' }));
    await user.click(screen.getByRole('button', { name: 'Thêm vào giỏ' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ productId: 'prod-1', quantity: 1 }));
  });

  it('the "+" button calls PATCH /cart/update with quantity+1 (absolute, not additive)', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${API_BASE_URL}/cart`, () => HttpResponse.json(envelope(buildCart()))),
      http.patch(`${API_BASE_URL}/cart/update`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildCart({ items: [] })));
      }),
    );
    renderPanel();
    await screen.findByText('Áo thun nam');

    await userEvent.click(screen.getByRole('button', { name: 'Tăng số lượng Áo thun nam' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ productId: 'prod-1', quantity: 3 }));
  });

  it('the "-" button is disabled at quantity 1 (cannot go below 1, use remove instead)', async () => {
    server.use(
      http.get(`${API_BASE_URL}/cart`, () =>
        HttpResponse.json(
          envelope(buildCart({ items: [{ ...buildCart().items[0], quantity: '1' }] })),
        ),
      ),
    );
    renderPanel();
    await screen.findByText('Áo thun nam');

    expect(screen.getByRole('button', { name: 'Giảm số lượng Áo thun nam' })).toBeDisabled();
  });

  it('removing a line calls DELETE /cart/remove with the product id', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${API_BASE_URL}/cart`, () => HttpResponse.json(envelope(buildCart()))),
      http.delete(`${API_BASE_URL}/cart/remove`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(emptyCart()));
      }),
    );
    renderPanel();
    await screen.findByText('Áo thun nam');

    await userEvent.click(screen.getByRole('button', { name: 'Xóa Áo thun nam khỏi giỏ' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ productId: 'prod-1' }));
  });

  it('barcode lookup resolves a scanned code to a product and adds it to the cart', async () => {
    let addBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${API_BASE_URL}/cart`, () => HttpResponse.json(envelope(emptyCart()))),
      http.get(`${API_BASE_URL}/barcodes`, () =>
        HttpResponse.json(
          envelope(paginated([{ id: 'bc-1', productId: 'prod-1', code: '8938505970024' }])),
        ),
      ),
      http.post(`${API_BASE_URL}/cart/add`, async ({ request }) => {
        addBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildCart()), { status: 201 });
      }),
    );
    renderPanel();
    await screen.findByText('Giỏ hàng đang trống');

    await userEvent.type(screen.getByLabelText('Quét / nhập mã vạch'), '8938505970024');
    await userEvent.click(screen.getByRole('button', { name: 'Tra cứu' }));

    await waitFor(() => expect(addBody).toMatchObject({ productId: 'prod-1', quantity: 1 }));
  });

  it('an unmatched barcode shows a clear error, without adding anything to the cart', async () => {
    let addCalled = false;
    server.use(
      http.get(`${API_BASE_URL}/cart`, () => HttpResponse.json(envelope(emptyCart()))),
      http.get(`${API_BASE_URL}/barcodes`, () => HttpResponse.json(envelope(paginated([])))),
      http.post(`${API_BASE_URL}/cart/add`, () => {
        addCalled = true;
        return HttpResponse.json(envelope(buildCart()), { status: 201 });
      }),
    );
    renderPanel();
    await screen.findByText('Giỏ hàng đang trống');

    await userEvent.type(screen.getByLabelText('Quét / nhập mã vạch'), '0000000000000');
    await userEvent.click(screen.getByRole('button', { name: 'Tra cứu' }));

    expect(await screen.findByText('Không tìm thấy mã vạch "0000000000000"')).toBeInTheDocument();
    expect(addCalled).toBe(false);
  });

  it('clearing the cart opens a confirm dialog and calls POST /cart/clear on confirm', async () => {
    let clearCalled = false;
    server.use(
      http.get(`${API_BASE_URL}/cart`, () => HttpResponse.json(envelope(buildCart()))),
      http.post(`${API_BASE_URL}/cart/clear`, () => {
        clearCalled = true;
        return HttpResponse.json(envelope(emptyCart()), { status: 201 });
      }),
    );
    renderPanel();
    await screen.findByText('Áo thun nam');

    await userEvent.click(screen.getByRole('button', { name: 'Xóa giỏ hàng' }));
    expect(screen.getByText('Xóa toàn bộ giỏ hàng?')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xóa giỏ hàng' }));

    await waitFor(() => expect(clearCalled).toBe(true));
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/cart`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { success: false, code: 'CART_500', message: 'Đã xảy ra lỗi hệ thống', errors: [] },
            { status: 500 },
          );
        }
        return HttpResponse.json(envelope(emptyCart()));
      }),
    );

    renderPanel();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Giỏ hàng đang trống')).toBeInTheDocument();
  });

  it('has no accessibility violations with items in the cart', async () => {
    server.use(http.get(`${API_BASE_URL}/cart`, () => HttpResponse.json(envelope(buildCart()))));
    const { container } = renderPanel();
    await screen.findByText('Áo thun nam');
    expect(await axe(container)).toHaveNoViolations();
  });
});
