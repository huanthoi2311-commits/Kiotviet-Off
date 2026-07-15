export const CHECKOUT_COMPLETED_EVENT = 'checkout.completed';
export const CHECKOUT_FAILED_EVENT = 'checkout.failed';

export interface CheckoutCompletedEvent {
  organizationId: string;
  userId: string;
  customerId: string | null;
  invoiceId: string;
  paymentId: string;
  totalAmount: string;
  occurredAt: Date;
}

export interface CheckoutFailedEvent {
  organizationId: string;
  userId: string;
  customerId: string | null;
  reason: string;
  occurredAt: Date;
}
