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
import { WarehouseEditForm } from './warehouse-edit-form';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const WAREHOUSE_ID = 'wh-1';

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
    id: WAREHOUSE_ID,
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

function mockFindOne(warehouse = buildWarehouse()) {
  server.use(
    http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}`, () =>
      HttpResponse.json(envelope(warehouse)),
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
      <WarehouseEditForm id={WAREHOUSE_ID} />
    </QueryClientProvider>,
  );
}

describe('WarehouseEditForm (T044 Phase K)', () => {
  beforeEach(async () => {
    stubRelationLists();
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['warehouse:update'],
    });
    useAuthStore.getState().setAccessToken(token);
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('loads and pre-fills existing warehouse fields', async () => {
    mockFindOne();
    renderForm();

    expect(await screen.findByDisplayValue('Kho trung tâm')).toBeInTheDocument();
    expect(screen.getByDisplayValue('KHO01')).toBeInTheDocument();
  });

  it('renders a read-only view (no inputs) for a user without warehouse:update', async () => {
    useAuthStore.getState().clear();
    mockFindOne();
    renderForm();

    await screen.findByDisplayValue('Kho trung tâm');
    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
  });

  it('shows the "not found" empty state for WAREHOUSE_001', async () => {
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}`, () =>
        HttpResponse.json(errorEnvelope('WAREHOUSE_001', 'Không tìm thấy kho'), { status: 404 }),
      ),
    );
    renderForm();

    expect(await screen.findByText('Không tìm thấy kho')).toBeInTheDocument();
  });

  it('submits the edited payload and shows a success toast', async () => {
    mockFindOne();
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildWarehouse({ name: 'Kho mới' })));
      }),
    );

    renderForm();
    await screen.findByDisplayValue('Kho trung tâm');

    const user = userEvent.setup();
    const nameInput = screen.getByLabelText('Tên kho');
    await user.clear(nameInput);
    await user.type(nameInput, 'Kho mới');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ name: 'Kho mới' }));
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã cập nhật kho'));
  });

  it('WAREHOUSE_002 (duplicate code) maps to a field-level error on "code"', async () => {
    mockFindOne();
    server.use(
      http.patch(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}`, () =>
        HttpResponse.json(errorEnvelope('WAREHOUSE_002', 'Mã kho đã tồn tại'), { status: 409 }),
      ),
    );

    renderForm();
    await screen.findByDisplayValue('Kho trung tâm');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(await screen.findByText('Mã kho đã tồn tại')).toBeInTheDocument();
  });

  it('has no accessibility violations once loaded', async () => {
    mockFindOne();
    const { container } = renderForm();
    await screen.findByDisplayValue('Kho trung tâm');
    expect(await axe(container)).toHaveNoViolations();
  });
});
