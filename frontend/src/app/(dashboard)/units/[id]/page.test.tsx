import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import UnitEditPage from './page';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const UNIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildUnit(overrides: Record<string, unknown> = {}) {
  return {
    id: UNIT_ID,
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

async function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Page = await UnitEditPage({ params: Promise.resolve({ id: UNIT_ID }) });
  return render(<QueryClientProvider client={queryClient}>{Page}</QueryClientProvider>);
}

describe('UnitEditPage (T042 Phase E)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    server.use(
      http.get(`${API_BASE_URL}/units/${UNIT_ID}`, () => HttpResponse.json(envelope(buildUnit()))),
    );
  });

  it('renders the page header and record for a user with unit:view', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['unit:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    await renderPage();

    expect(screen.getByRole('heading', { name: 'Chi tiết đơn vị tính' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('CAI')).toBeInTheDocument();
  });

  it('shows the unauthorized state, not the record, for a user lacking unit:view', async () => {
    await renderPage();

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chi tiết đơn vị tính' })).not.toBeInTheDocument();
  });
});
