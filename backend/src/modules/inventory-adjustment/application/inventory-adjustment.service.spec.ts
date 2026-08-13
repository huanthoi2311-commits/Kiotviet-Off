import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { WarehouseService } from '../../warehouse/application/warehouse.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { InventoryConcurrencyConflictError } from '../../inventory/domain/errors/inventory.errors';
import { InventoryAdjustmentEntity } from '../domain/entities/inventory-adjustment.entity';
import {
  IInventoryAdjustmentRepository,
  InventoryAdjustmentConcurrencyConflictError,
  InventoryAdjustmentNegativeStockError,
  InventoryAdjustmentStatusConflictError,
} from '../domain/repositories/inventory-adjustment.repository.interface';
import { IInventoryAdjustmentCodeGenerator } from '../domain/services/inventory-adjustment-code-generator.interface';
import {
  ActorContext,
  InventoryAdjustmentService,
} from './inventory-adjustment.service';

describe('InventoryAdjustmentService', () => {
  let service: InventoryAdjustmentService;
  let adjustmentRepository: jest.Mocked<IInventoryAdjustmentRepository>;
  let codeGenerator: jest.Mocked<IInventoryAdjustmentCodeGenerator>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;
  let warehouseService: jest.Mocked<Pick<WarehouseService, 'findOne'>>;
  let productDomainService: jest.Mocked<Pick<ProductDomainService, 'findById'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeAdjustment = (
    overrides: Partial<InventoryAdjustmentEntity> = {},
  ): InventoryAdjustmentEntity => ({
    id: 'adj-1',
    organizationId: 'org-1',
    warehouseId: 'wh-1',
    code: 'PDCK000001',
    status: 'DRAFT',
    reason: 'LOST',
    note: null,
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    items: [
      { id: 'item-1', productId: 'product-1', quantity: '-5', remark: null },
    ],
    ...overrides,
  });

  beforeEach(() => {
    adjustmentRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      search: jest.fn(),
      existsByCode: jest.fn(),
      submit: jest.fn(),
      approve: jest.fn(),
      complete: jest.fn(),
    };
    codeGenerator = { generate: jest.fn().mockResolvedValue('PDCK000001') };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    // T051.06B — mặc định resolve (Warehouse/Product thuộc actor.organizationId) để mọi test
    // hiện có không bị ảnh hưởng; test negative-path bên dưới tự override.
    warehouseService = { findOne: jest.fn().mockResolvedValue({}) };
    productDomainService = {
      findById: jest.fn().mockResolvedValue({}),
    };

    service = new InventoryAdjustmentService(
      adjustmentRepository,
      codeGenerator,
      auditLogService as unknown as AuditLogService,
      warehouseService as unknown as WarehouseService,
      productDomainService as unknown as ProductDomainService,
    );
  });

  describe('create', () => {
    const dto = {
      warehouseId: 'wh-1',
      reason: 'LOST' as const,
      items: [{ productId: 'product-1', quantity: -5 }],
    };

    it('tạo thành công và ghi audit log', async () => {
      adjustmentRepository.create.mockResolvedValue(makeAdjustment());
      const result = await service.create(dto, actor);
      expect(result.code).toBe('PDCK000001');
      expect(codeGenerator.generate).toHaveBeenCalledWith('org-1');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'inventory_adjustment.create' }),
      );
    });

    describe('[T051.06B] warehouseId/productId phải thuộc actor.organizationId', () => {
      it('Warehouse cùng tổ chức — gọi warehouseService.findOne(warehouseId, org), cho qua', async () => {
        adjustmentRepository.create.mockResolvedValue(makeAdjustment());
        await service.create(dto, actor);
        expect(warehouseService.findOne).toHaveBeenCalledWith('wh-1', 'org-1');
      });

      it('Warehouse khác tổ chức — reject, repository.create() KHÔNG được gọi', async () => {
        warehouseService.findOne.mockRejectedValue(
          new NotFoundException('Không tìm thấy kho'),
        );
        await expect(service.create(dto, actor)).rejects.toThrow(
          NotFoundException,
        );
        expect(adjustmentRepository.create).not.toHaveBeenCalled();
      });

      it('Product (dòng hàng) khác tổ chức (hoặc không tồn tại) — reject, repository.create() KHÔNG được gọi', async () => {
        productDomainService.findById.mockResolvedValue(null);
        await expect(service.create(dto, actor)).rejects.toThrow(
          NotFoundException,
        );
        expect(adjustmentRepository.create).not.toHaveBeenCalled();
      });

      it('Danh sách nhiều dòng hàng, MỘT dòng có productId ngoài tổ chức — toàn bộ request bị reject', async () => {
        productDomainService.findById.mockImplementation((id) =>
          id === 'product-foreign'
            ? Promise.resolve(null)
            : Promise.resolve({} as never),
        );
        await expect(
          service.create(
            {
              ...dto,
              items: [
                { productId: 'product-1', quantity: -5 },
                { productId: 'product-foreign', quantity: 3 },
              ],
            },
            actor,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(adjustmentRepository.create).not.toHaveBeenCalled();
      });

      it('Thứ tự: Warehouse/Product được xác minh TRƯỚC repository.create()', async () => {
        const callOrder: string[] = [];
        warehouseService.findOne.mockImplementation(() => {
          callOrder.push('warehouse');
          return Promise.resolve({} as never);
        });
        productDomainService.findById.mockImplementation(() => {
          callOrder.push('product');
          return Promise.resolve({} as never);
        });
        adjustmentRepository.create.mockImplementation(() => {
          callOrder.push('repository.create');
          return Promise.resolve(makeAdjustment());
        });

        await service.create(dto, actor);

        expect(callOrder).toEqual([
          'warehouse',
          'product',
          'repository.create',
        ]);
      });
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      adjustmentRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('search', () => {
    it('map query sang search params', async () => {
      adjustmentRepository.search.mockResolvedValue({
        items: [makeAdjustment()],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({ reason: 'LOST' }, 'org-1');
      expect(result.total).toBe(1);
      expect(adjustmentRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          reason: 'LOST',
          page: 1,
          limit: 20,
        }),
      );
    });
  });

  describe('submit', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      adjustmentRepository.findById.mockResolvedValue(null);
      await expect(service.submit('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gọi repository.submit và ghi audit log', async () => {
      adjustmentRepository.findById.mockResolvedValue(makeAdjustment());
      adjustmentRepository.submit.mockResolvedValue(
        makeAdjustment({ status: 'SUBMITTED' }),
      );

      const result = await service.submit('adj-1', actor);
      expect(result.status).toBe('SUBMITTED');
      expect(adjustmentRepository.submit).toHaveBeenCalledWith(
        'adj-1',
        'org-1',
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'inventory_adjustment.submit' }),
      );
    });

    it('dịch StatusConflictError sang UnprocessableEntityException', async () => {
      adjustmentRepository.findById.mockResolvedValue(makeAdjustment());
      adjustmentRepository.submit.mockRejectedValue(
        new InventoryAdjustmentStatusConflictError('SUBMITTED'),
      );
      await expect(service.submit('adj-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('approve', () => {
    it('gọi repository.approve và ghi audit log', async () => {
      adjustmentRepository.findById.mockResolvedValue(
        makeAdjustment({ status: 'SUBMITTED' }),
      );
      adjustmentRepository.approve.mockResolvedValue(
        makeAdjustment({ status: 'APPROVED' }),
      );

      const result = await service.approve('adj-1', actor);
      expect(result.status).toBe('APPROVED');
      expect(adjustmentRepository.approve).toHaveBeenCalledWith(
        'adj-1',
        'org-1',
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'inventory_adjustment.approve' }),
      );
    });
  });

  describe('complete', () => {
    it('gọi repository.complete kèm expectedVersion và ghi audit log', async () => {
      adjustmentRepository.findById.mockResolvedValue(
        makeAdjustment({ status: 'APPROVED', version: 2 }),
      );
      adjustmentRepository.complete.mockResolvedValue(
        makeAdjustment({ status: 'COMPLETED', version: 3 }),
      );

      const result = await service.complete('adj-1', 2, actor);
      expect(result.status).toBe('COMPLETED');
      expect(result.version).toBe(3);
      expect(adjustmentRepository.complete).toHaveBeenCalledWith(
        'adj-1',
        'org-1',
        2,
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'inventory_adjustment.complete' }),
      );
    });

    it('dịch NegativeStockError sang UnprocessableEntityException', async () => {
      adjustmentRepository.findById.mockResolvedValue(
        makeAdjustment({ status: 'APPROVED' }),
      );
      adjustmentRepository.complete.mockRejectedValue(
        new InventoryAdjustmentNegativeStockError('product-1'),
      );
      await expect(service.complete('adj-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('dịch InventoryConcurrencyConflictError sang ConflictException (Optimistic Lock)', async () => {
      adjustmentRepository.findById.mockResolvedValue(
        makeAdjustment({ status: 'APPROVED' }),
      );
      adjustmentRepository.complete.mockRejectedValue(
        new InventoryConcurrencyConflictError('product-1'),
      );
      await expect(service.complete('adj-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('T051.02: dịch InventoryAdjustmentConcurrencyConflictError sang ConflictException (INVENTORY_ADJUSTMENT_008)', async () => {
      adjustmentRepository.findById.mockResolvedValue(
        makeAdjustment({ status: 'APPROVED', version: 1 }),
      );
      adjustmentRepository.complete.mockRejectedValue(
        new InventoryAdjustmentConcurrencyConflictError('adj-1'),
      );
      let caught: ConflictException | undefined;
      try {
        await service.complete('adj-1', 1, actor);
      } catch (error) {
        caught = error as ConflictException;
      }
      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught?.getResponse() as { errorCode?: string })?.errorCode).toBe(
        'INVENTORY_ADJUSTMENT_008',
      );
    });
  });
});
