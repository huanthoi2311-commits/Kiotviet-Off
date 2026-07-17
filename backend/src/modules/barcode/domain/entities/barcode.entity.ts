import type { BarcodeType } from '../../../product/domain/entities/product.entity';

export type BarcodeStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface BarcodeEntity {
  id: string;
  organizationId: string;
  productId: string;
  unitId: string | null;
  code: string;
  type: BarcodeType;
  isDefault: boolean;
  status: BarcodeStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type { BarcodeType };
