import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { UnitCreateForm } from './unit-form';

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

function buildUnit(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    code: 'CAI',
    name: 'Cái',
    symbol: 'cái',
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UnitCreateForm />
    </QueryClientProvider>,
  );
}

describe('UnitCreateForm (T042 Phase D)', () => {
  beforeEach(async () => {
    push.mockClear();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('renders every field with an accessible label — only code/name/symbol/status', async () => {
    renderForm();
    await screen.findByLabelText('Mã đơn vị tính');

    expect(screen.getByLabelText('Mã đơn vị tính')).toBeInTheDocument();
    expect(screen.getByLabelText('Tên đơn vị tính')).toBeInTheDocument();
    expect(screen.getByLabelText('Ký hiệu')).toBeInTheDocument();
    expect(screen.getByLabelText('Trạng thái')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mô tả')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Danh mục cha')).not.toBeInTheDocument();
  });

  it('submits with the expected payload', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${API_BASE_URL}/units`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(envelope(buildUnit({ id: 'new-1' })), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Mã đơn vị tính');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã đơn vị tính'), 'KG');
    await user.type(screen.getByLabelText('Tên đơn vị tính'), 'Kilogram');
    await user.type(screen.getByLabelText('Ký hiệu'), 'kg');
    await user.click(screen.getByRole('button', { name: 'Tạo đơn vị tính' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        code: 'KG',
        name: 'Kilogram',
        symbol: 'kg',
        status: 'ACTIVE',
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/units'));
  });

  it('invalidates the search list cache on successful create', async () => {
    let searchCallCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/units`, () => {
        searchCallCount += 1;
        return HttpResponse.json(envelope({ items: [buildUnit()], total: 1, page: 1, limit: 20 }));
      }),
      http.post(`${API_BASE_URL}/units`, () =>
        HttpResponse.json(envelope(buildUnit({ id: 'new-1' })), { status: 201 }),
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      mutationCache: new MutationCache({ onError: reportMutationError }),
    });
    const { useUnitControllerSearch } = await import('@/generated/unit/unit');
    // Renders alongside a real, active `useUnitControllerSearch` query — the
    // exact same query-key shape `getUnitControllerSearchQueryKey()`
    // targets — so a genuine background refetch after invalidation is
    // observable, matching Category/Brand's own precedent.
    function Harness() {
      useUnitControllerSearch({ limit: 20 });
      return <UnitCreateForm />;
    }
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
    await screen.findByLabelText('Mã đơn vị tính');
    await waitFor(() => expect(searchCallCount).toBeGreaterThan(0));
    const callsAfterMount = searchCallCount;

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã đơn vị tính'), 'KG');
    await user.type(screen.getByLabelText('Tên đơn vị tính'), 'Kilogram');
    await user.type(screen.getByLabelText('Ký hiệu'), 'kg');
    await user.click(screen.getByRole('button', { name: 'Tạo đơn vị tính' }));

    await waitFor(() => expect(searchCallCount).toBeGreaterThan(callsAfterMount));
  });

  it('blocks submission and makes zero network calls when a required field is invalid', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/units`, () => {
        called = true;
        return HttpResponse.json(envelope(buildUnit()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Mã đơn vị tính');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tạo đơn vị tính' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Tên đơn vị tính')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.getByLabelText('Ký hiệu')).toHaveAttribute('aria-invalid', 'true');
    expect(called).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a field-level error on code for UNIT_002 (duplicate), with no duplicate global toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.post(`${API_BASE_URL}/units`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'UNIT_002',
            message: 'Mã đơn vị tính đã tồn tại',
            errors: [],
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 409 },
        ),
      ),
    );

    renderForm();
    await screen.findByLabelText('Mã đơn vị tính');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã đơn vị tính'), 'CAI');
    await user.type(screen.getByLabelText('Tên đơn vị tính'), 'Trùng mã');
    await user.type(screen.getByLabelText('Ký hiệu'), 'x');
    await user.click(screen.getByRole('button', { name: 'Tạo đơn vị tính' }));

    expect(await screen.findByText('Mã đơn vị tính đã tồn tại')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows a root-level alert (not a field error) for any other error code, with no duplicate global toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.post(`${API_BASE_URL}/units`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'UNIT_500',
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
    await screen.findByLabelText('Mã đơn vị tính');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã đơn vị tính'), 'X');
    await user.type(screen.getByLabelText('Tên đơn vị tính'), 'Xy');
    await user.type(screen.getByLabelText('Ký hiệu'), 'x');
    await user.click(screen.getByRole('button', { name: 'Tạo đơn vị tính' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Đã xảy ra lỗi hệ thống');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('navigates immediately on Cancel when the form is pristine', async () => {
    renderForm();
    await screen.findByLabelText('Mã đơn vị tính');

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(push).toHaveBeenCalledWith('/units');
    expect(screen.queryByText('Hủy các thay đổi chưa lưu?')).not.toBeInTheDocument();
  });

  it('shows a confirm dialog on Cancel when the form is dirty, and only navigates after confirming', async () => {
    renderForm();
    await screen.findByLabelText('Mã đơn vị tính');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã đơn vị tính'), 'ABC');
    await user.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(await screen.findByText('Hủy các thay đổi chưa lưu?')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Hủy thay đổi' }));
    expect(push).toHaveBeenCalledWith('/units');
  });

  it('has no accessibility violations on the empty form', async () => {
    const { container } = renderForm();
    await screen.findByLabelText('Mã đơn vị tính');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no accessibility violations once a validation error is shown', async () => {
    const { container } = renderForm();
    await screen.findByLabelText('Mã đơn vị tính');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tạo đơn vị tính' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Tên đơn vị tính')).toHaveAttribute('aria-invalid', 'true'),
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
