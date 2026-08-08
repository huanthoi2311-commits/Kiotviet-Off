import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { ProductCreateForm } from './product-form';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'new-1',
    sku: 'SP000001',
    slug: 'ao-thun-nam',
    name: 'Áo thun nam',
    description: null,
    categoryId: 'cat-1',
    brandId: null,
    unitId: 'unit-1',
    parentProductId: null,
    costPrice: '90000',
    vat: null,
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

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/categories`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'cat-1', name: 'Áo', code: 'AO', slug: 'ao' }]))),
    ),
    http.get(`${API_BASE_URL}/brands`, () => HttpResponse.json(envelope(paginated([])))),
    http.get(`${API_BASE_URL}/units`, () =>
      HttpResponse.json(
        envelope(paginated([{ id: 'unit-1', code: 'CAI', name: 'Cái', symbol: 'cái' }])),
      ),
    ),
  );
}

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductCreateForm />
    </QueryClientProvider>,
  );
}

async function fillRequiredFields() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Tên sản phẩm'), 'Áo thun nam');
  await user.type(screen.getByLabelText('Giá vốn'), '90000');

  await user.click(screen.getByRole('combobox', { name: 'Danh mục' }));
  await user.click(await screen.findByRole('option', { name: 'Áo' }));

  await user.click(screen.getByRole('combobox', { name: 'Đơn vị tính' }));
  await user.click(await screen.findByRole('option', { name: 'Cái' }));

  // Default price row (`prices[0]`) is pre-filled `type=RETAIL`; only the price value is empty.
  const priceInputs = screen.getAllByRole('spinbutton');
  await user.type(priceInputs[priceInputs.length - 1], '150000');
}

describe('ProductCreateForm (T043 Phase E)', () => {
  beforeEach(async () => {
    push.mockClear();
    stubRelationLists();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('renders core required fields with accessible labels', async () => {
    renderForm();
    await screen.findByLabelText('Tên sản phẩm');

    expect(screen.getByLabelText('Tên sản phẩm')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Danh mục' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Đơn vị tính' })).toBeInTheDocument();
    expect(screen.getByLabelText('Giá vốn')).toBeInTheDocument();
  });

  it('the Variant Parent picker only appears when type=VARIANT_CHILD', async () => {
    renderForm();
    await screen.findByLabelText('Tên sản phẩm');
    expect(screen.queryByLabelText('Sản phẩm cha (Variant Parent)')).not.toBeInTheDocument();

    server.use(
      http.get(`${API_BASE_URL}/products`, () => HttpResponse.json(envelope(paginated([])))),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Loại sản phẩm' }));
    await user.click(await screen.findByRole('option', { name: 'Biến thể (Variant Child)' }));

    expect(await screen.findByLabelText('Sản phẩm cha (Variant Parent)')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Loại sản phẩm' }));
    await user.click(await screen.findByRole('option', { name: 'Sản phẩm thường' }));

    expect(screen.queryByLabelText('Sản phẩm cha (Variant Parent)')).not.toBeInTheDocument();
  });

  it('submits the expected payload and navigates on success', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE_URL}/products`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildProduct()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Tên sản phẩm');
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo sản phẩm' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        name: 'Áo thun nam',
        categoryId: 'cat-1',
        unitId: 'unit-1',
        type: 'STANDARD',
        costPrice: 90000,
        prices: [{ type: 'RETAIL', price: 150000 }],
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/products'));
  });

  it('blocks submission and makes zero network calls when required fields are missing', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/products`, () => {
        called = true;
        return HttpResponse.json(envelope(buildProduct()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Tên sản phẩm');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo sản phẩm' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Tên sản phẩm')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(called).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('client-side rejects a price set with no RETAIL entry before ever calling the API', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/products`, () => {
        called = true;
        return HttpResponse.json(envelope(buildProduct()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Tên sản phẩm');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Tên sản phẩm'), 'Áo thun nam');
    await user.type(screen.getByLabelText('Giá vốn'), '90000');
    await user.click(screen.getByRole('combobox', { name: 'Danh mục' }));
    await user.click(await screen.findByRole('option', { name: 'Áo' }));
    await user.click(screen.getByRole('combobox', { name: 'Đơn vị tính' }));
    await user.click(await screen.findByRole('option', { name: 'Cái' }));

    // Change the only default price row away from RETAIL — no RETAIL row remains.
    await user.click(screen.getByRole('combobox', { name: 'Loại giá' }));
    await user.click(await screen.findByRole('option', { name: 'Bán sỉ (WHOLESALE)' }));
    const priceInputs = screen.getAllByRole('spinbutton');
    await user.type(priceInputs[priceInputs.length - 1], '150000');

    await user.click(screen.getByRole('button', { name: 'Tạo sản phẩm' }));

    expect(
      await screen.findByText('Sản phẩm phải có ít nhất 1 mức giá RETAIL'),
    ).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('shows a root-level alert for a generic backend error, with no duplicate global toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.post(`${API_BASE_URL}/products`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'PRODUCT_500',
            message: 'Đã xảy ra lỗi hệ thống',
            errors: [],
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 500 },
        ),
      ),
    );

    renderForm();
    await screen.findByLabelText('Tên sản phẩm');
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo sản phẩm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Đã xảy ra lỗi hệ thống');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('navigates immediately on Cancel when the form is pristine', async () => {
    renderForm();
    await screen.findByLabelText('Tên sản phẩm');

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(push).toHaveBeenCalledWith('/products');
  });

  it('has no accessibility violations on the empty form', async () => {
    const { container } = renderForm();
    await screen.findByLabelText('Tên sản phẩm');
    expect(await axe(container)).toHaveNoViolations();
  });
});
