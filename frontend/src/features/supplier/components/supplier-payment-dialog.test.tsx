import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { SupplierPaymentDialog } from './supplier-payment-dialog';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const SUPPLIER_ID = 'supplier-1';

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

function stubRelations({
  purchaseOrders = [],
}: { purchaseOrders?: Record<string, unknown>[] } = {}) {
  server.use(
    http.get(`${API_BASE_URL}/branches`, () =>
      HttpResponse.json(
        envelope({
          items: [{ id: 'branch-1', name: 'Chi nhánh chính', status: 'ACTIVE' }],
          total: 1,
          page: 1,
          limit: 100,
        }),
      ),
    ),
    http.get(`${API_BASE_URL}/purchase-orders`, () =>
      HttpResponse.json(
        envelope({ items: purchaseOrders, total: purchaseOrders.length, page: 1, limit: 100 }),
      ),
    ),
    http.get(`${API_BASE_URL}/supplier-debt`, () =>
      HttpResponse.json(
        envelope({
          items: [
            {
              supplierId: SUPPLIER_ID,
              supplierCode: 'NCC001',
              supplierName: 'NCC A',
              totalDebt: '5000000',
              totalPaid: '2000000',
              balance: '3000000',
            },
          ],
          total: 1,
          page: 1,
          limit: 1,
        }),
      ),
    ),
  );
}

function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)}>
          Mở lại
        </button>
      )}
      <SupplierPaymentDialog open={open} onOpenChange={setOpen} supplierId={SUPPLIER_ID} />
    </>
  );
}

function renderDialog(props: { initialOpen?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}

async function fillMinimalValidForm(dialog: HTMLElement) {
  await userEvent.click(within(dialog).getByRole('combobox', { name: 'Chi nhánh' }));
  await userEvent.click(await screen.findByRole('option', { name: 'Chi nhánh chính' }));
  await userEvent.type(within(dialog).getByLabelText('Số tiền'), '100000');
}

describe('SupplierPaymentDialog (T052.05C)', () => {
  beforeEach(async () => {
    stubRelations();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  // FORM — fields render
  it('renders every CreateSupplierPaymentDto-mapped field', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('combobox', { name: 'Chi nhánh' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Đơn nhập hàng' })).toBeInTheDocument();
    expect(
      within(dialog).getByRole('combobox', { name: 'Phương thức thanh toán' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Số tiền')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Ngày thanh toán')).toBeInTheDocument();
  });

  // FORM — paidAt stable: defaults to today, no raw free-text supplierId anywhere.
  it('defaults paidAt to today and never renders a free-text supplierId field', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    const today = new Date().toISOString().slice(0, 10);
    expect(within(dialog).getByLabelText('Ngày thanh toán')).toHaveValue(today);
    expect(within(dialog).queryByLabelText(/nhà cung cấp/i)).not.toBeInTheDocument();
  });

  // FORM — method enum uses the exact backend values with Vietnamese labels.
  it('offers exactly the 4 canonical payment methods', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Phương thức thanh toán' }));
    for (const label of ['Tiền mặt', 'Chuyển khoản', 'Thẻ', 'Ví điện tử']) {
      expect(await screen.findByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  // FORM — required validation
  it('rejects submission without a branch selected', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Số tiền'), '100000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ghi nhận thanh toán' }));

    expect(await screen.findByText('Vui lòng chọn chi nhánh')).toBeInTheDocument();
  });

  // FORM — amount positive
  it('rejects a zero or negative amount', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Chi nhánh' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Chi nhánh chính' }));
    await userEvent.type(within(dialog).getByLabelText('Số tiền'), '-5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ghi nhận thanh toán' }));

    expect(await screen.findByText('Số tiền phải lớn hơn 0')).toBeInTheDocument();
  });

  // FORM — safe selectors: purchase order picker uses generated options, not raw UUID input.
  it('lists supplier-scoped purchase orders by code in the picker, no raw UUID entry', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('supplierId')).toBe(SUPPLIER_ID);
        return HttpResponse.json(
          envelope({
            items: [{ id: 'po-1', code: 'PO-000123' }],
            total: 1,
            page: 1,
            limit: 100,
          }),
        );
      }),
    );
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Đơn nhập hàng' }));
    expect(await screen.findByRole('option', { name: 'PO-000123' })).toBeInTheDocument();
  });

  // ERRORS
  it('SUPPLIER_DEBT_004 (key-reused) shows a "submit as new payment" message', async () => {
    server.use(
      http.post(`${API_BASE_URL}/supplier-payment`, () =>
        HttpResponse.json(
          errorEnvelope('SUPPLIER_DEBT_004', 'Idempotency-Key này đã dùng cho một yêu cầu khác'),
          { status: 409 },
        ),
      ),
    );
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    await fillMinimalValidForm(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ghi nhận thanh toán' }));

    expect(
      await screen.findByText(
        'Dữ liệu thanh toán đã thay đổi — vui lòng thử lại như một lần thanh toán mới.',
      ),
    ).toBeInTheDocument();
  });

  it('SUPPLIER_DEBT_005 (active conflict) shows a safe-retry message and keeps form state', async () => {
    server.use(
      http.post(`${API_BASE_URL}/supplier-payment`, () =>
        HttpResponse.json(errorEnvelope('SUPPLIER_DEBT_005', 'Yêu cầu đang được xử lý'), {
          status: 409,
        }),
      ),
    );
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    await fillMinimalValidForm(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ghi nhận thanh toán' }));

    expect(
      await screen.findByText(
        'Yêu cầu thanh toán này đang được xử lý — vui lòng thử lại sau ít phút.',
      ),
    ).toBeInTheDocument();
    // Form state preserved for a safe retry — amount field still holds what the user entered.
    expect(within(dialog).getByLabelText('Số tiền')).toHaveValue(100000);
  });

  it('business balance error (SUPPLIER_DEBT_001) surfaces the backend message verbatim', async () => {
    server.use(
      http.post(`${API_BASE_URL}/supplier-payment`, () =>
        HttpResponse.json(
          errorEnvelope(
            'SUPPLIER_DEBT_001',
            'Số tiền thanh toán vượt quá công nợ hiện tại của nhà cung cấp (còn nợ 3000000)',
          ),
          { status: 422 },
        ),
      ),
    );
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    await fillMinimalValidForm(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ghi nhận thanh toán' }));

    expect(
      await screen.findByText(
        'Số tiền thanh toán vượt quá công nợ hiện tại của nhà cung cấp (còn nợ 3000000)',
      ),
    ).toBeInTheDocument();
  });

  it('tenant-safe 404 (branch not found) surfaces the backend message verbatim', async () => {
    server.use(
      http.post(`${API_BASE_URL}/supplier-payment`, () =>
        HttpResponse.json(errorEnvelope('BRANCH_001', 'Không tìm thấy chi nhánh'), {
          status: 404,
        }),
      ),
    );
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    await fillMinimalValidForm(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ghi nhận thanh toán' }));

    expect(await screen.findByText('Không tìm thấy chi nhánh')).toBeInTheDocument();
  });

  // SUCCESS — form reset
  it('resets the form and closes after a successful submission', async () => {
    server.use(
      http.post(`${API_BASE_URL}/supplier-payment`, () =>
        HttpResponse.json(
          envelope({
            id: 'payment-1',
            branchId: 'branch-1',
            supplierId: SUPPLIER_ID,
            purchaseOrderId: null,
            method: 'CASH',
            amount: '100000',
            paidAt: '2026-08-15',
            createdAt: '2026-08-15T00:00:00.000Z',
          }),
          { status: 201 },
        ),
      ),
    );
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    await fillMinimalValidForm(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ghi nhận thanh toán' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('Đã ghi nhận thanh toán');

    await userEvent.click(screen.getByRole('button', { name: 'Mở lại' }));
    const reopened = await screen.findByRole('dialog');
    expect(within(reopened).getByLabelText('Số tiền')).toHaveValue(null);
  });

  // T052.05C §7/§18 — end-to-end wiring proof (not just the isolated hook test): a failed
  // attempt followed by a changed amount must send a DIFFERENT Idempotency-Key on retry, while
  // an unchanged retry sends the SAME one.
  it('sends a NEW Idempotency-Key when amount changes after a failed attempt, but the SAME key for an unchanged retry', async () => {
    const capturedKeys: (string | null)[] = [];
    let shouldFail = true;
    server.use(
      http.post(`${API_BASE_URL}/supplier-payment`, ({ request }) => {
        capturedKeys.push(request.headers.get('idempotency-key'));
        if (shouldFail) {
          return HttpResponse.json(errorEnvelope('SUPPLIER_DEBT_001', 'Vượt quá công nợ'), {
            status: 422,
          });
        }
        return HttpResponse.json(
          envelope({
            id: 'payment-1',
            branchId: 'branch-1',
            supplierId: SUPPLIER_ID,
            purchaseOrderId: null,
            method: 'CASH',
            amount: '999999',
            paidAt: '2026-08-15',
            createdAt: '2026-08-15T00:00:00.000Z',
          }),
          { status: 201 },
        );
      }),
    );
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    await fillMinimalValidForm(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ghi nhận thanh toán' }));
    await screen.findByText('Vượt quá công nợ');

    // Unchanged retry (same amount) — same key.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ghi nhận thanh toán' }));
    await waitFor(() => expect(capturedKeys).toHaveLength(2));
    expect(capturedKeys[1]).toBe(capturedKeys[0]);

    // Changed intent (amount edited) — new key.
    const amountInput = within(dialog).getByLabelText('Số tiền');
    await userEvent.clear(amountInput);
    await userEvent.type(amountInput, '999999');
    shouldFail = false;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ghi nhận thanh toán' }));
    await waitFor(() => expect(capturedKeys).toHaveLength(3));
    expect(capturedKeys[2]).not.toBe(capturedKeys[1]);
  });

  it('Hủy closes the dialog without submitting', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Số tiền'), '100000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  // A11Y
  it('has no accessibility violations', async () => {
    const { container } = renderDialog();
    await screen.findByRole('dialog');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no accessibility violations with a visible root error', async () => {
    server.use(
      http.post(`${API_BASE_URL}/supplier-payment`, () =>
        HttpResponse.json(errorEnvelope('SUPPLIER_DEBT_005', 'Yêu cầu đang được xử lý'), {
          status: 409,
        }),
      ),
    );
    const { container } = renderDialog();
    const dialog = await screen.findByRole('dialog');
    await fillMinimalValidForm(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ghi nhận thanh toán' }));
    await screen.findByText(
      'Yêu cầu thanh toán này đang được xử lý — vui lòng thử lại sau ít phút.',
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
