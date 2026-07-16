export type BranchStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

/// `isMain` = "Branch mặc định" — SPEC-BRANCH-001 nói "Chỉ một Branch mặc định cho mỗi
/// Organization" (đặt qua POST /branches/:id/set-default), field có sẵn từ Foundation khớp
/// đúng nghĩa này nên giữ nguyên tên, không đổi thành `isDefault`.
export interface BranchEntity {
  id: string;
  organizationId: string;
  managerUserId: string | null;
  defaultWarehouseId: string | null;
  code: string;
  name: string;
  email: string | null;
  address: string | null;
  province: string | null;
  district: string | null;
  ward: string | null;
  phone: string | null;
  invoicePrefix: string | null;
  receiptPrefix: string | null;
  timezone: string;
  currencyCode: string;
  isMain: boolean;
  status: BranchStatus;
  createdAt: Date;
  updatedAt: Date;
}
