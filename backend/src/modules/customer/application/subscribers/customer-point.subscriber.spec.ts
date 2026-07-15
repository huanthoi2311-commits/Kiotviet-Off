import { ICustomerRepository } from '../../domain/repositories/customer.repository.interface';
import { CustomerPointSubscriber } from './customer-point.subscriber';

describe('CustomerPointSubscriber', () => {
  let subscriber: CustomerPointSubscriber;
  let customerRepository: jest.Mocked<
    Pick<ICustomerRepository, 'syncTotalPoint'>
  >;

  const event = {
    customerId: 'cus-1',
    organizationId: 'org-1',
    ledgerId: 'ledger-1',
    point: 100,
    balance: 250,
    occurredAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    customerRepository = { syncTotalPoint: jest.fn() };
    subscriber = new CustomerPointSubscriber(
      customerRepository as unknown as ICustomerRepository,
    );
  });

  it('onPointAdded đồng bộ totalPoint = balance của sự kiện', async () => {
    await subscriber.onPointAdded(event);
    expect(customerRepository.syncTotalPoint).toHaveBeenCalledWith(
      'cus-1',
      250,
    );
  });

  it('onPointUsed đồng bộ totalPoint = balance của sự kiện', async () => {
    await subscriber.onPointUsed({ ...event, point: -30, balance: 220 });
    expect(customerRepository.syncTotalPoint).toHaveBeenCalledWith(
      'cus-1',
      220,
    );
  });

  it('onPointExpired đồng bộ totalPoint = balance của sự kiện', async () => {
    await subscriber.onPointExpired({ ...event, point: -10, balance: 240 });
    expect(customerRepository.syncTotalPoint).toHaveBeenCalledWith(
      'cus-1',
      240,
    );
  });
});
