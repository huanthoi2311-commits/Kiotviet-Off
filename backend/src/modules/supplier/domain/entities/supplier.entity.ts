/** T012 — 3 giá trị, thay `CommonStatus` cũ (`ACTIVE`|`INACTIVE`, dùng chung 5 model khác). */
export type SupplierStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface SupplierEntity {
  id: string;
  organizationId: string;
  code: string;
  taxCode: string | null;
  companyName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  province: string | null;
  district: string | null;
  ward: string | null;
  bankName: string | null;
  bankAccount: string | null;
  paymentTerm: number | null;
  creditLimit: string | null;
  status: SupplierStatus;
  /** Optimistic Lock (T012 SPEC BR09) — áp dụng Update/Activate/Deactivate/Archive/Restore. */
  version: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface SupplierProductEntity {
  id: string;
  supplierId: string;
  productId: string;
  supplierSku: string | null;
  priority: number | null;
  defaultPrice: string | null;
  leadTime: number | null;
  minimumOrderQuantity: string | null;
  createdAt: Date;
  updatedAt: Date;
}
