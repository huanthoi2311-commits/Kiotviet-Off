import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEventPublisher } from './domain-event-publisher.service';

describe('DomainEventPublisher', () => {
  it('ủy quyền emit() cho EventEmitter2 với đúng tên sự kiện và payload', () => {
    const emit = jest.fn();
    const publisher = new DomainEventPublisher({
      emit,
    } as unknown as EventEmitter2);

    const payload = { customerId: 'c-1', organizationId: 'org-1' };
    publisher.publish('customer.created', payload);

    expect(emit).toHaveBeenCalledWith('customer.created', payload);
  });
});
