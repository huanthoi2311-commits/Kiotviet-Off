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
import { UnitEditForm } from './unit-edit-form';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const CURRENT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

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

function buildUnit(overrides: Record<string, unknown> = {}) {
  return {
    id: CURRENT_ID,
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

function mockFindOne(unit = buildUnit()) {
  server.use(
    http.get(`${API_BASE_URL}/units/${CURRENT_ID}`, () => HttpResponse.json(envelope(unit))),
  );
}

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UnitEditForm id={CURRENT_ID} />
    </QueryClientProvider>,
  );
}

function grantUpdate() {
  const token = buildAccessToken({
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: ['unit:update'],
  });
  useAuthStore.getState().setAccessToken(token);
}

describe('UnitEditForm (T042 Phase E)', () => {
  beforeEach(async () => {
    push.mockClear();
    useAuthStore.getState().clear();
    mockFindOne();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('renders a skeleton while loading', () => {
    server.use(
      http.get(`${API_BASE_URL}/units/${CURRENT_ID}`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(envelope(buildUnit()));
      }),
    );
    grantUpdate();

    const { container } = renderForm();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('shows a dedicated not-found state for UNIT_001, with a link back to the list', async () => {
    server.use(
      http.get(`${API_BASE_URL}/units/${CURRENT_ID}`, () =>
        HttpResponse.json(errorEnvelope('UNIT_001', 'Không tìm thấy đơn vị tính'), { status: 404 }),
      ),
    );
    grantUpdate();

    renderForm();
    expect(await screen.findByText('Không tìm thấy đơn vị tính')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quay lại danh sách' })).toHaveAttribute(
      'href',
      '/units',
    );
  });

  it('shows an inline retry for a non-not-found fetch error', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/units/${CURRENT_ID}`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(errorEnvelope('UNIT_500', 'Đã xảy ra lỗi hệ thống'), {
            status: 500,
          });
        }
        return HttpResponse.json(envelope(buildUnit()));
      }),
    );
    grantUpdate();

    renderForm();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByLabelText('Mã đơn vị tính')).toBeInTheDocument();
  });

  describe('read-only mode (unit:view only, no unit:update)', () => {
    it('renders disabled fields with the loaded values and no submit control', async () => {
      renderForm();
      await screen.findByDisplayValue('CAI');

      expect(screen.getByDisplayValue('CAI')).toBeDisabled();
      expect(screen.getByDisplayValue('Cái')).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Hủy' })).not.toBeInTheDocument();
    });

    it('has no accessibility violations in the read-only state', async () => {
      const { container } = renderForm();
      await screen.findByDisplayValue('CAI');
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('editable mode (unit:update granted)', () => {
    beforeEach(() => grantUpdate());

    it('has no accessibility violations', async () => {
      const { container } = renderForm();
      await screen.findByLabelText('Mã đơn vị tính');
      expect(await axe(container)).toHaveNoViolations();
    });

    it('navigates immediately on Cancel when pristine', async () => {
      renderForm();
      await screen.findByLabelText('Mã đơn vị tính');

      await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
      expect(push).toHaveBeenCalledWith('/units');
    });

    it('shows a confirm dialog on Cancel when dirty, and only navigates after confirming', async () => {
      renderForm();
      const nameInput = await screen.findByLabelText('Tên đơn vị tính');

      const user = userEvent.setup();
      await user.type(nameInput, ' mới');
      await user.click(screen.getByRole('button', { name: 'Hủy' }));

      expect(await screen.findByText('Hủy các thay đổi chưa lưu?')).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Hủy thay đổi' }));
      expect(push).toHaveBeenCalledWith('/units');
    });

    it('submits the full current state and invalidates the search cache', async () => {
      let capturedBody: unknown;
      server.use(
        http.patch(`${API_BASE_URL}/units/${CURRENT_ID}`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(envelope(buildUnit({ version: 2 })), { status: 200 });
        }),
      );
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        mutationCache: new MutationCache({ onError: reportMutationError }),
      });
      const { getUnitControllerSearchQueryKey } = await import('@/generated/unit/unit');
      queryClient.setQueryData(getUnitControllerSearchQueryKey(), { items: [], total: 0 });

      render(
        <QueryClientProvider client={queryClient}>
          <UnitEditForm id={CURRENT_ID} />
        </QueryClientProvider>,
      );
      await screen.findByLabelText('Mã đơn vị tính');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      await waitFor(() =>
        expect(capturedBody).toMatchObject({
          version: 1,
          code: 'CAI',
          name: 'Cái',
          status: 'ACTIVE',
        }),
      );
      expect(queryClient.getQueryState(getUnitControllerSearchQueryKey())?.isInvalidated).toBe(
        true,
      );
      expect(push).not.toHaveBeenCalled();
    });

    it('maps UNIT_002 to the code field, with no duplicate global toast', async () => {
      const { toast } = await import('sonner');
      server.use(
        http.patch(`${API_BASE_URL}/units/${CURRENT_ID}`, () =>
          HttpResponse.json(errorEnvelope('UNIT_002', 'Mã đơn vị tính đã tồn tại'), {
            status: 409,
          }),
        ),
      );

      renderForm();
      await screen.findByLabelText('Mã đơn vị tính');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      expect(await screen.findByText('Mã đơn vị tính đã tồn tại')).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('any other error code shows a root-level alert, not a field error, with no duplicate global toast', async () => {
      const { toast } = await import('sonner');
      server.use(
        http.patch(`${API_BASE_URL}/units/${CURRENT_ID}`, () =>
          HttpResponse.json(errorEnvelope('UNIT_500', 'Đã xảy ra lỗi hệ thống'), { status: 500 }),
        ),
      );

      renderForm();
      await screen.findByLabelText('Mã đơn vị tính');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Đã xảy ra lỗi hệ thống');
      expect(toast.error).not.toHaveBeenCalled();
    });

    describe('UNIT_004 — version conflict (Optimistic Lock)', () => {
      it('does not touch form fields, shows a root alert with a Reload button, only discards on explicit reload, and shows no duplicate global toast', async () => {
        const { toast } = await import('sonner');
        let findOneCallCount = 0;
        server.use(
          http.get(`${API_BASE_URL}/units/${CURRENT_ID}`, () => {
            findOneCallCount += 1;
            return HttpResponse.json(envelope(buildUnit({ version: findOneCallCount })));
          }),
          http.patch(`${API_BASE_URL}/units/${CURRENT_ID}`, () =>
            HttpResponse.json(
              errorEnvelope(
                'UNIT_004',
                'Đơn vị tính vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại',
              ),
              { status: 409 },
            ),
          ),
        );

        renderForm();
        const nameInput = await screen.findByLabelText('Tên đơn vị tính');
        const callsAfterMount = findOneCallCount;

        const user = userEvent.setup();
        await user.clear(nameInput);
        await user.type(nameInput, 'Tên đang chỉnh sửa');
        await user.click(screen.getByRole('button', { name: 'Lưu' }));

        expect(
          await screen.findByText(
            'Đơn vị tính vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại',
          ),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Tên đơn vị tính')).toHaveValue('Tên đang chỉnh sửa');
        expect(toast.error).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'Tải lại' }));

        await waitFor(() => expect(findOneCallCount).toBeGreaterThan(callsAfterMount));
        expect(
          screen.queryByText(
            'Đơn vị tính vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại',
          ),
        ).not.toBeInTheDocument();
      });
    });
  });
});
