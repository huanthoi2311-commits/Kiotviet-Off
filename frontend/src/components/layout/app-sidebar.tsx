'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEntitlements } from '@/features/entitlement/use-entitlements';
import { usePermission } from '@/hooks/use-permission';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { useUiStore } from '@/stores/ui-store';
import { NAV_SECTIONS, type NavItem } from './nav-items';

/**
 * T034.01 §7/§8 — composes the shadcn `sidebar` primitive with this
 * project's own nav data and permission gating. Not a registry/dynamic
 * pattern: NAV_SECTIONS is a plain array, permission-gating happens per
 * item via the existing `usePermission` hook (UX hint only, per its own
 * contract — the server independently enforces every route regardless).
 */
function NavMenuItem({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const hasPermission = usePermission(item.permission ?? '');
  const { hasFeature } = useEntitlements();
  if (item.permission && !hasPermission) {
    return null;
  }
  if (item.entitlement && !hasFeature(item.entitlement)) {
    return null;
  }

  const isActive = pathname === item.href;
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={item.label}
        render={
          <Link href={item.href}>
            <Icon />
            <span>{item.label}</span>
          </Link>
        }
      />
    </SidebarMenuItem>
  );
}

function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="px-2 py-1 text-sm font-semibold">POS ERP Enterprise</span>
      </SidebarHeader>
      <SidebarContent>
        {NAV_SECTIONS.map((section, index) => (
          <SidebarGroup key={section.label ?? `section-${index}`}>
            {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <NavMenuItem key={item.href} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

/**
 * Controlled via the existing `ui-store` (`isSidebarCollapsed`, already
 * defined, unused until this package) rather than the primitive's own
 * internal/cookie-backed state — T034.01 §7.
 */
export function AppSidebarProvider({ children }: { children: React.ReactNode }) {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed);

  return (
    <SidebarProvider open={!isSidebarCollapsed} onOpenChange={(open) => setSidebarCollapsed(!open)}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-3">
          <SidebarTrigger />
        </header>
        <div className="flex-1 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
