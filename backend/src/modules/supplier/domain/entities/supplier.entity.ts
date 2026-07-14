export type SupplierStatus = 'ACTIVE' | 'INACTIVE';

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
