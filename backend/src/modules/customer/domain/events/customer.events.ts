/** Tên sự kiện dùng làm key cho DomainEventPublisher.publish()/@OnEvent(...). */
export const CUSTOMER_CREATED_EVENT = 'customer.created';
export const CUSTOMER_UPDATED_EVENT = 'customer.updated';
export const CUSTOMER_DELETED_EVENT = 'customer.deleted';

interface CustomerDomainEventBase {
  customerId: string;
  organizationId: string;
  occurredAt: Date;
}

export type CustomerCreatedEvent = CustomerDomainEventBase;
export type CustomerUpdatedEvent = CustomerDomainEventBase;
export type CustomerDeletedEvent = CustomerDomainEventBase;
