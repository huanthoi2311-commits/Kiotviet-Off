import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { DomainEventPublisher } from '../../platform/events/domain-event-publisher.service';
import { CustomerEntity } from '../domain/entities/customer.entity';
import {
  CUSTOMER_CREATED_EVENT,
  CUSTOMER_DELETED_EVENT,
  CUSTOMER_UPDATED_EVENT,
} from '../domain/events/customer.events';
import { ICustomerRepository } from '../domain/repositories/customer.repository.interface';
import { ICustomerCodeGenerator } from '../domain/services/customer-code-generator.interface';
import { ActorContext, CustomerService } from './customer.service';

describe('CustomerService', () => {
  let service: CustomerService;
  let customerRepository: jest.Mocked<ICustomerRepository>;
  let codeGenerator: jest.Mocked<ICustomerCodeGenerator>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;
  let eventPublisher: jest.Mocked<Pick<DomainEventPublisher, 'publish'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeCustomer = (
    overrides: Partial<CustomerEntity> = {},
  ): CustomerEntity => ({
    id: 'cus-1',
    organizationId: 'org-1',
    code: 'CUS000001',
    customerType: 'RETAIL',
    fullName: 'Nguyễn Văn A',
    phone: '0987654321',
    email: null,
    birthday: null,
    gender: null,
    taxCode: null,
    companyName: null,
    address: null,
    province: null,
    district: null,
    ward: null,
    avatar: null,
    note: null,
    creditLimit: null,
    currentDebt: '0',
    totalRevenue: '0',
    totalOrder: 0,
    totalPoint: 0,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    customerRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdIncludingDeleted: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      search: jest.fn(),
      existsByPhone: jest.fn(),
      syncTotalPoint: jest.fn(),
    };
    codeGenerator = { generate: jest.fn().mockResolvedValue('CUS000001') };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    eventPublisher = { publish: jest.fn() };

    service = new CustomerService(
      customerRepository,
      codeGenerator,
      auditLogService as unknown as AuditLogService,
      eventPublisher as unknown as DomainEventPublisher,
    );
  });

  describe('create', () => {
    it('sinh code, tạo thành công, ghi audit log và publish CustomerCreated', async () => {
      customerRepository.create.mockResolvedValue(makeCustomer());

      const result = await service.create(
        { fullName: 'Nguyễn Văn A', phone: '0987654321' },
        actor,
      );

      expect(result.code).toBe('CUS000001');
      expect(codeGenerator.generate).toHaveBeenCalledWith('org-1');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'customer.create' }),
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        CUSTOMER_CREATED_EVENT,
        expect.objectContaining({
          customerId: 'cus-1',
          organizationId: 'org-1',
        }),
      );
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      customerRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('trả về customer khi tồn tại', async () => {
      customerRepository.findById.mockResolvedValue(makeCustomer());
      const result = await service.findOne('cus-1', 'org-1');
      expect(result.id).toBe('cus-1');
    });
  });

  describe('search', () => {
    it('map query sang search params với page/limit/sort mặc định', async () => {
      customerRepository.search.mockResolvedValue({
        items: [makeCustomer()],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({ search: 'Nguyễn' }, 'org-1');
      expect(result.total).toBe(1);
      expect(customerRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          search: 'Nguyễn',
          page: 1,
          limit: 20,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        }),
      );
    });
  });

  describe('update', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      customerRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { fullName: 'B' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('cập nhật thành công, ghi audit log và publish CustomerUpdated', async () => {
      customerRepository.findById.mockResolvedValue(makeCustomer());
      customerRepository.update.mockResolvedValue(
        makeCustomer({ fullName: 'Nguyễn Văn B' }),
      );

      const result = await service.update(
        'cus-1',
        { fullName: 'Nguyễn Văn B' },
        actor,
      );

      expect(result.fullName).toBe('Nguyễn Văn B');
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        CUSTOMER_UPDATED_EVENT,
        expect.objectContaining({ customerId: 'cus-1' }),
      );
    });

    it('chuyển đổi birthday dạng chuỗi ISO sang Date trước khi ghi', async () => {
      customerRepository.findById.mockResolvedValue(makeCustomer());
      customerRepository.update.mockResolvedValue(makeCustomer());

      await service.update(
        'cus-1',
        { birthday: '1990-01-01T00:00:00.000Z' },
        actor,
      );

      expect(customerRepository.update).toHaveBeenCalledWith(
        'cus-1',
        expect.objectContaining({
          birthday: new Date('1990-01-01T00:00:00.000Z'),
        }),
      );
    });
  });

  describe('remove', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      customerRepository.findById.mockResolvedValue(null);
      await expect(service.remove('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('xóa mềm thành công, ghi audit log và publish CustomerDeleted', async () => {
      customerRepository.findById.mockResolvedValue(makeCustomer());
      await service.remove('cus-1', actor);

      expect(customerRepository.softDelete).toHaveBeenCalledWith(
        'cus-1',
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'customer.delete' }),
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        CUSTOMER_DELETED_EVENT,
        expect.objectContaining({ customerId: 'cus-1' }),
      );
    });
  });

  describe('restore', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      customerRepository.findByIdIncludingDeleted.mockResolvedValue(null);
      await expect(service.restore('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ném UnprocessableEntityException khi chưa bị xóa', async () => {
      customerRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeCustomer({ deletedAt: null }),
      );
      await expect(service.restore('cus-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('khôi phục thành công và ghi audit log', async () => {
      customerRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeCustomer({ deletedAt: new Date('2026-02-01') }),
      );
      customerRepository.findById.mockResolvedValue(makeCustomer());

      const result = await service.restore('cus-1', actor);
      expect(result.id).toBe('cus-1');
      expect(customerRepository.restore).toHaveBeenCalledWith(
        'cus-1',
        'user-1',
      );
    });
  });
});
