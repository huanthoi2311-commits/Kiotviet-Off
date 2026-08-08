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
import { BrandEditForm } from './brand-edit-form';

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

function buildBrand(overrides: Record<string, unknown> = {}) {
  return {
    id: CURRENT_ID,
    code: 'NIKE',
    name: 'Nike',
    logo: null,
    description: null,
    website: null,
    country: null,
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockFindOne(brand = buildBrand()) {
  server.use(
    http.get(`${API_BASE_URL}/brands/${CURRENT_ID}`, () => HttpResponse.json(envelope(brand))),
  );
}

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrandEditForm id={CURRENT_ID} />
    </QueryClientProvider>,
  );
}

function grantUpdate() {
  const token = buildAccessToken({
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: ['brand:update'],
  });
  useAuthStore.getState().setAccessToken(token);
}

describe('BrandEditForm (T041 Phase E)', () => {
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
      http.get(`${API_BASE_URL}/brands/${CURRENT_ID}`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(envelope(buildBrand()));
      }),
    );
    grantUpdate();

    const { container } = renderForm();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('shows a dedicated not-found state for BRAND_001, with a link back to the list', async () => {
    server.use(
      http.get(`${API_BASE_URL}/brands/${CURRENT_ID}`, () =>
        HttpResponse.json(errorEnvelope('BRAND_001', 'Không tìm thấy thương hiệu'), {
          status: 404,
        }),
      ),
    );
    grantUpdate();

    renderForm();
    expect(await screen.findByText('Không tìm thấy thương hiệu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quay lại danh sách' })).toHaveAttribute(
      'href',
      '/brands',
    );
  });

  it('shows an inline retry for a non-not-found fetch error', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/brands/${CURRENT_ID}`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(errorEnvelope('BRAND_500', 'Đã xảy ra lỗi hệ thống'), {
            status: 500,
          });
        }
        return HttpResponse.json(envelope(buildBrand()));
      }),
    );
    grantUpdate();

    renderForm();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByLabelText('Mã thương hiệu')).toBeInTheDocument();
  });

  describe('read-only mode (brand:view only, no brand:update)', () => {
    it('renders disabled fields with the loaded values and no submit control', async () => {
      renderForm();
      await screen.findByDisplayValue('NIKE');

      expect(screen.getByDisplayValue('NIKE')).toBeDisabled();
      expect(screen.getByDisplayValue('Nike')).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Hủy' })).not.toBeInTheDocument();
    });

    it('has no accessibility violations in the read-only state', async () => {
      const { container } = renderForm();
      await screen.findByDisplayValue('NIKE');
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('editable mode (brand:update granted)', () => {
    beforeEach(() => grantUpdate());

    it('has no accessibility violations', async () => {
      const { container } = renderForm();
      await screen.findByLabelText('Mã thương hiệu');
      expect(await axe(container)).toHaveNoViolations();
    });

    it('navigates immediately on Cancel when pristine', async () => {
      renderForm();
      await screen.findByLabelText('Mã thương hiệu');

      await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
      expect(push).toHaveBeenCalledWith('/brands');
    });

    it('shows a confirm dialog on Cancel when dirty, and only navigates after confirming', async () => {
      renderForm();
      const nameInput = await screen.findByLabelText('Tên thương hiệu');

      const user = userEvent.setup();
      await user.type(nameInput, ' Inc.');
      await user.click(screen.getByRole('button', { name: 'Hủy' }));

      expect(await screen.findByText('Hủy các thay đổi chưa lưu?')).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Hủy thay đổi' }));
      expect(push).toHaveBeenCalledWith('/brands');
    });

    it('submits the full current state, invalidates findOne (refetches, has an active observer) and search (marked invalidated, no observer here)', async () => {
      let capturedBody: unknown;
      let findOneCallCount = 0;
      server.use(
        http.get(`${API_BASE_URL}/brands/${CURRENT_ID}`, () => {
          findOneCallCount += 1;
          return HttpResponse.json(envelope(buildBrand()));
        }),
        http.patch(`${API_BASE_URL}/brands/${CURRENT_ID}`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(envelope(buildBrand({ version: 2 })), { status: 200 });
        }),
      );
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        mutationCache: new MutationCache({ onError: reportMutationError }),
      });
      const { getBrandControllerSearchQueryKey } = await import('@/generated/brand/brand');
      queryClient.setQueryData(getBrandControllerSearchQueryKey(), { items: [], total: 0 });

      render(
        <QueryClientProvider client={queryClient}>
          <BrandEditForm id={CURRENT_ID} />
        </QueryClientProvider>,
      );
      await screen.findByLabelText('Mã thương hiệu');
      const findOneCallsAfterMount = findOneCallCount;

      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      await waitFor(() =>
        expect(capturedBody).toMatchObject({
          version: 1,
          code: 'NIKE',
          name: 'Nike',
          status: 'ACTIVE',
        }),
      );
      // findOne has an active observer (this form's own query) — invalidating
      // it triggers an immediate background refetch, which also self-clears
      // `isInvalidated` once it resolves, so a call-count increase (not that
      // flag) is the direct evidence, matching Category's own precedent.
      await waitFor(() => expect(findOneCallCount).toBeGreaterThan(findOneCallsAfterMount));
      // search has no active observer in this test (no BrandTable mounted),
      // so `isInvalidated` staying true is valid direct evidence here.
      expect(queryClient.getQueryState(getBrandControllerSearchQueryKey())?.isInvalidated).toBe(
        true,
      );
      expect(push).not.toHaveBeenCalled();
    });

    it('maps BRAND_002 to the code field, with no duplicate global toast', async () => {
      const { toast } = await import('sonner');
      server.use(
        http.patch(`${API_BASE_URL}/brands/${CURRENT_ID}`, () =>
          HttpResponse.json(errorEnvelope('BRAND_002', 'Mã thương hiệu đã tồn tại'), {
            status: 409,
          }),
        ),
      );

      renderForm();
      await screen.findByLabelText('Mã thương hiệu');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      expect(await screen.findByText('Mã thương hiệu đã tồn tại')).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('any other error code shows a root-level alert, not a field error, with no duplicate global toast', async () => {
      const { toast } = await import('sonner');
      server.use(
        http.patch(`${API_BASE_URL}/brands/${CURRENT_ID}`, () =>
          HttpResponse.json(errorEnvelope('BRAND_500', 'Đã xảy ra lỗi hệ thống'), { status: 500 }),
        ),
      );

      renderForm();
      await screen.findByLabelText('Mã thương hiệu');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Đã xảy ra lỗi hệ thống');
      expect(toast.error).not.toHaveBeenCalled();
    });

    describe('BRAND_004 — version conflict (Optimistic Lock)', () => {
      it('does not touch form fields, shows a root alert with a Reload button, only discards on explicit reload, and shows no duplicate global toast', async () => {
        const { toast } = await import('sonner');
        let findOneCallCount = 0;
        server.use(
          http.get(`${API_BASE_URL}/brands/${CURRENT_ID}`, () => {
            findOneCallCount += 1;
            return HttpResponse.json(envelope(buildBrand({ version: findOneCallCount })));
          }),
          http.patch(`${API_BASE_URL}/brands/${CURRENT_ID}`, () =>
            HttpResponse.json(
              errorEnvelope(
                'BRAND_004',
                'Thương hiệu vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại',
              ),
              { status: 409 },
            ),
          ),
        );

        renderForm();
        const nameInput = await screen.findByLabelText('Tên thương hiệu');
        const callsAfterMount = findOneCallCount;

        const user = userEvent.setup();
        await user.clear(nameInput);
        await user.type(nameInput, 'Tên đang chỉnh sửa');
        await user.click(screen.getByRole('button', { name: 'Lưu' }));

        expect(
          await screen.findByText(
            'Thương hiệu vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại',
          ),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Tên thương hiệu')).toHaveValue('Tên đang chỉnh sửa');
        expect(toast.error).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'Tải lại' }));

        await waitFor(() => expect(findOneCallCount).toBeGreaterThan(callsAfterMount));
        expect(
          screen.queryByText(
            'Thương hiệu vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại',
          ),
        ).not.toBeInTheDocument();
      });
    });
  });
});
