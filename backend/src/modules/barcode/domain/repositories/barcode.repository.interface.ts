import { BarcodeEntity, BarcodeType } from '../entities/barcode.entity';

export interface CreateBarcodeInput {
  productId: string;
  organizationId: string;
  unitId?: string | null;
  code: string;
  type: BarcodeType;
  isDefault?: boolean;
  createdBy: string;
}

export interface UpdateBarcodeInput {
  code?: string;
  type?: BarcodeType;
  unitId?: string | null;
  updatedBy: string;
}

export interface IBarcodeRepository {
  create(input: CreateBarcodeInput): Promise<BarcodeEntity>;
  findById(id: string, organizationId: string): Promise<BarcodeEntity | null>;
  listByProduct(
    productId: string,
    organizationId: string,
  ): Promise<BarcodeEntity[]>;
  update(id: string, input: UpdateBarcodeInput): Promise<BarcodeEntity>;
  softDelete(id: string, deletedBy: string): Promise<void>;
  setDefault(
    id: string,
    productId: string,
    updatedBy: string,
  ): Promise<BarcodeEntity>;
  existsByCode(code: string, excludeId?: string): Promise<boolean>;
}

export const BARCODE_REPOSITORY = Symbol('BARCODE_REPOSITORY');
