import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { SupplierCreateForm } from './supplier-form';

const API_BASE_URL = 'http://localhost:3000/api/v1';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildSupplier(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sup-new-1',
    code: 'NCC000001',
    taxCode: null,
    companyName: 'Công ty Đức An',
    contactName: null,
    phone: null,
    email: null,
    website: null,
    address: null,
    province: null,
    district: null,
    ward: null,
    bankName: null,
    bankAccount: null,
    paymentTerm: null,
    creditLimit: null,
    status: 'ACTIVE',
    version: 1,
    note: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
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
      <SupplierCreateForm />
    </QueryClientProvider>,
  );
}

describe('SupplierCreateForm (T049 Phase S)', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('requires companyName before submitting', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhà cung cấp' }));
    expect(await screen.findByText(/Tên công ty/)).toBeInTheDocument();
  });

  it('submits with an omitted code and navigates to the new supplier detail page on success', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE_URL}/suppliers`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildSupplier()), { status: 201 });
      }),
    );

    renderForm();
    await userEvent.type(screen.getByLabelText('Tên công ty'), 'Công ty Đức An');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhà cung cấp' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ companyName: 'Công ty Đức An' }));
    expect(capturedBody?.code).toBeUndefined();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/suppliers/sup-new-1'));
  });

  it('rejects an invalid website URL client-side before ever calling the API', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/suppliers`, () => {
        called = true;
        return HttpResponse.json(envelope(buildSupplier()), { status: 201 });
      }),
    );

    renderForm();
    await userEvent.type(screen.getByLabelText('Tên công ty'), 'Công ty Đức An');
    await userEvent.type(screen.getByLabelText('Website'), 'not-a-url');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhà cung cấp' }));

    expect(await screen.findByText('website phải là URL hợp lệ')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('SUPPLIER_002 (duplicate code) surfaces as a field-level error on code', async () => {
    server.use(
      http.post(`${API_BASE_URL}/suppliers`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'SUPPLIER_002',
            message: 'Mã nhà cung cấp này đã tồn tại',
            errors: [],
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 409 },
        ),
      ),
    );

    renderForm();
    await userEvent.type(screen.getByLabelText('Mã nhà cung cấp'), 'NCC000001');
    await userEvent.type(screen.getByLabelText('Tên công ty'), 'Công ty Đức An');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhà cung cấp' }));

    expect(await screen.findByText('Mã nhà cung cấp này đã tồn tại')).toBeInTheDocument();
  });

  it('has no accessibility violations on the empty form', async () => {
    const { container } = renderForm();
    expect(await axe(container)).toHaveNoViolations();
  });
});
