import { z } from 'zod';

/** Mirrors `CreateProductPriceDto` — `type`/`price`, same shape used by the Price editor (T043.07). */
export const productPriceItemSchema = z.object({
  type: z.enum(['RETAIL', 'WHOLESALE', 'VIP', 'DEALER']),
  price: z.coerce.number().min(0),
});

export const productImageItemSchema = z.object({
  url: z.string().min(1, 'URL không được để trống'),
  isThumbnail: z.boolean().optional(),
});

export const productBarcodeItemSchema = z.object({
  code: z.string().min(1, 'Mã vạch không được để trống'),
  type: z.enum(['EAN13', 'EAN8', 'CODE128', 'QR', 'CUSTOM']),
  isDefault: z.boolean().optional(),
});

/**
 * Mirrors `CreateProductDto` (SPEC-PRODUCT-001, T043) field-for-field. `prices` requires at least
 * 1 RETAIL row — enforced here to match the backend's own `assertHasRetailPrice()` (service layer,
 * not just DTO `ArrayMinSize(1)`), so the frontend doesn't invent a laxer rule than the API actually
 * accepts. `parentProductId` required only when `type=VARIANT_CHILD` — refined below.
 */
export const createProductSchema = z
  .object({
    categoryId: z.string().min(1, 'Vui lòng chọn danh mục'),
    brandId: z.string().optional(),
    unitId: z.string().min(1, 'Vui lòng chọn đơn vị tính'),
    type: z.enum(['STANDARD', 'SERVICE', 'VARIANT_PARENT', 'VARIANT_CHILD']),
    parentProductId: z.string().optional(),
    name: z.string().min(3, 'Tên sản phẩm phải từ 3 đến 255 ký tự').max(255),
    description: z.string().optional(),
    costPrice: z.coerce.number().min(0),
    vat: z.coerce.number().min(0).max(100).optional(),
    weight: z.coerce.number().min(0).optional(),
    length: z.coerce.number().min(0).optional(),
    width: z.coerce.number().min(0).optional(),
    height: z.coerce.number().min(0).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
    prices: z
      .array(productPriceItemSchema)
      .min(1, 'Sản phẩm phải có ít nhất 1 mức giá')
      .refine((prices) => prices.some((p) => p.type === 'RETAIL'), {
        message: 'Sản phẩm phải có ít nhất 1 mức giá RETAIL',
      }),
    images: z.array(productImageItemSchema).optional(),
    barcodes: z.array(productBarcodeItemSchema).optional(),
  })
  .refine((values) => values.type !== 'VARIANT_CHILD' || Boolean(values.parentProductId), {
    message: 'Vui lòng chọn sản phẩm cha (Variant Parent)',
    path: ['parentProductId'],
  });

export type CreateProductFormValues = z.input<typeof createProductSchema>;
export type CreateProductFormOutput = z.output<typeof createProductSchema>;
