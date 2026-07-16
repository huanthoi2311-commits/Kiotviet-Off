export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
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
  isService: boolean;
  allowSale: boolean;
  status: ProductStatus;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  prices: ProductPriceEntity[];
  images: ProductImageEntity[];
  barcodes: ProductBarcodeEntity[];
}
