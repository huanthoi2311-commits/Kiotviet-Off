import type { LucideIcon } from 'lucide-react';
import type { CommercialFeature } from '@/features/entitlement/commercial-feature';
import {
  ArrowLeftRight,
  BarChart3,
  ClipboardCheck,
  ClipboardEdit,
  FolderTree,
  LayoutDashboard,
  Package,
  PackageSearch,
  Receipt,
  Ruler,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  Undo2,
  Users,
  UsersRound,
  Warehouse,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden entirely when the current user lacks this permission code (T034.01 §8). */
  permission?: string;
  /** T053.03 §14 — hidden entirely when the current Organization's Plan does not include this
   * CommercialFeature. Composes with `permission` (both must pass), never replaces it. */
  entitlement?: CommercialFeature;
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
    label: 'Tổ chức',
    items: [
      {
        label: 'Nhân viên',
        href: '/users',
        icon: UsersRound,
        permission: 'user:view',
        entitlement: 'USER_MANAGEMENT',
      },
      {
        label: 'Vai trò',
        href: '/roles',
        icon: ShieldCheck,
        permission: 'role:view',
        entitlement: 'RBAC_MANAGEMENT',
      },
    ],
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
  {
    label: 'CRM',
    items: [
      {
        label: 'Customers',
        href: '/customers',
        icon: Users,
        permission: 'customer:view',
      },
    ],
  },
  {
    label: 'Kho vận',
    items: [
      {
        label: 'Warehouses',
        href: '/warehouses',
        icon: Warehouse,
        permission: 'warehouse:view',
      },
      {
        label: 'Inventory',
        href: '/inventory',
        icon: PackageSearch,
        permission: 'inventory:view',
      },
      {
        label: 'Transfers',
        href: '/transfers',
        icon: ArrowLeftRight,
        permission: 'transfer:view',
      },
      {
        label: 'Inventory Adjustments',
        href: '/inventory-adjustments',
        icon: ClipboardEdit,
        permission: 'inventory:view',
      },
      {
        label: 'Stock Count',
        href: '/stock-count',
        icon: ClipboardCheck,
        permission: 'stock_count:view',
      },
    ],
  },
  {
    label: 'Mua hàng',
    items: [
      {
        label: 'Suppliers',
        href: '/suppliers',
        icon: Truck,
        permission: 'supplier:view',
        entitlement: 'SUPPLIER',
      },
      {
        label: 'Purchase Orders',
        href: '/purchase-orders',
        icon: ShoppingCart,
        permission: 'purchase:view',
      },
      {
        label: 'Purchase Returns',
        href: '/purchase-returns',
        icon: Undo2,
        permission: 'purchase_return:view',
      },
      {
        label: 'Báo cáo mua hàng',
        href: '/purchase-reports',
        icon: BarChart3,
        permission: 'report:view',
      },
    ],
  },
  {
    label: 'Bán hàng',
    items: [
      {
        label: 'POS',
        href: '/pos',
        icon: Store,
        permission: 'pos:access',
      },
      {
        label: 'Invoices',
        href: '/invoices',
        icon: Receipt,
        permission: 'invoice:view',
      },
      {
        label: 'Sales Returns',
        href: '/sales-returns',
        icon: Undo2,
        permission: 'sales_return:view',
      },
    ],
  },
];
