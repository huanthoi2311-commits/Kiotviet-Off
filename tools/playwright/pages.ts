/**
 * Danh sách trang dùng chung cho `capture-all.ts`. Đây là cấu hình DUY NHẤT mô tả "chụp
 * những trang nào" — thêm/bớt trang chỉ cần sửa mảng `PAGES` dưới đây, không cần sửa
 * `capture-all.ts`.
 *
 * Mapping tên nghiệp vụ → route thật (đối chiếu `frontend/src/app/(dashboard)/**​/page.tsx`,
 * KHÔNG bịa route không tồn tại). 5 route không trùng tên 1:1 với danh mục nghiệp vụ được
 * Architect liệt kê, chọn route thật gần nghĩa nhất — có thể sửa lại `path` bên dưới nếu
 * Architect muốn route khác:
 *   - Inventory → /inventory-adjustment (không có route "/inventory" trần trụi)
 *   - Purchase  → /purchase-order (không có route "/purchase" trần trụi)
 *   - Sales     → /checkout (màn hình bán hàng POS — không có route "/sales" trần trụi)
 *   - Reports   → /purchase-report (route report duy nhất hiện có trong app)
 *   - Settings  → /organization (không có route "/settings"; organization là màn hình cấu
 *     hình cấp tổ chức gần nghĩa nhất hiện có)
 *
 * Toàn bộ trang trừ Login đều nằm trong route group `(dashboard)` — yêu cầu đăng nhập. Nếu
 * chưa có session thật, kết quả chụp hợp lệ là bị redirect về `/login` (xem `capture-all.ts`
 * — không giả lập/bypass để "nhìn giống" trang thật).
 */
export interface PageConfig {
  /** Tên hiển thị trong gallery (`index.html`) và log. */
  name: string;
  /** Route path, resolve theo FRONTEND_BASE_URL (mặc định http://localhost:3001). */
  path: string;
  /** Dùng làm tên file PNG — cố định/deterministic, không đổi giữa các lần chạy. */
  slug: string;
}

export const PAGES: PageConfig[] = [
  { name: 'Login', path: '/login', slug: 'login' },
  { name: 'Dashboard', path: '/dashboard', slug: 'dashboard' },
  { name: 'Product', path: '/product', slug: 'product' },
  { name: 'Customer', path: '/customer', slug: 'customer' },
  { name: 'Inventory', path: '/inventory-adjustment', slug: 'inventory' },
  { name: 'Warehouse', path: '/warehouse', slug: 'warehouse' },
  { name: 'Supplier', path: '/supplier', slug: 'supplier' },
  { name: 'Category', path: '/category', slug: 'category' },
  { name: 'Brand', path: '/brand', slug: 'brand' },
  { name: 'Purchase', path: '/purchase-order', slug: 'purchase' },
  { name: 'Sales', path: '/checkout', slug: 'sales' },
  { name: 'Reports', path: '/purchase-report', slug: 'reports' },
  { name: 'Settings', path: '/organization', slug: 'settings' },
];
