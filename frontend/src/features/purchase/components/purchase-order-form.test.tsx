import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { PurchaseOrderCreateForm } from './purchase-order-form';

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

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'po-new-1',
    branchId: 'branch-1',
    supplierId: 'sup-1',
    code: 'PO0001',
    status: 'DRAFT',
    totalAmount: '500000',
    paidAmount: '0',
    expectedAt: null,
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        warehouseId: 'wh-1',
        quantity: '10',
        receivedQuantity: '0',
        unitCost: '50000',
        discount: '0',
        taxAmount: '0',
        totalAmount: '500000',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/branches`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'branch-1', name: 'Chi nhánh 1' }]))),
    ),
    http.get(`${API_BASE_URL}/suppliers`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'sup-1', companyName: 'Công ty A' }]))),
    ),
    http.get(`${API_BASE_URL}/warehouses`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'wh-1', name: 'Kho trung tâm' }]))),
    ),
    http.get(`${API_BASE_URL}/products`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'prod-1', name: 'Áo thun nam', sku: 'SP001' }]))),
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
      <PurchaseOrderCreateForm />
    </QueryClientProvider>,
  );
}

async function fillRequiredFields() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Chi nhánh' }));
  await user.click(await screen.findByRole('option', { name: 'Chi nhánh 1' }));
  await user.click(screen.getByRole('combobox', { name: 'Nhà cung cấp' }));
  await user.click(await screen.findByRole('option', { name: 'Công ty A' }));
  await user.click(screen.getByRole('combobox', { name: 'Sản phẩm' }));
  await user.click(await screen.findByRole('option', { name: 'Áo thun nam (SP001)' }));
  await user.click(screen.getByRole('combobox', { name: 'Kho nhận hàng' }));
  await user.click(await screen.findByRole('option', { name: 'Kho trung tâm' }));
  await user.clear(screen.getByLabelText('Số lượng'));
  await user.type(screen.getByLabelText('Số lượng'), '10');
  await user.clear(screen.getByLabelText('Đơn giá'));
  await user.type(screen.getByLabelText('Đơn giá'), '50000');
}

describe('PurchaseOrderCreateForm (T045 §5)', () => {
  beforeEach(async () => {
    push.mockClear();
    stubRelationLists();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('renders core required fields with accessible labels', async () => {
    renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });

    expect(screen.getByRole('combobox', { name: 'Chi nhánh' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Nhà cung cấp' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sản phẩm' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Kho nhận hàng' })).toBeInTheDocument();
  });

  it('submits the expected payload and navigates to the detail page on success', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE_URL}/purchase-orders`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildOrder()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo đơn nhập hàng' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        branchId: 'branch-1',
        supplierId: 'sup-1',
        items: [{ productId: 'prod-1', warehouseId: 'wh-1', quantity: 10, unitCost: 50000 }],
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/purchase-orders/po-new-1'));
  }, 20000);

  it('blocks submission and makes zero network calls when required fields are missing', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/purchase-orders`, () => {
        called = true;
        return HttpResponse.json(envelope(buildOrder()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });
    await userEvent.click(screen.getByRole('button', { name: 'Tạo đơn nhập hàng' }));

    expect(await screen.findByText('Vui lòng chọn chi nhánh')).toBeInTheDocument();
    expect(called).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('navigates immediately on Cancel when the form is pristine', async () => {
    renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(push).toHaveBeenCalledWith('/purchase-orders');
  });

  it('has no accessibility violations on the empty form', async () => {
    const { container } = renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
