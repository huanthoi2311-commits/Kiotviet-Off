import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import * as apiClientModule from '@/services/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { PurchaseReportView } from './purchase-report-view';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildDashboard() {
  return {
    totalAmount: '150000000',
    totalOrders: 12,
    averageCost: '48500',
    topSuppliers: [],
    topProducts: [],
    monthlyPurchase: [],
  };
}

function buildBreakdownItem() {
  return {
    key: 'sup-1',
    code: 'NCC000001',
    label: 'Công ty Đức An',
    totalAmount: '90000000',
    totalQuantity: '500',
    orderCount: 7,
  };
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PurchaseReportView />
    </QueryClientProvider>,
  );
}

function mockReportEndpoints() {
  server.use(
    http.get(`${API_BASE_URL}/purchase-reports/dashboard`, () =>
      HttpResponse.json(envelope(buildDashboard())),
    ),
    http.get(`${API_BASE_URL}/purchase-reports/breakdown`, () =>
      HttpResponse.json(envelope({ items: [buildBreakdownItem()], total: 1, page: 1, limit: 20 })),
    ),
  );
}

describe('PurchaseReportView (T050)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    mockReportEndpoints();
  });

  it('omitting both dates sends no dateFrom/dateTo params to dashboard or breakdown', async () => {
    let dashboardUrl: URL | undefined;
    let breakdownUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/dashboard`, ({ request }) => {
        dashboardUrl = new URL(request.url);
        return HttpResponse.json(envelope(buildDashboard()));
      }),
      http.get(`${API_BASE_URL}/purchase-reports/breakdown`, ({ request }) => {
        breakdownUrl = new URL(request.url);
        return HttpResponse.json(
          envelope({ items: [buildBreakdownItem()], total: 1, page: 1, limit: 20 }),
        );
      }),
    );

    renderView();
    await screen.findByText('Công ty Đức An');

    expect(dashboardUrl?.searchParams.has('dateFrom')).toBe(false);
    expect(dashboardUrl?.searchParams.has('dateTo')).toBe(false);
    expect(breakdownUrl?.searchParams.has('dateFrom')).toBe(false);
    expect(breakdownUrl?.searchParams.has('dateTo')).toBe(false);
  });

  it('picking a date range forwards browser-local-day-boundary ISO params to dashboard and breakdown', async () => {
    let dashboardUrl: URL | undefined;
    let breakdownUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/dashboard`, ({ request }) => {
        dashboardUrl = new URL(request.url);
        return HttpResponse.json(envelope(buildDashboard()));
      }),
      http.get(`${API_BASE_URL}/purchase-reports/breakdown`, ({ request }) => {
        breakdownUrl = new URL(request.url);
        return HttpResponse.json(
          envelope({ items: [buildBreakdownItem()], total: 1, page: 1, limit: 20 }),
        );
      }),
    );

    renderView();
    await screen.findByText('Công ty Đức An');

    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-08-31' } });

    const ISO_MICROSECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}[+-]\d{2}:\d{2}$/;
    await waitFor(() => {
      expect(dashboardUrl?.searchParams.get('dateFrom')).toMatch(ISO_MICROSECOND_PATTERN);
      expect(dashboardUrl?.searchParams.get('dateTo')).toMatch(ISO_MICROSECOND_PATTERN);
    });
    expect(dashboardUrl?.searchParams.get('dateFrom')).toContain('2026-08-01T00:00:00.000000');
    expect(dashboardUrl?.searchParams.get('dateTo')).toContain('2026-08-31T23:59:59.999999');
    expect(breakdownUrl?.searchParams.get('dateFrom')).toBe(
      dashboardUrl?.searchParams.get('dateFrom'),
    );
    expect(breakdownUrl?.searchParams.get('dateTo')).toBe(dashboardUrl?.searchParams.get('dateTo'));
  });

  it('switching "Phân tích theo" re-fetches breakdown with the new groupBy dimension', async () => {
    let lastGroupBy: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/purchase-reports/breakdown`, ({ request }) => {
        lastGroupBy = new URL(request.url).searchParams.get('groupBy');
        return HttpResponse.json(
          envelope({ items: [buildBreakdownItem()], total: 1, page: 1, limit: 20 }),
        );
      }),
    );

    renderView();
    await screen.findByText('Công ty Đức An');
    expect(lastGroupBy).toBe('SUPPLIER');

    await userEvent.click(screen.getByRole('combobox', { name: 'Phân tích theo' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Sản phẩm' }));

    await waitFor(() => expect(lastGroupBy).toBe('PRODUCT'));
  });

  it('hides the export controls for a user without report:export', async () => {
    renderView();
    await screen.findByText('Công ty Đức An');
    expect(screen.queryByRole('button', { name: 'Xuất báo cáo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Định dạng xuất' })).not.toBeInTheDocument();
  });

  it('shows the export button for a user with report:export and forwards groupBy/format/date filters', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['report:view', 'report:export'],
    });
    useAuthStore.getState().setAccessToken(token);

    const getSpy = vi.spyOn(apiClientModule.apiClient, 'get').mockResolvedValue({
      data: new Blob(['fake-xlsx-bytes']),
      headers: { 'content-disposition': 'attachment; filename="purchase-report-supplier.xlsx"' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).createObjectURL = vi.fn(() => 'blob:mock-url');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).revokeObjectURL = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLAnchorElement.prototype as any).click = vi.fn();

    renderView();
    await screen.findByText('Công ty Đức An');

    const exportButton = screen.getByRole('button', { name: 'Xuất báo cáo' });
    await userEvent.click(exportButton);

    await waitFor(() => expect(getSpy).toHaveBeenCalled());
    expect(getSpy).toHaveBeenCalledWith(
      '/purchase-reports/export',
      expect.objectContaining({
        params: expect.objectContaining({ groupBy: 'SUPPLIER', format: 'EXCEL' }),
        responseType: 'blob',
      }),
    );

    vi.restoreAllMocks();
  });

  it('has no accessibility violations once loaded (report:export granted)', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['report:view', 'report:export'],
    });
    useAuthStore.getState().setAccessToken(token);

    const { container } = renderView();
    await screen.findByText('Công ty Đức An');
    expect(await axe(container)).toHaveNoViolations();
  });
});
