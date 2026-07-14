import { SupplierProductEntity } from '../entities/supplier.entity';

export interface UpsertSupplierProductInput {
  supplierId: string;
  productId: string;
  supplierSku?: string | null;
  priority?: number | null;
  defaultPrice?: number | null;
  leadTime?: number | null;
  minimumOrderQuantity?: number | null;
  actorId: string;
}

export interface ISupplierProductRepository {
  /** Tạo mới hoặc cập nhật ánh xạ Supplier-Product (unique theo cặp supplierId+productId). */
  upsert(input: UpsertSupplierProductInput): Promise<SupplierProductEntity>;
  listBySupplier(
    supplierId: string,
    organizationId: string,
  ): Promise<SupplierProductEntity[]>;
  findOne(
    supplierId: string,
    productId: string,
    organizationId: string,
  ): Promise<SupplierProductEntity | null>;
  remove(
    supplierId: string,
    productId: string,
    deletedBy: string,
  ): Promise<void>;
}

export const SUPPLIER_PRODUCT_REPOSITORY = Symbol(
  'SUPPLIER_PRODUCT_REPOSITORY',
);
