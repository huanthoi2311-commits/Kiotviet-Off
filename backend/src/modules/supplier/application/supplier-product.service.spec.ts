import { NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import {
  SupplierEntity,
  SupplierProductEntity,
} from '../domain/entities/supplier.entity';
import { ISupplierProductRepository } from '../domain/repositories/supplier-product.repository.interface';
import { ISupplierRepository } from '../domain/repositories/supplier.repository.interface';
import { SupplierProductService } from './supplier-product.service';
import { ActorContext } from './supplier.service';

describe('SupplierProductService', () => {
  let service: SupplierProductService;
  let supplierProductRepository: jest.Mocked<ISupplierProductRepository>;
  let supplierRepository: jest.Mocked<Pick<ISupplierRepository, 'findById'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeSupplier = (): SupplierEntity =>
    ({ id: 'sup-1', organizationId: 'org-1' }) as SupplierEntity;

  const makeMapping = (
    overrides: Partial<SupplierProductEntity> = {},
  ): SupplierProductEntity => ({
    id: 'sp-1',
    supplierId: 'sup-1',
    productId: 'product-1',
    supplierSku: null,
    priority: 0,
    defaultPrice: null,
    leadTime: null,
    minimumOrderQuantity: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });

  beforeEach(() => {
    supplierProductRepository = {
      upsert: jest.fn(),
      listBySupplier: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    supplierRepository = {
      findById: jest.fn().mockResolvedValue(makeSupplier()),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new SupplierProductService(
      supplierProductRepository,
      supplierRepository as unknown as ISupplierRepository,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('listBySupplier', () => {
    it('ném NotFoundException khi supplier không tồn tại', async () => {
      supplierRepository.findById.mockResolvedValue(null);
      await expect(service.listBySupplier('sup-1', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('trả về danh sách mapping', async () => {
      supplierProductRepository.listBySupplier.mockResolvedValue([
        makeMapping(),
      ]);
      const result = await service.listBySupplier('sup-1', 'org-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('upsert', () => {
    it('ném NotFoundException khi supplier không tồn tại', async () => {
      supplierRepository.findById.mockResolvedValue(null);
      await expect(
        service.upsert('sup-1', { productId: 'product-1' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('tạo/cập nhật thành công và ghi audit log', async () => {
      supplierProductRepository.upsert.mockResolvedValue(makeMapping());
      const result = await service.upsert(
        'sup-1',
        { productId: 'product-1' },
        actor,
      );
      expect(result.productId).toBe('product-1');
      expect(supplierProductRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: 'sup-1',
          productId: 'product-1',
          actorId: 'user-1',
        }),
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'supplier.product.upsert' }),
      );
    });
  });

  describe('remove', () => {
    it('ném NotFoundException khi mapping không tồn tại', async () => {
      supplierProductRepository.findOne.mockResolvedValue(null);
      await expect(service.remove('sup-1', 'product-1', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('xóa thành công và ghi audit log', async () => {
      supplierProductRepository.findOne.mockResolvedValue(makeMapping());
      await service.remove('sup-1', 'product-1', actor);
      expect(supplierProductRepository.remove).toHaveBeenCalledWith(
        'sup-1',
        'product-1',
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'supplier.product.remove' }),
      );
    });
  });
});
