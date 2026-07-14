export type WarehouseType =
  'MAIN' | 'RETAIL' | 'ONLINE' | 'RETURN' | 'DAMAGED' | 'TRANSIT' | 'CUSTOM';

export type WarehouseStatus = 'ACTIVE' | 'INACTIVE';

export interface WarehouseEntity {
  id: string;
  organizationId: string;
  branchId: string;
  managerId: string | null;
  code: string;
  name: string;
  type: WarehouseType;
  address: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  status: WarehouseStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
