import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { TransferCreateForm } from './transfer-form';

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

function buildTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tr-new-1',
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
      <TransferCreateForm />
    </QueryClientProvider>,
  );
}

async function fillRequiredFields() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Kho nguồn' }));
  await user.click(await screen.findByRole('option', { name: 'Kho nguồn' }));
  await user.click(screen.getByRole('combobox', { name: 'Kho đích' }));
  await user.click(await screen.findByRole('option', { name: 'Kho đích' }));
  await user.click(screen.getByRole('combobox', { name: 'Sản phẩm' }));
  await user.click(await screen.findByRole('option', { name: 'Áo thun nam (SP001)' }));
  await user.clear(screen.getByLabelText('Số lượng'));
  await user.type(screen.getByLabelText('Số lượng'), '10');
}

describe('TransferCreateForm (T044 Phase L)', () => {
  beforeEach(async () => {
    push.mockClear();
    stubRelationLists();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('renders core required fields with accessible labels', async () => {
    renderForm();
    await screen.findByRole('combobox', { name: 'Kho nguồn' });

    expect(screen.getByRole('combobox', { name: 'Kho nguồn' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Kho đích' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sản phẩm' })).toBeInTheDocument();
  });

  // T051.09 — 6 sequential combobox/option interactions plus a char-by-char `type('10')` and 2
  // `waitFor` checks is legitimately a lot of async work for one test; the default 5000ms Vitest
  // timeout was intermittently exceeded under the full 98-file suite's CPU contention (confirmed via
  // repeated full-suite reproduction: a generic "Test timed out in 5000ms" — not a wrong-value
  // assertion failure — occurring only under full-suite load, never in isolation). No logic bug:
  // every assertion is correct once given enough wall-clock time. Matches the project's existing
  // precedent of per-test timeout overrides for legitimately slow tests (e.g. real-Postgres E2E specs).
  it('submits the expected payload and navigates to the detail page on success', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE_URL}/transfers`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildTransfer()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Kho nguồn' });
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo phiếu' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        fromWarehouseId: 'wh-1',
        toWarehouseId: 'wh-2',
        items: [{ productId: 'prod-1', quantity: 10 }],
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/transfers/tr-new-1'));
  }, 15_000);

  it('blocks submission and makes zero network calls when required fields are missing', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/transfers`, () => {
        called = true;
        return HttpResponse.json(envelope(buildTransfer()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Kho nguồn' });
    await userEvent.click(screen.getByRole('button', { name: 'Tạo phiếu' }));

    expect(await screen.findByText('Vui lòng chọn kho nguồn')).toBeInTheDocument();
    expect(called).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('client-side rejects fromWarehouseId === toWarehouseId before ever calling the API', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/transfers`, () => {
        called = true;
        return HttpResponse.json(envelope(buildTransfer()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Kho nguồn' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Kho nguồn' }));
    await user.click(await screen.findByRole('option', { name: 'Kho nguồn' }));
    await user.click(screen.getByRole('combobox', { name: 'Kho đích' }));
    await user.click(await screen.findByRole('option', { name: 'Kho nguồn' }));
    await user.click(screen.getByRole('combobox', { name: 'Sản phẩm' }));
    await user.click(await screen.findByRole('option', { name: 'Áo thun nam (SP001)' }));
    await user.clear(screen.getByLabelText('Số lượng'));
    await user.type(screen.getByLabelText('Số lượng'), '10');

    await user.click(screen.getByRole('button', { name: 'Tạo phiếu' }));

    expect(await screen.findByText('Kho nguồn và kho đích phải khác nhau')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('TRANSFER_002 (same warehouse, server-side) maps to a field-level error on "toWarehouseId"', async () => {
    server.use(
      http.post(`${API_BASE_URL}/transfers`, () =>
        HttpResponse.json(errorEnvelope('TRANSFER_002', 'Kho nguồn và kho đích phải khác nhau'), {
          status: 422,
        }),
      ),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Kho nguồn' });
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo phiếu' }));

    expect(await screen.findByText('Kho nguồn và kho đích phải khác nhau')).toBeInTheDocument();
  });

  it('navigates immediately on Cancel when the form is pristine', async () => {
    renderForm();
    await screen.findByRole('combobox', { name: 'Kho nguồn' });

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(push).toHaveBeenCalledWith('/transfers');
  });

  it('has no accessibility violations on the empty form', async () => {
    const { container } = renderForm();
    await screen.findByRole('combobox', { name: 'Kho nguồn' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
