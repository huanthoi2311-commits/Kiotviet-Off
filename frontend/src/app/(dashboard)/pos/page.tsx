'use client';

import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { useCartControllerGetCart } from '@/generated/cart/cart';
import { CartPanel } from '@/features/checkout/components/cart-panel';
import { CheckoutForm } from '@/features/checkout/components/checkout-form';

/** T046 §4/§5 — POS page: Cart (left) + Checkout (right), one combined screen. */
export default function PosPage() {
  const { data: cart } = useCartControllerGetCart();
  const cartIsEmpty = !cart || cart.items.length === 0;

  return (
    <PermissionGate code="pos:access">
      <PageHeader title="Bán hàng" breadcrumbs={[{ label: 'Bán hàng' }]} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CartPanel />
        </div>
        <div className="rounded-lg border p-4">
          <h2 className="mb-4 text-base font-medium">Thanh toán</h2>
          <CheckoutForm cartIsEmpty={cartIsEmpty} />
        </div>
      </div>
    </PermissionGate>
  );
}
