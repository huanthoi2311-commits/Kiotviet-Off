/** T011 — 3 giá trị, thay `CustomerStatus` cũ (`ACTIVE`|`INACTIVE`, dùng chung `CommonStatus`). */
export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export type CustomerType =
  'RETAIL' | 'WHOLESALE' | 'VIP' | 'DEALER' | 'COMPANY';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface CustomerEntity {
  id: string;
  organizationId: string;
  code: string;
  customerType: CustomerType;
  fullName: string;
  phone: string | null;
  email: string | null;
  birthday: Date | null;
  gender: Gender | null;
  taxCode: string | null;
  companyName: string | null;
  contactName: string | null;
  address: string | null;
  province: string | null;
  district: string | null;
  ward: string | null;
  avatar: string | null;
  note: string | null;
  creditLimit: string | null;
  paymentTermDays: number | null;
  /** @deprecated T011 Decision CR02 — không còn là dữ liệu nghiệp vụ, KHÔNG cho Create/Update ghi. */
  currentDebt: string;
  /** @deprecated T011 Decision CR03 — system-maintained projection, KHÔNG expose trong Create/Update DTO input. */
  totalRevenue: string;
  /** @deprecated T011 Decision CR03 — system-maintained projection, KHÔNG expose trong Create/Update DTO input. */
  totalOrder: number;
  /** system-maintained projection (T011 Decision CR04) — CHỈ Customer Point workflow được cập nhật. */
  totalPoint: number;
  status: CustomerStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
