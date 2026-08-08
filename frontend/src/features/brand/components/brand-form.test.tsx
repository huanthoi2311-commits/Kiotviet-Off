import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { BrandCreateForm } from './brand-form';

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

function buildBrand(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
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

function renderForm() {
  // Category's T038.08B precedent — the real MutationCache config (not a
  // bare QueryClient), so `meta: { suppressGlobalErrorToast: true }` is
  // actually exercised end-to-end, not just present in source.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrandCreateForm />
    </QueryClientProvider>,
  );
}

describe('BrandCreateForm (T041 Phase D)', () => {
  beforeEach(async () => {
    push.mockClear();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('renders every field with an accessible label — no parentId/sortOrder/isActive (Brand has none)', async () => {
    renderForm();
    await screen.findByLabelText('Mã thương hiệu');

    expect(screen.getByLabelText('Mã thương hiệu')).toBeInTheDocument();
    expect(screen.getByLabelText('Tên thương hiệu')).toBeInTheDocument();
    expect(screen.getByLabelText('Logo (URL)')).toBeInTheDocument();
    expect(screen.getByLabelText('Mô tả')).toBeInTheDocument();
    expect(screen.getByLabelText('Website')).toBeInTheDocument();
    expect(screen.getByLabelText('Quốc gia')).toBeInTheDocument();
    expect(screen.getByLabelText('Trạng thái')).toBeInTheDocument();
    expect(screen.queryByLabelText('Danh mục cha')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Thứ tự')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Đang hoạt động')).not.toBeInTheDocument();
  });

  it('submits with only required fields and calls create with the expected payload', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${API_BASE_URL}/brands`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(envelope(buildBrand({ id: 'new-1' })), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Mã thương hiệu');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã thương hiệu'), 'ADIDAS');
    await user.type(screen.getByLabelText('Tên thương hiệu'), 'Adidas');
    await user.click(screen.getByRole('button', { name: 'Tạo thương hiệu' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({ code: 'ADIDAS', name: 'Adidas', status: 'ACTIVE' }),
    );
    // website/logo/description/country all blank -> omitted, not sent as ''.
    expect(capturedBody).not.toHaveProperty('website');
    expect(capturedBody).not.toHaveProperty('logo');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/brands'));
  });

  it('rejects a non-URL website value client-side, mirroring the backend @IsUrl() constraint', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/brands`, () => {
        called = true;
        return HttpResponse.json(envelope(buildBrand()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Mã thương hiệu');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã thương hiệu'), 'X');
    await user.type(screen.getByLabelText('Tên thương hiệu'), 'Xy');
    await user.type(screen.getByLabelText('Website'), 'not-a-url');
    await user.click(screen.getByRole('button', { name: 'Tạo thương hiệu' }));

    expect(await screen.findByText('website phải là URL hợp lệ')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('allows a blank website (optional field)', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${API_BASE_URL}/brands`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(envelope(buildBrand({ id: 'new-1' })), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Mã thương hiệu');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã thương hiệu'), 'X');
    await user.type(screen.getByLabelText('Tên thương hiệu'), 'Xy');
    await user.click(screen.getByRole('button', { name: 'Tạo thương hiệu' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ code: 'X', name: 'Xy' }));
  });

  it('blocks submission and makes zero network calls when a required field is invalid', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/brands`, () => {
        called = true;
        return HttpResponse.json(envelope(buildBrand()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Mã thương hiệu');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tạo thương hiệu' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Tên thương hiệu')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(called).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a field-level error on code for BRAND_002 (duplicate), with no duplicate global toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.post(`${API_BASE_URL}/brands`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'BRAND_002',
            message: 'Mã thương hiệu đã tồn tại',
            errors: [],
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 409 },
        ),
      ),
    );

    renderForm();
    await screen.findByLabelText('Mã thương hiệu');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã thương hiệu'), 'NIKE');
    await user.type(screen.getByLabelText('Tên thương hiệu'), 'Trùng mã');
    await user.click(screen.getByRole('button', { name: 'Tạo thương hiệu' }));

    expect(await screen.findByText('Mã thương hiệu đã tồn tại')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows a root-level alert (not a field error) for any other error code, with no duplicate global toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.post(`${API_BASE_URL}/brands`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'BRAND_500',
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
    await screen.findByLabelText('Mã thương hiệu');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã thương hiệu'), 'X');
    await user.type(screen.getByLabelText('Tên thương hiệu'), 'Xy');
    await user.click(screen.getByRole('button', { name: 'Tạo thương hiệu' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Đã xảy ra lỗi hệ thống');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('navigates immediately on Cancel when the form is pristine', async () => {
    renderForm();
    await screen.findByLabelText('Mã thương hiệu');

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(push).toHaveBeenCalledWith('/brands');
    expect(screen.queryByText('Hủy các thay đổi chưa lưu?')).not.toBeInTheDocument();
  });

  it('shows a confirm dialog on Cancel when the form is dirty, and only navigates after confirming', async () => {
    renderForm();
    await screen.findByLabelText('Mã thương hiệu');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã thương hiệu'), 'ABC');
    await user.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(await screen.findByText('Hủy các thay đổi chưa lưu?')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Hủy thay đổi' }));
    expect(push).toHaveBeenCalledWith('/brands');
  });

  it('has no accessibility violations on the empty form', async () => {
    const { container } = renderForm();
    await screen.findByLabelText('Mã thương hiệu');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no accessibility violations once a validation error is shown', async () => {
    const { container } = renderForm();
    await screen.findByLabelText('Mã thương hiệu');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tạo thương hiệu' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Tên thương hiệu')).toHaveAttribute('aria-invalid', 'true'),
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
