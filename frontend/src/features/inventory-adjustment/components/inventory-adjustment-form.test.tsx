import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { InventoryAdjustmentCreateForm } from './inventory-adjustment-form';

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

function buildAdjustment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'adj-new-1',
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

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InventoryAdjustmentCreateForm />
    </QueryClientProvider>,
  );
}

async function fillRequiredFields() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Kho' }));
  await user.click(await screen.findByRole('option', { name: 'Kho trung tâm' }));
  await user.click(screen.getByRole('combobox', { name: 'Sản phẩm' }));
  await user.click(await screen.findByRole('option', { name: 'Áo thun nam (SP001)' }));
  await user.clear(screen.getByLabelText('Chênh lệch (+/-)'));
  await user.type(screen.getByLabelText('Chênh lệch (+/-)'), '-5');
}

describe('InventoryAdjustmentCreateForm (T044 Phase M)', () => {
  beforeEach(async () => {
    push.mockClear();
    stubRelationLists();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('renders core required fields with accessible labels', async () => {
    renderForm();
    await screen.findByRole('combobox', { name: 'Kho' });

    expect(screen.getByRole('combobox', { name: 'Kho' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lý do' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sản phẩm' })).toBeInTheDocument();
  });

  it('submits the expected signed-delta payload and navigates to the detail page on success', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE_URL}/inventory-adjustments`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildAdjustment()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Kho' });
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo phiếu' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        warehouseId: 'wh-1',
        reason: 'LOST',
        items: [{ productId: 'prod-1', quantity: -5 }],
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/inventory-adjustments/adj-new-1'));
  });

  it('blocks submission and makes zero network calls when required fields are missing', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/inventory-adjustments`, () => {
        called = true;
        return HttpResponse.json(envelope(buildAdjustment()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Kho' });
    await userEvent.click(screen.getByRole('button', { name: 'Tạo phiếu' }));

    expect(await screen.findByText('Vui lòng chọn kho')).toBeInTheDocument();
    expect(called).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('client-side rejects a zero-quantity delta before ever calling the API', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/inventory-adjustments`, () => {
        called = true;
        return HttpResponse.json(envelope(buildAdjustment()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByRole('combobox', { name: 'Kho' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Kho' }));
    await user.click(await screen.findByRole('option', { name: 'Kho trung tâm' }));
    await user.click(screen.getByRole('combobox', { name: 'Sản phẩm' }));
    await user.click(await screen.findByRole('option', { name: 'Áo thun nam (SP001)' }));
    await user.clear(screen.getByLabelText('Chênh lệch (+/-)'));
    await user.type(screen.getByLabelText('Chênh lệch (+/-)'), '0');

    await user.click(screen.getByRole('button', { name: 'Tạo phiếu' }));

    expect(await screen.findByText('Số lượng chênh lệch không được bằng 0')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('navigates immediately on Cancel when the form is pristine', async () => {
    renderForm();
    await screen.findByRole('combobox', { name: 'Kho' });

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(push).toHaveBeenCalledWith('/inventory-adjustments');
  });

  it('has no accessibility violations on the empty form', async () => {
    const { container } = renderForm();
    await screen.findByRole('combobox', { name: 'Kho' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
