/** Tên sự kiện dùng làm key cho DomainEventPublisher.publish()/@OnEvent(...). */
export const POINT_ADDED_EVENT = 'point.added';
export const POINT_USED_EVENT = 'point.used';
export const POINT_EXPIRED_EVENT = 'point.expired';

/**
 * Customer module lắng nghe các sự kiện này để tự đồng bộ `Customer.totalPoint` (cache đọc
 * nhanh) — không có module nào khác được phép ghi trực tiếp vào bảng `customers`. Sổ cái
 * `CustomerPointLedger` mới là nguồn sự thật; payload chỉ cần đủ để subscriber tính lại.
 */
export interface CustomerPointDomainEvent {
  customerId: string;
  organizationId: string;
  ledgerId: string;
  point: number;
  balance: number;
  occurredAt: Date;
}
