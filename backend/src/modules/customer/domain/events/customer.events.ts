/** Tên sự kiện dùng làm key cho DomainEventPublisher.publish()/@OnEvent(...). */
export const CUSTOMER_CREATED_EVENT = 'customer.created';
export const CUSTOMER_UPDATED_EVENT = 'customer.updated';
export const CUSTOMER_DELETED_EVENT = 'customer.deleted';
/** T011 — mới, giữ nguyên tên event `customer.deleted`/`.restored` dù ý nghĩa là Archive/Restore, không hard delete. */
export const CUSTOMER_RESTORED_EVENT = 'customer.restored';
export const CUSTOMER_ACTIVATED_EVENT = 'customer.activated';
export const CUSTOMER_DEACTIVATED_EVENT = 'customer.deactivated';

interface CustomerDomainEventBase {
  customerId: string;
  organizationId: string;
  occurredAt: Date;
}

export type CustomerCreatedEvent = CustomerDomainEventBase;
export type CustomerUpdatedEvent = CustomerDomainEventBase;
export type CustomerDeletedEvent = CustomerDomainEventBase;
export type CustomerRestoredEvent = CustomerDomainEventBase;
export type CustomerActivatedEvent = CustomerDomainEventBase;
export type CustomerDeactivatedEvent = CustomerDomainEventBase;
