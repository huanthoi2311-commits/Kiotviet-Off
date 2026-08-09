import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { WarehouseCreateForm } from './warehouse-form';

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

function buildWarehouse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'new-wh-1',
    branchId: 'branch-1',
    managerId: null,
    code: 'KHO01',
    name: 'Kho trung tâm',
    type: 'MAIN',
    address: null,
    phone: null,
    email: null,
    description: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/branches`, () =>
      HttpResponse.json(
        envelope(paginated([{ id: 'branch-1', name: 'Chi nhánh 1', code: 'CN1' }])),
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
      <WarehouseCreateForm />
    </QueryClientProvider>,
  );
}

async function fillRequiredFields() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Mã kho'), 'KHO01');
  await user.type(screen.getByLabelText('Tên kho'), 'Kho trung tâm');
  await user.click(screen.getByRole('combobox', { name: 'Chi nhánh' }));
  await user.click(await screen.findByRole('option', { name: 'Chi nhánh 1' }));
}

describe('WarehouseCreateForm (T044 Phase K)', () => {
  beforeEach(async () => {
    push.mockClear();
    stubRelationLists();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('renders core required fields with accessible labels', async () => {
    renderForm();
    await screen.findByLabelText('Mã kho');

    expect(screen.getByLabelText('Mã kho')).toBeInTheDocument();
    expect(screen.getByLabelText('Tên kho')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Chi nhánh' })).toBeInTheDocument();
  });

  it('submits the expected payload and navigates on success', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE_URL}/warehouses`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildWarehouse()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Mã kho');
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo kho' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        code: 'KHO01',
        name: 'Kho trung tâm',
        branchId: 'branch-1',
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/warehouses'));
  });

  it('blocks submission and makes zero network calls when required fields are missing', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/warehouses`, () => {
        called = true;
        return HttpResponse.json(envelope(buildWarehouse()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Mã kho');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo kho' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Mã kho')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(called).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('WAREHOUSE_002 (duplicate code) maps to a field-level error on "code"', async () => {
    server.use(
      http.post(`${API_BASE_URL}/warehouses`, () =>
        HttpResponse.json(errorEnvelope('WAREHOUSE_002', 'Mã kho đã tồn tại'), { status: 409 }),
      ),
    );

    renderForm();
    await screen.findByLabelText('Mã kho');
    await fillRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo kho' }));

    expect(await screen.findByText('Mã kho đã tồn tại')).toBeInTheDocument();
    expect(screen.getByLabelText('Mã kho')).toHaveAttribute('aria-invalid', 'true');
  });

  it('navigates immediately on Cancel when the form is pristine', async () => {
    renderForm();
    await screen.findByLabelText('Mã kho');

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(push).toHaveBeenCalledWith('/warehouses');
  });

  it('has no accessibility violations on the empty form', async () => {
    const { container } = renderForm();
    await screen.findByLabelText('Mã kho');
    expect(await axe(container)).toHaveNoViolations();
  });
});
