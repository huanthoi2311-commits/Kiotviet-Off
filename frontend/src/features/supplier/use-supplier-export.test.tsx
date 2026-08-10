import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import * as apiClientModule from '@/services/api-client';
import { useSupplierExport } from './use-supplier-export';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function TestHarness({ filters }: { filters: Record<string, string | undefined> }) {
  const exportMutation = useSupplierExport();
  return (
    <button
      type="button"
      disabled={exportMutation.isPending}
      onClick={() => {
        if (exportMutation.isPending) return;
        exportMutation.mutate(filters);
      }}
    >
      {exportMutation.isPending ? 'Đang xuất...' : 'Xuất Excel'}
    </button>
  );
}

function renderHarness(filters: Record<string, string | undefined> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestHarness filters={filters} />
    </QueryClientProvider>,
  );
}

describe('useSupplierExport (T049 AD-1 §6)', () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLSpy = vi.fn(() => 'blob:mock-url');
    revokeObjectURLSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).createObjectURL = createObjectURLSpy;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).revokeObjectURL = revokeObjectURLSpy;
    clickSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLAnchorElement.prototype as any).click = clickSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards the current search/status/province/sort filters as query params', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/suppliers/export`, ({ request }) => {
        lastUrl = new URL(request.url);
        return new HttpResponse(new Blob(['fake-xlsx-bytes']), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="suppliers.xlsx"',
          },
        });
      }),
    );

    renderHarness({
      search: 'Đức An',
      status: 'ARCHIVED',
      province: 'Hà Nội',
      sortBy: 'companyName',
      sortOrder: 'asc',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));

    await waitFor(() => expect(lastUrl).toBeDefined());
    expect(lastUrl?.searchParams.get('search')).toBe('Đức An');
    expect(lastUrl?.searchParams.get('status')).toBe('ARCHIVED');
    expect(lastUrl?.searchParams.get('province')).toBe('Hà Nội');
    expect(lastUrl?.searchParams.get('sortBy')).toBe('companyName');
    expect(lastUrl?.searchParams.get('sortOrder')).toBe('asc');
  });

  it('downloads the blob using the Content-Disposition filename and revokes the object URL', async () => {
    server.use(
      http.get(
        `${API_BASE_URL}/suppliers/export`,
        () =>
          new HttpResponse(new Blob(['fake-xlsx-bytes']), {
            headers: {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Content-Disposition': 'attachment; filename="suppliers-filtered.xlsx"',
            },
          }),
      ),
    );

    renderHarness({});
    await userEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(createObjectURLSpy).toHaveBeenCalledWith(expect.any(Blob));
    await waitFor(() => expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url'));
  });

  it('falls back to the known static filename when Content-Disposition is unavailable', async () => {
    server.use(
      http.get(
        `${API_BASE_URL}/suppliers/export`,
        () =>
          new HttpResponse(new Blob(['fake-xlsx-bytes']), {
            headers: {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
          }),
      ),
    );

    let capturedDownload = '';
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'download', {
          set: (value: string) => {
            capturedDownload = value;
          },
          get: () => capturedDownload,
        });
      }
      return el;
    });

    renderHarness({});
    await userEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(capturedDownload).toBe('suppliers.xlsx');
  });

  it('duplicate-click protection: a second click while pending does not fire a second request', async () => {
    let requestCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/suppliers/export`, async () => {
        requestCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return new HttpResponse(new Blob(['fake-xlsx-bytes']), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="suppliers.xlsx"',
          },
        });
      }),
    );

    renderHarness({});
    const button = screen.getByRole('button', { name: 'Xuất Excel' });
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(requestCount).toBe(1);
  });

  it('does NOT route through apiClientMutator (the shared JSON-envelope unwrapper)', async () => {
    const mutatorSpy = vi.spyOn(apiClientModule, 'apiClientMutator');
    server.use(
      http.get(
        `${API_BASE_URL}/suppliers/export`,
        () =>
          new HttpResponse(new Blob(['fake-xlsx-bytes']), {
            headers: {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Content-Disposition': 'attachment; filename="suppliers.xlsx"',
            },
          }),
      ),
    );

    renderHarness({});
    await userEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(mutatorSpy).not.toHaveBeenCalled();
  });
});
