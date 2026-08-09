import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { CustomerCreateForm } from './customer-form';

const API_BASE_URL = 'http://localhost:3000/api/v1';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cus-new-1',
    code: 'CUS000001',
    customerType: 'RETAIL',
    fullName: 'Nguyễn Văn A',
    phone: null,
    email: null,
    birthday: null,
    gender: null,
    taxCode: null,
    companyName: null,
    contactName: null,
    address: null,
    province: null,
    district: null,
    ward: null,
    avatar: null,
    note: null,
    creditLimit: null,
    paymentTermDays: null,
    currentDebt: '0',
    totalRevenue: '0',
    totalOrder: 0,
    totalPoint: 0,
    status: 'ACTIVE',
    version: 1,
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
      <CustomerCreateForm />
    </QueryClientProvider>,
  );
}

describe('CustomerCreateForm (T048 Phase Q)', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('requires fullName before submitting', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo khách hàng' }));
    expect(await screen.findByText(/Tên khách hàng/)).toBeInTheDocument();
  });

  it('submits with an omitted code and navigates to the new customer detail page on success', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE_URL}/customers`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildCustomer()), { status: 201 });
      }),
    );

    renderForm();
    await userEvent.type(screen.getByLabelText('Tên khách hàng'), 'Nguyễn Văn A');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo khách hàng' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ fullName: 'Nguyễn Văn A' }));
    expect(capturedBody?.code).toBeUndefined();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/customers/cus-new-1'));
  });

  it('CUSTOMER_002 (duplicate code) surfaces as a field-level error on code', async () => {
    server.use(
      http.post(`${API_BASE_URL}/customers`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'CUSTOMER_002',
            message: 'Mã khách hàng này đã tồn tại trong tổ chức',
            errors: [],
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 409 },
        ),
      ),
    );

    renderForm();
    await userEvent.type(screen.getByLabelText('Mã khách hàng'), 'CUS000001');
    await userEvent.type(screen.getByLabelText('Tên khách hàng'), 'Nguyễn Văn A');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo khách hàng' }));

    expect(
      await screen.findByText('Mã khách hàng này đã tồn tại trong tổ chức'),
    ).toBeInTheDocument();
  });

  it('has no accessibility violations on the empty form', async () => {
    const { container } = renderForm();
    expect(await axe(container)).toHaveNoViolations();
  });
});
