import { CustomerPointLedgerEntity } from '../domain/entities/customer-point-ledger.entity';
import { ICustomerPointRepository } from '../domain/repositories/customer-point.repository.interface';
import { CustomerPointDomainService } from './customer-point-domain.service';

describe('CustomerPointDomainService', () => {
  let service: CustomerPointDomainService;
  let customerPointRepository: jest.Mocked<
    Pick<ICustomerPointRepository, 'usePoint'>
  >;

  const makeLedger = (): CustomerPointLedgerEntity =>
    ({
      id: 'ledger-1',
      organizationId: 'org-1',
      customerId: 'customer-1',
      referenceType: 'CHECKOUT',
      referenceId: null,
      point: -100,
      balance: 400,
      expiredAt: null,
      createdBy: 'user-1',
      createdAt: new Date(),
    }) as CustomerPointLedgerEntity;

  beforeEach(() => {
    customerPointRepository = { usePoint: jest.fn() };
    service = new CustomerPointDomainService(
      customerPointRepository as unknown as ICustomerPointRepository,
    );
  });

  it('ủy quyền cho repository.usePoint kèm tx nếu có', async () => {
    customerPointRepository.usePoint.mockResolvedValue(makeLedger());
    const tx = {} as never;
    const input = {
      organizationId: 'org-1',
      customerId: 'customer-1',
      point: 100,
      referenceType: 'CHECKOUT',
      createdBy: 'user-1',
    };
    const result = await service.usePoint(input, tx);
    expect(result.balance).toBe(400);
    expect(customerPointRepository.usePoint).toHaveBeenCalledWith(input, tx);
  });

  it('hoạt động không cần tx (tự mở transaction riêng)', async () => {
    customerPointRepository.usePoint.mockResolvedValue(makeLedger());
    const input = {
      organizationId: 'org-1',
      customerId: 'customer-1',
      point: 100,
      referenceType: 'CHECKOUT',
      createdBy: 'user-1',
    };
    await service.usePoint(input);
    expect(customerPointRepository.usePoint).toHaveBeenCalledWith(
      input,
      undefined,
    );
  });
});
