import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import NewBrandPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NewBrandPage />
    </QueryClientProvider>,
  );
}

describe('NewBrandPage (T041 Phase D)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('renders the create form for a user with brand:create', () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['brand:create'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();

    expect(screen.getByRole('heading', { name: 'Thêm thương hiệu' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mã thương hiệu')).toBeInTheDocument();
  });

  it('shows the unauthorized state, not the form, for a user lacking brand:create', () => {
    renderPage();

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mã thương hiệu')).not.toBeInTheDocument();
  });
});
