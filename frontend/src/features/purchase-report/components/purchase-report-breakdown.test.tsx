import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { PurchaseReportBreakdown } from './purchase-report-breakdown';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildItem(overrides: Record<string, unknown> = {}) {
  return {
    key: 'sup-1',
    code: 'NCC000001',
    label: 'Công ty Đức An',
    totalAmount: '90000000',
    totalQuantity: '500',
    orderCount: 7,
    ...overrides,
  };
}

function renderBreakdown(groupBy: 'SUPPLIER' | 'PRODUCT' | 'MONTH' = 'SUPPLIER') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PurchaseReportBreakdown groupBy={groupBy} />
    </QueryClientProvider>,
  );
}

describe('PurchaseReportBreakdown (T050)', () => {
  it('sends the selected groupBy dimension and renders returned rows', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/breakdown`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(envelope({ items: [buildItem()], total: 1, page: 1, limit: 20 }));
      }),
    );

    renderBreakdown('SUPPLIER');
    await screen.findByText('Công ty Đức An');

    expect(lastUrl?.searchParams.get('groupBy')).toBe('SUPPLIER');
  });

  it('re-fetches with the new groupBy dimension when it changes', async () => {
    let lastGroupBy: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/breakdown`, ({ request }) => {
        lastGroupBy = new URL(request.url).searchParams.get('groupBy');
        return HttpResponse.json(envelope({ items: [buildItem()], total: 1, page: 1, limit: 20 }));
      }),
    );

    const { rerender } = renderBreakdown('SUPPLIER');
    await screen.findByText('Công ty Đức An');
    expect(lastGroupBy).toBe('SUPPLIER');

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    rerender(
      <QueryClientProvider client={queryClient}>
        <PurchaseReportBreakdown groupBy="PRODUCT" />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(lastGroupBy).toBe('PRODUCT'));
  });

  it('renders the empty state when no rows match the filter', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/breakdown`, () =>
        HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 })),
      ),
    );

    renderBreakdown();
    expect(await screen.findByText('Không có dữ liệu')).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/breakdown`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { success: false, code: 'REPORT_500', message: 'Đã xảy ra lỗi hệ thống', errors: [] },
            { status: 500 },
          );
        }
        return HttpResponse.json(envelope({ items: [buildItem()], total: 1, page: 1, limit: 20 }));
      }),
    );

    renderBreakdown();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Công ty Đức An')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/breakdown`, () =>
        HttpResponse.json(envelope({ items: [buildItem()], total: 1, page: 1, limit: 20 })),
      ),
    );

    const { container } = renderBreakdown();
    await screen.findByText('Công ty Đức An');
    expect(await axe(container)).toHaveNoViolations();
  });
});
