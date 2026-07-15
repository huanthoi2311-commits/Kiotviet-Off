import { Prisma } from '@prisma/client';

export interface CartItemEntity {
  productId: string;
  productName: string;
  /** Decimal(18,3) dạng string — hỗ trợ sản phẩm bán theo cân/khối lượng, cùng quy ước Product.minStock. */
  quantity: string;
  /** Snapshot giá RETAIL tại thời điểm add — không tự đổi khi Product đổi giá, trừ khi add lại. */
  price: string;
  /** Discount/Promotion/Voucher luôn "0.00" ở Prompt 033 — Cart Engine chỉ lưu giỏ hàng, không tự
   *  áp khuyến mãi (Discount Engine, Prompt 034, chỉ chạy ở bước Checkout, Prompt 035). */
  discount: string;
  promotion: string;
  voucher: string;
  /** Tính sẵn theo Product.vat vì đây là thuộc tính có sẵn của Product (Foundation), không phụ
   *  thuộc module nào chưa tồn tại — khác Discount/Promotion/Voucher. */
  tax: string;
  total: string;
}

export interface CartEntity {
  organizationId: string;
  userId: string;
  items: CartItemEntity[];
  subtotal: string;
  totalDiscount: string;
  totalPromotion: string;
  totalVoucher: string;
  totalTax: string;
  totalAmount: string;
  updatedAt: string;
}

export function emptyCart(organizationId: string, userId: string): CartEntity {
  return {
    organizationId,
    userId,
    items: [],
    subtotal: '0.00',
    totalDiscount: '0.00',
    totalPromotion: '0.00',
    totalVoucher: '0.00',
    totalTax: '0.00',
    totalAmount: '0.00',
    updatedAt: new Date().toISOString(),
  };
}

export interface BuildCartItemInput {
  productId: string;
  productName: string;
  quantity: Prisma.Decimal;
  price: Prisma.Decimal;
  vatPercent: Prisma.Decimal;
}

export function buildCartItem(input: BuildCartItemInput): CartItemEntity {
  const lineSubtotal = input.price.mul(input.quantity);
  const tax = lineSubtotal.mul(input.vatPercent).div(100);
  const total = lineSubtotal.plus(tax);
  return {
    productId: input.productId,
    productName: input.productName,
    quantity: input.quantity.toFixed(3),
    price: input.price.toFixed(2),
    discount: '0.00',
    promotion: '0.00',
    voucher: '0.00',
    tax: tax.toFixed(2),
    total: total.toFixed(2),
  };
}

/** Tính lại tax/total của 1 dòng khi quantity thay đổi nhưng price/vat giữ nguyên (PATCH /cart/update). */
export function recalculateCartItem(
  item: CartItemEntity,
  quantity: Prisma.Decimal,
  vatPercent: Prisma.Decimal,
): CartItemEntity {
  const price = new Prisma.Decimal(item.price);
  const lineSubtotal = price.mul(quantity);
  const tax = lineSubtotal.mul(vatPercent).div(100);
  const total = lineSubtotal.plus(tax);
  return {
    ...item,
    quantity: quantity.toFixed(3),
    tax: tax.toFixed(2),
    total: total.toFixed(2),
  };
}

export function recalculateCartTotals(cart: CartEntity): CartEntity {
  const zero = new Prisma.Decimal(0);
  let subtotal = zero;
  let totalDiscount = zero;
  let totalPromotion = zero;
  let totalVoucher = zero;
  let totalTax = zero;

  for (const item of cart.items) {
    const price = new Prisma.Decimal(item.price);
    const quantity = new Prisma.Decimal(item.quantity);
    subtotal = subtotal.plus(price.mul(quantity));
    totalDiscount = totalDiscount.plus(new Prisma.Decimal(item.discount));
    totalPromotion = totalPromotion.plus(new Prisma.Decimal(item.promotion));
    totalVoucher = totalVoucher.plus(new Prisma.Decimal(item.voucher));
    totalTax = totalTax.plus(new Prisma.Decimal(item.tax));
  }

  const totalAmount = subtotal
    .minus(totalDiscount)
    .minus(totalPromotion)
    .minus(totalVoucher)
    .plus(totalTax);

  return {
    ...cart,
    subtotal: subtotal.toFixed(2),
    totalDiscount: totalDiscount.toFixed(2),
    totalPromotion: totalPromotion.toFixed(2),
    totalVoucher: totalVoucher.toFixed(2),
    totalTax: totalTax.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    updatedAt: new Date().toISOString(),
  };
}
