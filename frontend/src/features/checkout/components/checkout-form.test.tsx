import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { CheckoutForm } from './checkout-form';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';

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

function buildCheckoutResponse(overrides: Record<string, unknown> = {}) {
  return {
    invoice: {
      id: 'inv-1',
      branchId: 'branch-1',
      orderId: null,
      customerId: null,
      code: 'HD0001',
      status: 'PAID',
      totalAmount: '150000',
      paidAmount: '150000',
      dueAmount: '0',
      dueDate: null,
      customerCodeSnapshot: null,
      customerNameSnapshot: null,
      customerPhoneSnapshot: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      items: [],
    },
    payment: {
      id: 'pay-1',
      branchId: 'branch-1',
      invoiceId: 'inv-1',
      customerId: null,
      method: 'CASH',
      amount: '150000',
      paidAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/branches`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'branch-1', name: 'Chi nhánh 1' }]))),
    ),
    http.get(`${API_BASE_URL}/warehouses`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'wh-1', name: 'Kho trung tâm' }]))),
    ),
    http.get(`${API_BASE_URL}/customers`, () => HttpResponse.json(envelope(paginated([])))),
    http.get(`${API_BASE_URL}/products`, () => HttpResponse.json(envelope(paginated([])))),
  );
}

function renderForm(cartIsEmpty = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CheckoutForm cartIsEmpty={cartIsEmpty} />
    </QueryClientProvider>,
  );
}

async function fillRequiredFields() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Chi nhánh' }));
  await user.click(await screen.findByRole('option', { name: 'Chi nhánh 1' }));
  await user.click(screen.getByRole('combobox', { name: 'Kho xuất hàng' }));
  await user.click(await screen.findByRole('option', { name: 'Kho trung tâm' }));
}

describe('CheckoutForm (T046 §5/§12 — AD-2 exception)', () => {
  beforeEach(async () => {
    stubRelationLists();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('renders core required fields with accessible labels', async () => {
    renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });

    expect(screen.getByRole('combobox', { name: 'Chi nhánh' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Kho xuất hàng' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Phương thức thanh toán' })).toBeInTheDocument();
  });

  it('sends the Idempotency-Key header, and the request body is exactly CheckoutDto with no items', async () => {
    let capturedHeader: string | null = null;
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE_URL}/checkout`, async ({ request }) => {
        capturedHeader = request.headers.get('Idempotency-Key');
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildCheckoutResponse()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Thanh toán' }));

    await waitFor(() => expect(capturedHeader).toMatch(/^[0-9a-f-]{36}$/i));
    expect(capturedBody).toMatchObject({
      branchId: 'branch-1',
      warehouseId: 'wh-1',
      paymentMethod: 'CASH',
    });
    expect(capturedBody).not.toHaveProperty('items');
  });

  it('blocks submission and makes zero network calls when required fields are missing', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/checkout`, () => {
        called = true;
        return HttpResponse.json(envelope(buildCheckoutResponse()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });
    await userEvent.click(screen.getByRole('button', { name: 'Thanh toán' }));

    expect(await screen.findByText('Vui lòng chọn chi nhánh')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('disables the submit button and shows a message when the cart is empty', async () => {
    renderForm(true);
    await screen.findByRole('combobox', { name: 'Chi nhánh' });

    expect(screen.getByRole('button', { name: 'Thanh toán' })).toBeDisabled();
    expect(screen.getByText('Giỏ hàng đang trống.')).toBeInTheDocument();
  });

  it('a duplicate submit while the first request is still pending sends exactly one request', async () => {
    let requestCount = 0;
    server.use(
      http.post(`${API_BASE_URL}/checkout`, async () => {
        requestCount += 1;
        await delay(50);
        return HttpResponse.json(envelope(buildCheckoutResponse()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });
    await fillRequiredFields();
    const submitButton = screen.getByRole('button', { name: 'Thanh toán' });
    await userEvent.click(submitButton);
    await userEvent.click(submitButton);
    await userEvent.click(submitButton);

    await waitFor(() => expect(screen.getByText('Thanh toán thành công')).toBeInTheDocument());
    expect(requestCount).toBe(1);
  });

  it('an explicit retry after a failure reuses the same Idempotency-Key', async () => {
    const seenHeaders: (string | null)[] = [];
    let callCount = 0;
    server.use(
      http.post(`${API_BASE_URL}/checkout`, async ({ request }) => {
        seenHeaders.push(request.headers.get('Idempotency-Key'));
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            errorEnvelope('CHECKOUT_INSUFFICIENT_STOCK', 'Không đủ tồn kho'),
            { status: 422 },
          );
        }
        return HttpResponse.json(envelope(buildCheckoutResponse()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });
    await fillRequiredFields();
    const submitButton = screen.getByRole('button', { name: 'Thanh toán' });
    await userEvent.click(submitButton);
    await screen.findByText('Không đủ tồn kho');

    await userEvent.click(submitButton);
    await waitFor(() => expect(screen.getByText('Thanh toán thành công')).toBeInTheDocument());

    expect(seenHeaders).toHaveLength(2);
    expect(seenHeaders[0]).toBe(seenHeaders[1]);
  });

  it('a new checkout attempt after a completed one receives a new Idempotency-Key', async () => {
    const seenHeaders: (string | null)[] = [];
    server.use(
      http.post(`${API_BASE_URL}/checkout`, async ({ request }) => {
        seenHeaders.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json(envelope(buildCheckoutResponse()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Thanh toán' }));
    await screen.findByText('Thanh toán thành công');

    await userEvent.click(screen.getByRole('button', { name: 'Bán hàng mới' }));
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Thanh toán' }));
    await waitFor(() => expect(seenHeaders).toHaveLength(2));

    expect(seenHeaders[0]).not.toBe(seenHeaders[1]);
  });

  it('CHECKOUT_IDEMPOTENCY_KEY_REUSED surfaces as a root-level alert', async () => {
    server.use(
      http.post(`${API_BASE_URL}/checkout`, () =>
        HttpResponse.json(
          errorEnvelope(
            'CHECKOUT_IDEMPOTENCY_KEY_REUSED',
            'Yêu cầu trùng khóa nhưng khác nội dung',
          ),
          { status: 409 },
        ),
      ),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Thanh toán' }));

    expect(await screen.findByText('Yêu cầu trùng khóa nhưng khác nội dung')).toBeInTheDocument();
  });

  it('CHECKOUT_VOUCHER_INVALID maps to a field-level error on the voucher input', async () => {
    server.use(
      http.post(`${API_BASE_URL}/checkout`, () =>
        HttpResponse.json(errorEnvelope('CHECKOUT_VOUCHER_INVALID', 'Mã giảm giá không hợp lệ'), {
          status: 422,
        }),
      ),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });
    await fillRequiredFields();
    await userEvent.type(screen.getByLabelText('Mã giảm giá'), 'ABC123');
    await userEvent.click(screen.getByRole('button', { name: 'Thanh toán' }));

    expect(await screen.findByText('Mã giảm giá không hợp lệ')).toBeInTheDocument();
  });

  it('has no accessibility violations on the empty form', async () => {
    const { container } = renderForm();
    await screen.findByRole('combobox', { name: 'Chi nhánh' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
