import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { DomainEventPublisher } from '../../platform/events/domain-event-publisher.service';
import { CustomerEntity } from '../domain/entities/customer.entity';
import { CustomerConcurrencyConflictError } from '../domain/errors/customer.errors';
import {
  CUSTOMER_ACTIVATED_EVENT,
  CUSTOMER_CREATED_EVENT,
  CUSTOMER_DEACTIVATED_EVENT,
  CUSTOMER_DELETED_EVENT,
  CUSTOMER_RESTORED_EVENT,
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
    contactName: null,
    address: null,
    province: null,
    district: null,
    ward: null,
    avatar: null,
    note: null,
    creditLimit: null,
    paymentTermDays: null,
    currentDebt: '0',
    totalRevenue: '0',
    totalOrder: 0,
    totalPoint: 0,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    customerRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findByIdIncludingDeleted: jest.fn(),
      update: jest.fn(),
      changeStatusWithVersion: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      search: jest.fn(),
      existsByCode: jest.fn(),
      syncTotalPoint: jest.fn(),
    };
    codeGenerator = { generate: jest.fn().mockResolvedValue('CUS000001') };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    eventPublisher = { publish: jest.fn() };
    customerRepository.existsByCode.mockResolvedValue(false);

    service = new CustomerService(
      customerRepository,
      codeGenerator,
      auditLogService as unknown as AuditLogService,
      eventPublisher as unknown as DomainEventPublisher,
    );
  });

  describe('create', () => {
    it('không có code — sinh code qua generator, tạo thành công, ghi audit log và publish CustomerCreated', async () => {
      customerRepository.create.mockResolvedValue(makeCustomer());

      const result = await service.create(
        { fullName: 'Nguyễn Văn A', phone: '0987654321' },
        actor,
      );

      expect(result.code).toBe('CUS000001');
      expect(codeGenerator.generate).toHaveBeenCalledWith('org-1');
      expect(customerRepository.existsByCode).not.toHaveBeenCalled();
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

    it('có code — trim + uppercase, check existsByCode, không gọi generator', async () => {
      customerRepository.create.mockResolvedValue(
        makeCustomer({ code: 'ABC123' }),
      );

      await service.create(
        { fullName: 'Nguyễn Văn A', code: ' abc123 ' },
        actor,
      );

      expect(codeGenerator.generate).not.toHaveBeenCalled();
      expect(customerRepository.existsByCode).toHaveBeenCalledWith(
        'org-1',
        'ABC123',
      );
      expect(customerRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'ABC123' }),
      );
    });

    it('ném ConflictException khi code client cung cấp đã tồn tại', async () => {
      customerRepository.existsByCode.mockResolvedValue(true);
      await expect(
        service.create({ fullName: 'X', code: 'DUP' }, actor),
      ).rejects.toThrow(ConflictException);
      expect(customerRepository.create).not.toHaveBeenCalled();
    });

    it('tạo thành công không có phone (phone tùy chọn)', async () => {
      customerRepository.create.mockResolvedValue(
        makeCustomer({ phone: null }),
      );
      const result = await service.create({ fullName: 'Nguyễn Văn A' }, actor);
      expect(result.phone).toBeNull();
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
    it('map query sang search params với page/limit/sort mặc định (fullName asc)', async () => {
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
          sortBy: 'fullName',
          sortOrder: 'asc',
        }),
      );
    });
  });

  describe('update (Optimistic Lock — BR09)', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      customerRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { version: 1, fullName: 'B' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('cập nhật thành công, ghi audit log và publish CustomerUpdated', async () => {
      customerRepository.findById.mockResolvedValue(makeCustomer());
      customerRepository.update.mockResolvedValue(
        makeCustomer({ fullName: 'Nguyễn Văn B', version: 2 }),
      );

      const result = await service.update(
        'cus-1',
        { version: 1, fullName: 'Nguyễn Văn B' },
        actor,
      );

      expect(result.fullName).toBe('Nguyễn Văn B');
      expect(customerRepository.update).toHaveBeenCalledWith(
        'cus-1',
        'org-1',
        1,
        expect.objectContaining({ fullName: 'Nguyễn Văn B' }),
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        CUSTOMER_UPDATED_EVENT,
        expect.objectContaining({ customerId: 'cus-1' }),
      );
    });

    it('ném Conflict (409) khi version không khớp', async () => {
      customerRepository.findById.mockResolvedValue(makeCustomer());
      customerRepository.update.mockRejectedValue(
        new CustomerConcurrencyConflictError('cus-1'),
      );
      await expect(
        service.update('cus-1', { version: 1, fullName: 'B' }, actor),
      ).rejects.toThrow(ConflictException);
    });

    it('chuyển đổi birthday dạng chuỗi ISO sang Date trước khi ghi', async () => {
      customerRepository.findById.mockResolvedValue(makeCustomer());
      customerRepository.update.mockResolvedValue(makeCustomer());

      await service.update(
        'cus-1',
        { version: 1, birthday: '1990-01-01T00:00:00.000Z' },
        actor,
      );

      expect(customerRepository.update).toHaveBeenCalledWith(
        'cus-1',
        'org-1',
        1,
        expect.objectContaining({
          birthday: new Date('1990-01-01T00:00:00.000Z'),
        }),
      );
    });

    it('Projection Test (Decision SR13) — currentDebt không nằm trong input update dù entity có field này', async () => {
      customerRepository.findById.mockResolvedValue(makeCustomer());
      customerRepository.update.mockResolvedValue(makeCustomer());

      await service.update('cus-1', { version: 1, fullName: 'B' }, actor);

      const [, , , input] = customerRepository.update.mock.calls[0];
      expect(input).not.toHaveProperty('currentDebt');
      expect(input).not.toHaveProperty('totalRevenue');
      expect(input).not.toHaveProperty('totalOrder');
      expect(input).not.toHaveProperty('totalPoint');
    });
  });

  describe('remove — Archive (Optimistic Lock)', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      customerRepository.findById.mockResolvedValue(null);
      await expect(service.remove('missing', 1, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('archive thành công, ghi audit log và publish CustomerDeleted', async () => {
      customerRepository.findById.mockResolvedValue(makeCustomer());
      await service.remove('cus-1', 1, actor);

      expect(customerRepository.softDelete).toHaveBeenCalledWith(
        'cus-1',
        'org-1',
        1,
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'customer.archive' }),
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        CUSTOMER_DELETED_EVENT,
        expect.objectContaining({ customerId: 'cus-1' }),
      );
    });

    it('ném Conflict (409) khi version không khớp', async () => {
      customerRepository.findById.mockResolvedValue(makeCustomer());
      customerRepository.softDelete.mockRejectedValue(
        new CustomerConcurrencyConflictError('cus-1'),
      );
      await expect(service.remove('cus-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('restore', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      customerRepository.findByIdIncludingDeleted.mockResolvedValue(null);
      await expect(service.restore('missing', 1, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ném UnprocessableEntityException khi chưa bị xóa', async () => {
      customerRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeCustomer({ deletedAt: null }),
      );
      await expect(service.restore('cus-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('khôi phục thành công, trả status về INACTIVE, ghi audit log và publish CustomerRestored', async () => {
      customerRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeCustomer({ deletedAt: new Date('2026-02-01') }),
      );
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'INACTIVE', deletedAt: null }),
      );

      const result = await service.restore('cus-1', 1, actor);
      expect(result.status).toBe('INACTIVE');
      expect(customerRepository.restore).toHaveBeenCalledWith(
        'cus-1',
        'org-1',
        1,
        'user-1',
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        CUSTOMER_RESTORED_EVENT,
        expect.objectContaining({ customerId: 'cus-1' }),
      );
    });

    it('ném Conflict (409) khi version không khớp', async () => {
      customerRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeCustomer({ deletedAt: new Date('2026-02-01') }),
      );
      customerRepository.restore.mockRejectedValue(
        new CustomerConcurrencyConflictError('cus-1'),
      );
      await expect(service.restore('cus-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('activate (INACTIVE → ACTIVE)', () => {
    it('kích hoạt thành công từ INACTIVE, ghi audit log và publish', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'INACTIVE' }),
      );
      customerRepository.changeStatusWithVersion.mockResolvedValue(
        makeCustomer({ status: 'ACTIVE', version: 2 }),
      );

      const result = await service.activate('cus-1', 1, actor);
      expect(result.status).toBe('ACTIVE');
      expect(customerRepository.changeStatusWithVersion).toHaveBeenCalledWith(
        'cus-1',
        'org-1',
        1,
        'ACTIVE',
        'user-1',
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        CUSTOMER_ACTIVATED_EVENT,
        expect.objectContaining({ customerId: 'cus-1' }),
      );
    });

    it('ném lỗi invalid transition khi đang ACTIVE', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'ACTIVE' }),
      );
      await expect(service.activate('cus-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('ném lỗi invalid transition khi đang ARCHIVED', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'ARCHIVED' }),
      );
      await expect(service.activate('cus-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('ném Conflict (409) khi version không khớp', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'INACTIVE' }),
      );
      customerRepository.changeStatusWithVersion.mockRejectedValue(
        new CustomerConcurrencyConflictError('cus-1'),
      );
      await expect(service.activate('cus-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('deactivate (ACTIVE → INACTIVE)', () => {
    it('ngừng hoạt động thành công từ ACTIVE, ghi audit log và publish', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'ACTIVE' }),
      );
      customerRepository.changeStatusWithVersion.mockResolvedValue(
        makeCustomer({ status: 'INACTIVE', version: 2 }),
      );

      const result = await service.deactivate('cus-1', 1, actor);
      expect(result.status).toBe('INACTIVE');
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        CUSTOMER_DEACTIVATED_EVENT,
        expect.objectContaining({ customerId: 'cus-1' }),
      );
    });

    it('ném lỗi invalid transition khi đang INACTIVE', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'INACTIVE' }),
      );
      await expect(service.deactivate('cus-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
