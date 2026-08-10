import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { PurchaseReportDashboard } from './purchase-report-dashboard';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildDashboard(overrides: Record<string, unknown> = {}) {
  return {
    totalAmount: '150000000',
    totalOrders: 12,
    averageCost: '48500',
    topSuppliers: [
      {
        key: 'sup-1',
        code: 'NCC000001',
        label: 'Công ty Đức An',
        totalAmount: '90000000',
        totalQuantity: '500',
        orderCount: 7,
      },
    ],
    topProducts: [
      {
        key: 'prod-1',
        code: 'SP000001',
        label: 'Sản phẩm A',
        totalAmount: '60000000',
        totalQuantity: '300',
        orderCount: 5,
      },
    ],
    monthlyPurchase: [
      {
        key: '2026-08',
        code: null,
        label: '2026-08',
        totalAmount: '75000000',
        totalQuantity: '800',
        orderCount: 12,
      },
    ],
    ...overrides,
  };
}

function renderDashboard(props: { dateFrom?: string; dateTo?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PurchaseReportDashboard {...props} />
    </QueryClientProvider>,
  );
}

describe('PurchaseReportDashboard (T050)', () => {
  it('renders KPI values and top-supplier/top-product/monthly-purchase lists exactly as returned', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/dashboard`, () =>
        HttpResponse.json(envelope(buildDashboard())),
      ),
    );

    renderDashboard();

    expect(await screen.findByText('150000000')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('48500')).toBeInTheDocument();
    expect(screen.getByText('Công ty Đức An')).toBeInTheDocument();
    expect(screen.getByText('Sản phẩm A')).toBeInTheDocument();
    expect(screen.getByText('2026-08')).toBeInTheDocument();
  });

  it('forwards dateFrom/dateTo as query params to the dashboard endpoint', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/dashboard`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(envelope(buildDashboard()));
      }),
    );

    renderDashboard({
      dateFrom: '2026-08-01T00:00:00.000000+07:00',
      dateTo: '2026-08-31T23:59:59.999999+07:00',
    });

    await screen.findByText('150000000');
    expect(lastUrl?.searchParams.get('dateFrom')).toBe('2026-08-01T00:00:00.000000+07:00');
    expect(lastUrl?.searchParams.get('dateTo')).toBe('2026-08-31T23:59:59.999999+07:00');
  });

  it('omitted dateFrom/dateTo are not sent as query params', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/dashboard`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(envelope(buildDashboard()));
      }),
    );

    renderDashboard();

    await screen.findByText('150000000');
    expect(lastUrl?.searchParams.has('dateFrom')).toBe(false);
    expect(lastUrl?.searchParams.has('dateTo')).toBe(false);
  });

  it('renders "Không có dữ liệu." for an empty breakdown list', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/dashboard`, () =>
        HttpResponse.json(
          envelope(buildDashboard({ topSuppliers: [], topProducts: [], monthlyPurchase: [] })),
        ),
      ),
    );

    renderDashboard();

    await screen.findByText('150000000');
    expect(screen.getAllByText('Không có dữ liệu.')).toHaveLength(3);
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/dashboard`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { success: false, code: 'REPORT_500', message: 'Đã xảy ra lỗi hệ thống', errors: [] },
            { status: 500 },
          );
        }
        return HttpResponse.json(envelope(buildDashboard()));
      }),
    );

    renderDashboard();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('150000000')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/dashboard`, () =>
        HttpResponse.json(envelope(buildDashboard())),
      ),
    );

    const { container } = renderDashboard();
    await screen.findByText('150000000');
    expect(await axe(container)).toHaveNoViolations();
  });
});
