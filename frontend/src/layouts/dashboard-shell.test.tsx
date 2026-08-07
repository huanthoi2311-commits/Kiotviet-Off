import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { useAuthStore } from '@/stores/auth-store';
import { useUiStore } from '@/stores/ui-store';
import { buildAccessToken } from '@/test/build-access-token';
import { DashboardShell } from './dashboard-shell';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/dashboard',
}));

const useSessionRestore = vi.fn();
vi.mock('@/hooks/use-session-restore', () => ({
  useSessionRestore: () => useSessionRestore(),
}));

vi.mock('@/hooks/use-current-organization', () => ({
  useCurrentOrganization: () => ({ data: undefined, isLoading: false }),
}));

let authEventHandler: ((message: { type: string }) => void) | undefined;
vi.mock('@/services/auth-coordination', () => ({
  subscribeToAuthEvents: (handler: (message: { type: string }) => void) => {
    authEventHandler = handler;
    return () => {
      authEventHandler = undefined;
    };
  },
}));

/**
 * DashboardShell composes several already independently-tested pieces
 * (`useSessionRestore`, `useCurrentOrganization`, `AppSidebarProvider`) —
 * this suite exercises only DashboardShell's own branch-selection logic
 * (T034.02: only the final authenticated branch changed, from a plain
 * `<div>` to `AppSidebarProvider`; every gate above it is unchanged).
 */
describe('DashboardShell', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    useUiStore.setState({ isSidebarCollapsed: false });
    replace.mockClear();
    useSessionRestore.mockReset();
    authEventHandler = undefined;
  });

  it('redirects to /login when the session restore reports unauthenticated', () => {
    useSessionRestore.mockReturnValue('unauthenticated');
    render(<DashboardShell>Nội dung</DashboardShell>);
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('renders the restoring skeleton without redirecting or rendering children', () => {
    useSessionRestore.mockReturnValue('restoring');
    render(<DashboardShell>Nội dung</DashboardShell>);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText('Nội dung')).not.toBeInTheDocument();
  });

  it('renders SessionRestoreErrorState on restore-error', () => {
    useSessionRestore.mockReturnValue('restore-error');
    render(<DashboardShell>Nội dung</DashboardShell>);
    expect(screen.getByText('Không thể xác minh phiên đăng nhập')).toBeInTheDocument();
  });

  it('renders SessionExpiredState when an auth-coordination logout event fires while authenticated', () => {
    useSessionRestore.mockReturnValue('restored');
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    useAuthStore.getState().setAccessToken(token);

    render(<DashboardShell>Nội dung</DashboardShell>);
    expect(screen.getByText('Nội dung')).toBeInTheDocument();

    act(() => {
      authEventHandler?.({ type: 'logout' });
    });
    expect(screen.getByText('Phiên đăng nhập đã hết hạn')).toBeInTheDocument();
  });

  it('renders children inside the sidebar shell once authenticated and restored (T034.02)', () => {
    useSessionRestore.mockReturnValue('restored');
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    useAuthStore.getState().setAccessToken(token);

    render(<DashboardShell>Nội dung trang</DashboardShell>);

    expect(screen.getByText('Nội dung trang')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="sidebar"]')).toBeInTheDocument();
  });

  it('has no accessibility violations once authenticated and restored (T034.03A)', async () => {
    useSessionRestore.mockReturnValue('restored');
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    useAuthStore.getState().setAccessToken(token);

    const { container } = render(<DashboardShell>Nội dung trang</DashboardShell>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
