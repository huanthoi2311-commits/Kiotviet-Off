export interface PermissionSeed {
  code: string;
  group: string;
  description: string;
}

const crud = (
  group: string,
  label: string,
  extra: string[] = [],
): PermissionSeed[] => [
  { code: `${group}:view`, group, description: `Xem ${label}` },
  { code: `${group}:create`, group, description: `Tạo ${label}` },
  { code: `${group}:update`, group, description: `Sửa ${label}` },
  { code: `${group}:delete`, group, description: `Xóa ${label}` },
  ...extra.map((action) => ({
    code: `${group}:${action}`,
    group,
    description: `${action} ${label}`,
  })),
];

/**
 * Danh mục quyền hệ thống theo resource:action (Prompt 015).
 * Đây là seed cố định — không đổi theo tenant (bảng `permissions` là global).
 */
export const PERMISSION_CATALOG: PermissionSeed[] = [
  { code: 'dashboard:view', group: 'dashboard', description: 'Xem tổng quan' },
  {
    code: 'pos:access',
    group: 'pos',
    description: 'Truy cập màn hình bán hàng',
  },
  ...crud('product', 'sản phẩm', ['restore']),
  ...crud('category', 'danh mục ngành hàng'),
  ...crud('brand', 'thương hiệu'),
  ...crud('unit', 'đơn vị tính'),
  ...crud('warehouse', 'kho'),
  { code: 'inventory:view', group: 'inventory', description: 'Xem tồn kho' },
  {
    code: 'inventory:adjust',
    group: 'inventory',
    description: 'Điều chỉnh/kiểm kê tồn kho',
  },
  { code: 'inventory:transfer', group: 'inventory', description: 'Chuyển kho' },
  ...crud('purchase', 'đơn nhập hàng'),
  ...crud('supplier', 'nhà cung cấp'),
  ...crud('customer', 'khách hàng'),
  { code: 'order:view', group: 'order', description: 'Xem đơn hàng' },
  { code: 'order:create', group: 'order', description: 'Tạo đơn hàng' },
  { code: 'order:update', group: 'order', description: 'Sửa đơn hàng' },
  { code: 'order:cancel', group: 'order', description: 'Hủy đơn hàng' },
  { code: 'order:return', group: 'order', description: 'Trả hàng' },
  { code: 'invoice:view', group: 'invoice', description: 'Xem hóa đơn' },
  {
    code: 'payment:view',
    group: 'payment',
    description: 'Xem giao dịch thanh toán',
  },
  {
    code: 'payment:create',
    group: 'payment',
    description: 'Ghi nhận thanh toán',
  },
  { code: 'debt:view', group: 'debt', description: 'Xem công nợ' },
  { code: 'cashbook:view', group: 'cashbook', description: 'Xem sổ quỹ' },
  {
    code: 'cashbook:create',
    group: 'cashbook',
    description: 'Tạo phiếu thu/chi',
  },
  ...crud('expense', 'chi phí'),
  ...crud('promotion', 'khuyến mãi'),
  ...crud('voucher', 'mã giảm giá'),
  { code: 'point:view', group: 'point', description: 'Xem điểm tích lũy' },
  { code: 'delivery:view', group: 'delivery', description: 'Xem vận đơn' },
  {
    code: 'delivery:update',
    group: 'delivery',
    description: 'Cập nhật trạng thái giao hàng',
  },
  { code: 'report:view', group: 'report', description: 'Xem báo cáo' },
  { code: 'report:export', group: 'report', description: 'Xuất báo cáo' },
  {
    code: 'audit_log:view',
    group: 'audit_log',
    description: 'Xem nhật ký hệ thống',
  },
  {
    code: 'notification:view',
    group: 'notification',
    description: 'Xem thông báo',
  },
  ...crud('user', 'nhân viên'),
  ...crud('role', 'vai trò'),
  {
    code: 'permission:view',
    group: 'permission',
    description: 'Xem danh mục quyền',
  },
  { code: 'setting:view', group: 'setting', description: 'Xem cài đặt' },
  { code: 'setting:update', group: 'setting', description: 'Sửa cài đặt' },
  { code: 'file:view', group: 'file', description: 'Xem tệp' },
  { code: 'file:upload', group: 'file', description: 'Tải tệp lên' },
  { code: 'file:delete', group: 'file', description: 'Xóa tệp' },
  ...crud('webhook', 'webhook'),
  ...crud('branch', 'chi nhánh'),
];
