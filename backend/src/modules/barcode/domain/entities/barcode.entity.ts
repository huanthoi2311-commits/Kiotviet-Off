import type { BarcodeType } from '../../../product/domain/entities/product.entity';

export interface BarcodeEntity {
  id: string;
  productId: string;
  unitId: string | null;
  code: string;
  type: BarcodeType;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type { BarcodeType };
