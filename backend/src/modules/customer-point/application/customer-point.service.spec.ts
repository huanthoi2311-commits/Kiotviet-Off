import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { DomainEventPublisher } from '../../platform/events/domain-event-publisher.service';
import { CustomerDomainService } from '../../customer/application/customer-domain.service';
import { CustomerEntity } from '../../customer/domain/entities/customer.entity';
import { CustomerPointLedgerEntity } from '../domain/entities/customer-point-ledger.entity';
import {
  POINT_ADDED_EVENT,
  POINT_USED_EVENT,
} from '../domain/events/customer-point.events';
import {
  CustomerPointInsufficientBalanceError,
  ICustomerPointRepository,
} from '../domain/repositories/customer-point.repository.interface';
import { ActorContext, CustomerPointService } from './customer-point.service';

describe('CustomerPointService', () => {
  let service: CustomerPointService;
  let customerPointRepository: jest.Mocked<ICustomerPointRepository>;
  let customerDomainService: jest.Mocked<
    Pick<CustomerDomainService, 'findById'>
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;
  let eventPublisher: jest.Mocked<Pick<DomainEventPublisher, 'publish'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeCustomer = (): CustomerEntity =>
    ({ id: 'cus-1', organizationId: 'org-1' }) as CustomerEntity;

  const makeLedgerEntry = (
    overrides: Partial<CustomerPointLedgerEntity> = {},
  ): CustomerPointLedgerEntity => ({
    id: 'ledger-1',
    organizationId: 'org-1',
    customerId: 'cus-1',
    referenceType: null,
    referenceId: null,
    point: 100,
    balance: 100,
    expiredAt: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });

  beforeEach(() => {
    customerPointRepository = {
      addPoint: jest.fn(),
      usePoint: jest.fn(),
      getHistory: jest.fn(),
      getBalance: jest.fn(),
    };
    customerDomainService = { findById: jest.fn() };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    eventPublisher = { publish: jest.fn() };

    service = new CustomerPointService(
      customerPointRepository,
      customerDomainService as unknown as CustomerDomainService,
      auditLogService as unknown as AuditLogService,
      eventPublisher as unknown as DomainEventPublisher,
    );
  });

  describe('addPoint', () => {
    it('ném NotFoundException khi customer không tồn tại', async () => {
      customerDomainService.findById.mockResolvedValue(null);
      await expect(
        service.addPoint({ customerId: 'cus-1', point: 100 }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('cộng điểm thành công, ghi audit log và publish PointAdded', async () => {
      customerDomainService.findById.mockResolvedValue(makeCustomer());
      customerPointRepository.addPoint.mockResolvedValue(makeLedgerEntry());

      const result = await service.addPoint(
        { customerId: 'cus-1', point: 100, referenceType: 'ORDER' },
        actor,
      );

      expect(result.balance).toBe(100);
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'customer_point.add' }),
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        POINT_ADDED_EVENT,
        expect.objectContaining({
          customerId: 'cus-1',
          balance: 100,
        }),
      );
    });
  });

  describe('usePoint', () => {
    it('ném NotFoundException khi customer không tồn tại', async () => {
      customerDomainService.findById.mockResolvedValue(null);
      await expect(
        service.usePoint({ customerId: 'cus-1', point: 30 }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('dùng điểm thành công, ghi audit log và publish PointUsed', async () => {
      customerDomainService.findById.mockResolvedValue(makeCustomer());
      customerPointRepository.usePoint.mockResolvedValue(
        makeLedgerEntry({ point: -30, balance: 70 }),
      );

      const result = await service.usePoint(
        { customerId: 'cus-1', point: 30 },
        actor,
      );

      expect(result.balance).toBe(70);
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        POINT_USED_EVENT,
        expect.objectContaining({ balance: 70 }),
      );
    });

    it('dịch CustomerPointInsufficientBalanceError sang UnprocessableEntityException', async () => {
      customerDomainService.findById.mockResolvedValue(makeCustomer());
      customerPointRepository.usePoint.mockRejectedValue(
        new CustomerPointInsufficientBalanceError('cus-1', 10),
      );

      await expect(
        service.usePoint({ customerId: 'cus-1', point: 999 }, actor),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('getHistory', () => {
    it('ném NotFoundException khi customer không tồn tại', async () => {
      customerDomainService.findById.mockResolvedValue(null);
      await expect(
        service.getHistory({ customerId: 'cus-1' }, 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('trả về lịch sử phân trang với page/limit mặc định', async () => {
      customerDomainService.findById.mockResolvedValue(makeCustomer());
      customerPointRepository.getHistory.mockResolvedValue({
        items: [makeLedgerEntry()],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await service.getHistory({ customerId: 'cus-1' }, 'org-1');
      expect(result.total).toBe(1);
      expect(customerPointRepository.getHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          customerId: 'cus-1',
          page: 1,
          limit: 20,
        }),
      );
    });
  });
});
