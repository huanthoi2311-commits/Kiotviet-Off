import { z } from 'zod';

/**
 * Mirrors `UpdateProductDto` — adds `version` (Optimistic Lock, SPEC-PRODUCT-001 §7.1). No
 * `prices`/`images`/`barcodes` — those have no field on `UpdateProductDto` at all (T043 AD-3);
 * prices are edited exclusively through the dedicated Product Price contract (T043.07), images/
 * barcodes are read-only on Edit (T043 AD-2/AD-3).
 */
export const editProductSchema = z
  .object({
    version: z.number().int(),
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
  })
  .refine((values) => values.type !== 'VARIANT_CHILD' || Boolean(values.parentProductId), {
    message: 'Vui lòng chọn sản phẩm cha (Variant Parent)',
    path: ['parentProductId'],
  });

export type EditProductFormValues = z.infer<typeof editProductSchema>;

/** Mirrors `ReplaceProductPriceSetDto` (T043.07) — its own concurrency token, `priceVersion`, is
 *  deliberately never mixed into `editProductSchema` above (independent concurrency boundaries,
 *  Architect Decision T043.06 §1/§2). */
export const productPriceSetSchema = z.object({
  priceVersion: z.number().int(),
  prices: z
    .array(
      z.object({
        type: z.enum(['RETAIL', 'WHOLESALE', 'VIP', 'DEALER']),
        price: z.coerce.number().min(0),
      }),
    )
    .min(1, 'Phải có ít nhất 1 mức giá')
    .refine((prices) => prices.some((p) => p.type === 'RETAIL'), {
      message: 'Phải có ít nhất 1 mức giá RETAIL',
    })
    .refine((prices) => new Set(prices.map((p) => p.type)).size === prices.length, {
      message: 'Mỗi loại giá chỉ được xuất hiện 1 lần',
    }),
});

export type ProductPriceSetFormValues = z.infer<typeof productPriceSetSchema>;
