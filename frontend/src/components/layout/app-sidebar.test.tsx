import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/stores/auth-store';
import { useUiStore } from '@/stores/ui-store';
import { buildAccessToken } from '@/test/build-access-token';
import { AppSidebarProvider } from './app-sidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

function renderSidebar(children: React.ReactNode = <span>Nội dung trang</span>) {
  return render(
    <TooltipProvider>
      <AppSidebarProvider>{children}</AppSidebarProvider>
    </TooltipProvider>,
  );
}

describe('AppSidebarProvider (T034.01 §7/§8, T034.02)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    useUiStore.setState({ isSidebarCollapsed: false });
  });

  it('renders nav items that have no permission requirement, and the page children', () => {
    renderSidebar();

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByText('Nội dung trang')).toBeInTheDocument();
  });

  it('reflects the existing ui-store isSidebarCollapsed flag as the sidebar open state', () => {
    useUiStore.setState({ isSidebarCollapsed: true });
    renderSidebar();

    const sidebar = document.querySelector('[data-slot="sidebar"]');
    expect(sidebar).toHaveAttribute('data-state', 'collapsed');
  });

  it('toggling the sidebar trigger updates the shared ui-store, not just local state', async () => {
    renderSidebar();

    expect(useUiStore.getState().isSidebarCollapsed).toBe(false);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
    expect(useUiStore.getState().isSidebarCollapsed).toBe(true);
  });

  it('has no accessibility violations', async () => {
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    useAuthStore.getState().setAccessToken(token);
    const { container } = renderSidebar();
    expect(await axe(container)).toHaveNoViolations();
  });
});
