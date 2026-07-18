import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupplierEntity } from '../domain/entities/supplier.entity';
import { ISupplierRepository } from '../domain/repositories/supplier.repository.interface';
import { SupplierDomainService } from './supplier-domain.service';

describe('SupplierDomainService', () => {
  let service: SupplierDomainService;
  let supplierRepository: jest.Mocked<
    Pick<ISupplierRepository, 'findById' | 'existsByCode'>
  >;

  const makeSupplier = (
    overrides: Partial<SupplierEntity> = {},
  ): SupplierEntity =>
    ({
      id: 'sup-1',
      organizationId: 'org-1',
      status: 'ACTIVE',
      ...overrides,
    }) as SupplierEntity;

  beforeEach(() => {
    supplierRepository = { findById: jest.fn(), existsByCode: jest.fn() };
    service = new SupplierDomainService(
      supplierRepository as unknown as ISupplierRepository,
    );
  });

  describe('findById', () => {
    it('ủy quyền cho repository.findById', async () => {
      supplierRepository.findById.mockResolvedValue(makeSupplier());
      const result = await service.findById('org-1', 'sup-1');
      expect(result?.id).toBe('sup-1');
      expect(supplierRepository.findById).toHaveBeenCalledWith(
        'sup-1',
        'org-1',
      );
    });
  });

  describe('findActiveById', () => {
    it('trả về supplier khi status ACTIVE', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'ACTIVE' }),
      );
      const result = await service.findActiveById('org-1', 'sup-1');
      expect(result).not.toBeNull();
    });

    it('trả về supplier khi status INACTIVE (chỉ loại ARCHIVED)', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'INACTIVE' }),
      );
      const result = await service.findActiveById('org-1', 'sup-1');
      expect(result).not.toBeNull();
    });

    it('trả về null khi status ARCHIVED', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'ARCHIVED' }),
      );
      const result = await service.findActiveById('org-1', 'sup-1');
      expect(result).toBeNull();
    });

    it('trả về null khi không tồn tại', async () => {
      supplierRepository.findById.mockResolvedValue(null);
      const result = await service.findActiveById('org-1', 'missing');
      expect(result).toBeNull();
    });
  });

  describe('findUsableForPurchase', () => {
    it('trả về supplier khi status ACTIVE', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'ACTIVE' }),
      );
      const result = await service.findUsableForPurchase('org-1', 'sup-1');
      expect(result).not.toBeNull();
    });

    it('trả về null khi status INACTIVE (khác findActiveById)', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'INACTIVE' }),
      );
      const result = await service.findUsableForPurchase('org-1', 'sup-1');
      expect(result).toBeNull();
    });

    it('trả về null khi status ARCHIVED', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'ARCHIVED' }),
      );
      const result = await service.findUsableForPurchase('org-1', 'sup-1');
      expect(result).toBeNull();
    });
  });

  describe('existsByCode', () => {
    it('ủy quyền cho repository.existsByCode', async () => {
      supplierRepository.existsByCode.mockResolvedValue(true);
      const result = await service.existsByCode('org-1', 'NCC000001');
      expect(result).toBe(true);
    });
  });

  describe('assertBelongsToOrganization', () => {
    it('không ném lỗi khi tồn tại trong tổ chức', async () => {
      supplierRepository.findById.mockResolvedValue(makeSupplier());
      await expect(
        service.assertBelongsToOrganization('org-1', 'sup-1'),
      ).resolves.toBeUndefined();
    });

    it('ném NotFoundException khi không tồn tại/khác tổ chức', async () => {
      supplierRepository.findById.mockResolvedValue(null);
      await expect(
        service.assertBelongsToOrganization('org-1', 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertNotArchived', () => {
    it('không ném lỗi khi status ACTIVE/INACTIVE', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'INACTIVE' }),
      );
      await expect(
        service.assertNotArchived('org-1', 'sup-1'),
      ).resolves.toBeUndefined();
    });

    it('ném UnprocessableEntityException khi status ARCHIVED', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'ARCHIVED' }),
      );
      await expect(service.assertNotArchived('org-1', 'sup-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
