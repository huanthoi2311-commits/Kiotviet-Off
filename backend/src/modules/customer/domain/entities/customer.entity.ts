export type CustomerStatus = 'ACTIVE' | 'INACTIVE';

export type CustomerType =
  'RETAIL' | 'WHOLESALE' | 'VIP' | 'DEALER' | 'COMPANY';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface CustomerEntity {
  id: string;
  organizationId: string;
  code: string;
  customerType: CustomerType;
  fullName: string;
  phone: string;
  email: string | null;
  birthday: Date | null;
  gender: Gender | null;
  taxCode: string | null;
  companyName: string | null;
  address: string | null;
  province: string | null;
  district: string | null;
  ward: string | null;
  avatar: string | null;
  note: string | null;
  creditLimit: string | null;
  currentDebt: string;
  totalRevenue: string;
  totalOrder: number;
  totalPoint: number;
  status: CustomerStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
