export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type ProductType =
  'STANDARD' | 'SERVICE' | 'VARIANT_PARENT' | 'VARIANT_CHILD';
export type ProductPriceType = 'RETAIL' | 'WHOLESALE' | 'VIP' | 'DEALER';
export type BarcodeType = 'EAN13' | 'EAN8' | 'CODE128' | 'QR' | 'CUSTOM';

export interface ProductPriceEntity {
  id: string;
  type: ProductPriceType;
  price: string;
}

export interface ProductImageEntity {
  id: string;
  url: string;
  sortOrder: number;
  isThumbnail: boolean;
}

export interface ProductBarcodeEntity {
  id: string;
  code: string;
  type: BarcodeType;
  isDefault: boolean;
}

export interface ProductEntity {
  id: string;
  organizationId: string;
  categoryId: string;
  brandId: string | null;
  unitId: string;
  /** Variant Child -> Variant Parent (Decision 9) — self-reference, null với STANDARD/SERVICE/VARIANT_PARENT. */
  parentProductId: string | null;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  costPrice: string;
  vat: string;
  weight: string | null;
  length: string | null;
  width: string | null;
  height: string | null;
  minStock: string | null;
  maxStock: string | null;
  type: ProductType;
  allowSale: boolean;
  status: ProductStatus;
  isActive: boolean;
  /** Optimistic Lock (Decision A02) — tăng ở mọi UPDATE, không bao giờ reset (Decision A09). */
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  prices: ProductPriceEntity[];
  images: ProductImageEntity[];
  barcodes: ProductBarcodeEntity[];
}
