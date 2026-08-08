import type { LucideIcon } from 'lucide-react';
import { FolderTree, LayoutDashboard, Package, Ruler, Tag } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden entirely when the current user lacks this permission code (T034.01 §8). */
  permission?: string;
}

export interface NavSection {
  label: string | null;
  items: NavItem[];
}

/**
 * T034.01 §8 — plain typed data, no registry/dynamic-discovery pattern.
 * Each future module's implementation package (e.g. Category/Brand/Unit,
 * T033.02) adds its own entries here explicitly when it lands — none are
 * added by this foundation package itself (T034.02 boundaries).
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Master Data',
    items: [
      {
        label: 'Categories',
        href: '/categories',
        icon: FolderTree,
        permission: 'category:view',
      },
      {
        label: 'Brands',
        href: '/brands',
        icon: Tag,
        permission: 'brand:view',
      },
      {
        label: 'Units',
        href: '/units',
        icon: Ruler,
        permission: 'unit:view',
      },
      {
        label: 'Products',
        href: '/products',
        icon: Package,
        permission: 'product:view',
      },
    ],
  },
];
