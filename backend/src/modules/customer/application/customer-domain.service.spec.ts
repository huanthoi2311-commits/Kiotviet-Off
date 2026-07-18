import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CustomerEntity } from '../domain/entities/customer.entity';
import { ICustomerRepository } from '../domain/repositories/customer.repository.interface';
import { CustomerDomainService } from './customer-domain.service';

describe('CustomerDomainService', () => {
  let service: CustomerDomainService;
  let customerRepository: jest.Mocked<
    Pick<ICustomerRepository, 'findById' | 'existsByCode'>
  >;

  const makeCustomer = (
    overrides: Partial<CustomerEntity> = {},
  ): CustomerEntity =>
    ({
      id: 'cus-1',
      organizationId: 'org-1',
      status: 'ACTIVE',
      ...overrides,
    }) as CustomerEntity;

  beforeEach(() => {
    customerRepository = { findById: jest.fn(), existsByCode: jest.fn() };
    service = new CustomerDomainService(
      customerRepository as unknown as ICustomerRepository,
    );
  });

  describe('findById', () => {
    it('ủy quyền cho repository.findById', async () => {
      customerRepository.findById.mockResolvedValue(makeCustomer());
      const result = await service.findById('org-1', 'cus-1');
      expect(result?.id).toBe('cus-1');
      expect(customerRepository.findById).toHaveBeenCalledWith(
        'cus-1',
        'org-1',
      );
    });
  });

  describe('findActiveById', () => {
    it('trả về customer khi status ACTIVE', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'ACTIVE' }),
      );
      const result = await service.findActiveById('org-1', 'cus-1');
      expect(result).not.toBeNull();
    });

    it('trả về customer khi status INACTIVE (chỉ loại ARCHIVED)', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'INACTIVE' }),
      );
      const result = await service.findActiveById('org-1', 'cus-1');
      expect(result).not.toBeNull();
    });

    it('trả về null khi status ARCHIVED', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'ARCHIVED' }),
      );
      const result = await service.findActiveById('org-1', 'cus-1');
      expect(result).toBeNull();
    });

    it('trả về null khi không tồn tại', async () => {
      customerRepository.findById.mockResolvedValue(null);
      const result = await service.findActiveById('org-1', 'missing');
      expect(result).toBeNull();
    });
  });

  describe('findUsableForSale', () => {
    it('trả về customer khi status ACTIVE', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'ACTIVE' }),
      );
      const result = await service.findUsableForSale('org-1', 'cus-1');
      expect(result).not.toBeNull();
    });

    it('trả về null khi status INACTIVE (khác findActiveById)', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'INACTIVE' }),
      );
      const result = await service.findUsableForSale('org-1', 'cus-1');
      expect(result).toBeNull();
    });

    it('trả về null khi status ARCHIVED', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'ARCHIVED' }),
      );
      const result = await service.findUsableForSale('org-1', 'cus-1');
      expect(result).toBeNull();
    });
  });

  describe('existsByCode', () => {
    it('ủy quyền cho repository.existsByCode', async () => {
      customerRepository.existsByCode.mockResolvedValue(true);
      const result = await service.existsByCode('org-1', 'CUS000001');
      expect(result).toBe(true);
    });
  });

  describe('assertBelongsToOrganization', () => {
    it('không ném lỗi khi tồn tại trong tổ chức', async () => {
      customerRepository.findById.mockResolvedValue(makeCustomer());
      await expect(
        service.assertBelongsToOrganization('org-1', 'cus-1'),
      ).resolves.toBeUndefined();
    });

    it('ném NotFoundException khi không tồn tại/khác tổ chức', async () => {
      customerRepository.findById.mockResolvedValue(null);
      await expect(
        service.assertBelongsToOrganization('org-1', 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertNotArchived', () => {
    it('không ném lỗi khi status ACTIVE/INACTIVE', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'INACTIVE' }),
      );
      await expect(
        service.assertNotArchived('org-1', 'cus-1'),
      ).resolves.toBeUndefined();
    });

    it('ném UnprocessableEntityException khi status ARCHIVED', async () => {
      customerRepository.findById.mockResolvedValue(
        makeCustomer({ status: 'ARCHIVED' }),
      );
      await expect(service.assertNotArchived('org-1', 'cus-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
