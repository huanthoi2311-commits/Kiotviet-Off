import {
  CustomerEntity,
  CustomerStatus,
  CustomerType,
  Gender,
} from '../entities/customer.entity';

export interface CustomerFieldsInput {
  code: string;
  customerType?: CustomerType;
  fullName: string;
  phone: string;
  email?: string | null;
  birthday?: Date | null;
  gender?: Gender | null;
  taxCode?: string | null;
  companyName?: string | null;
  address?: string | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  avatar?: string | null;
  note?: string | null;
  creditLimit?: number | null;
  status?: CustomerStatus;
}

export interface CreateCustomerInput extends CustomerFieldsInput {
  organizationId: string;
  createdBy: string;
}

export interface UpdateCustomerInput extends Partial<CustomerFieldsInput> {
  updatedBy: string;
}

export type CustomerSortField = 'code' | 'fullName' | 'createdAt' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

export interface CustomerSearchParams {
  organizationId: string;
  /** Tìm theo fullName/phone/email/companyName/taxCode (Business Rules — Prompt 031). */
  search?: string;
  customerType?: CustomerType;
  status?: CustomerStatus;
  page: number;
  limit: number;
  sortBy: CustomerSortField;
  sortOrder: SortOrder;
}

export interface CustomerSearchResult {
  items: CustomerEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface ICustomerRepository {
  create(input: CreateCustomerInput): Promise<CustomerEntity>;
  findById(id: string, organizationId: string): Promise<CustomerEntity | null>;
  findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<CustomerEntity | null>;
  update(id: string, input: UpdateCustomerInput): Promise<CustomerEntity>;
  softDelete(id: string, deletedBy: string): Promise<void>;
  restore(id: string, restoredBy: string): Promise<void>;
  search(params: CustomerSearchParams): Promise<CustomerSearchResult>;
  existsByPhone(
    organizationId: string,
    phone: string,
    excludeId?: string,
  ): Promise<boolean>;
  /**
   * Đồng bộ cache `totalPoint` từ Customer Point Ledger (nguồn sự thật) — CHỈ được gọi bởi
   * subscriber lắng nghe PointAdded/PointUsed/PointExpired (Prompt 032), không phải API ghi
   * chung `update()`. Không có tác dụng phụ nào khác (không đổi updatedAt/updatedBy).
   */
  syncTotalPoint(customerId: string, totalPoint: number): Promise<void>;
}

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');
