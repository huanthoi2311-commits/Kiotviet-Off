import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { WarehouseService } from '../../warehouse/application/warehouse.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { InventoryConcurrencyConflictError } from '../../inventory/domain/errors/inventory.errors';
import { StockCountEntity } from '../domain/entities/stock-count.entity';
import {
  IStockCountRepository,
  StockCountConcurrencyConflictError,
  StockCountItemMismatchError,
  StockCountStatusConflictError,
} from '../domain/repositories/stock-count.repository.interface';
import { IStockCountCodeGenerator } from '../domain/services/stock-count-code-generator.interface';
import { ActorContext, StockCountService } from './stock-count.service';

describe('StockCountService', () => {
  let service: StockCountService;
  let stockCountRepository: jest.Mocked<IStockCountRepository>;
  let codeGenerator: jest.Mocked<IStockCountCodeGenerator>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;
  let warehouseService: jest.Mocked<Pick<WarehouseService, 'findOne'>>;
  let productDomainService: jest.Mocked<Pick<ProductDomainService, 'findById'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeStockCount = (
    overrides: Partial<StockCountEntity> = {},
  ): StockCountEntity => ({
    id: 'sc-1',
    organizationId: 'org-1',
    warehouseId: 'wh-1',
    code: 'PKK000001',
    status: 'DRAFT',
    note: null,
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        systemQty: '100',
        actualQty: null,
        difference: null,
        remark: null,
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    stockCountRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      search: jest.fn(),
      existsByCode: jest.fn(),
      start: jest.fn(),
      complete: jest.fn(),
    };
    codeGenerator = { generate: jest.fn().mockResolvedValue('PKK000001') };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    // T051.06B — mặc định resolve (Warehouse/Product thuộc actor.organizationId) để mọi test
    // hiện có không bị ảnh hưởng; test negative-path bên dưới tự override.
    warehouseService = { findOne: jest.fn().mockResolvedValue({}) };
    productDomainService = {
      findById: jest.fn().mockResolvedValue({}),
    };

    service = new StockCountService(
      stockCountRepository,
      codeGenerator,
      auditLogService as unknown as AuditLogService,
      warehouseService as unknown as WarehouseService,
      productDomainService as unknown as ProductDomainService,
    );
  });

  describe('create', () => {
    it('tạo thành công và ghi audit log', async () => {
      stockCountRepository.create.mockResolvedValue(makeStockCount());
      const result = await service.create(
        { warehouseId: 'wh-1', productIds: ['product-1'] },
        actor,
      );
      expect(result.code).toBe('PKK000001');
      expect(codeGenerator.generate).toHaveBeenCalledWith('org-1');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'stock_count.create' }),
      );
    });

    describe('[T051.06B] warehouseId/productIds phải thuộc actor.organizationId', () => {
      const dto = { warehouseId: 'wh-1', productIds: ['product-1'] };

      it('Warehouse cùng tổ chức — gọi warehouseService.findOne(warehouseId, org), cho qua', async () => {
        stockCountRepository.create.mockResolvedValue(makeStockCount());
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
        expect(stockCountRepository.create).not.toHaveBeenCalled();
      });

      it('Product khác tổ chức (hoặc không tồn tại) — reject, repository.create() KHÔNG được gọi', async () => {
        productDomainService.findById.mockResolvedValue(null);
        await expect(service.create(dto, actor)).rejects.toThrow(
          NotFoundException,
        );
        expect(stockCountRepository.create).not.toHaveBeenCalled();
      });

      it('Danh sách nhiều productIds, MỘT id ngoài tổ chức — toàn bộ request bị reject', async () => {
        productDomainService.findById.mockImplementation((id) =>
          id === 'product-foreign'
            ? Promise.resolve(null)
            : Promise.resolve({} as never),
        );
        await expect(
          service.create(
            {
              warehouseId: 'wh-1',
              productIds: ['product-1', 'product-foreign'],
            },
            actor,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(stockCountRepository.create).not.toHaveBeenCalled();
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
        stockCountRepository.create.mockImplementation(() => {
          callOrder.push('repository.create');
          return Promise.resolve(makeStockCount());
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
      stockCountRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('search', () => {
    it('map query sang search params', async () => {
      stockCountRepository.search.mockResolvedValue({
        items: [makeStockCount()],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({ status: 'DRAFT' }, 'org-1');
      expect(result.total).toBe(1);
      expect(stockCountRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          status: 'DRAFT',
          page: 1,
          limit: 20,
        }),
      );
    });
  });

  describe('start', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      stockCountRepository.findById.mockResolvedValue(null);
      await expect(service.start('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gọi repository.start và ghi audit log', async () => {
      stockCountRepository.findById.mockResolvedValue(makeStockCount());
      stockCountRepository.start.mockResolvedValue(
        makeStockCount({ status: 'COUNTING' }),
      );

      const result = await service.start('sc-1', actor);

      expect(result.status).toBe('COUNTING');
      expect(stockCountRepository.start).toHaveBeenCalledWith(
        'sc-1',
        'org-1',
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'stock_count.start' }),
      );
    });

    it('dịch StockCountStatusConflictError sang UnprocessableEntityException', async () => {
      stockCountRepository.findById.mockResolvedValue(makeStockCount());
      stockCountRepository.start.mockRejectedValue(
        new StockCountStatusConflictError('COUNTING'),
      );
      await expect(service.start('sc-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('complete', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      stockCountRepository.findById.mockResolvedValue(null);
      await expect(
        service.complete(
          'missing',
          { version: 1, items: [{ itemId: 'item-1', actualQty: 95 }] },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('gọi repository.complete kèm expectedVersion và ghi audit log', async () => {
      stockCountRepository.findById.mockResolvedValue(
        makeStockCount({ status: 'COUNTING', version: 2 }),
      );
      stockCountRepository.complete.mockResolvedValue(
        makeStockCount({ status: 'COMPLETED', version: 3 }),
      );

      const dto = { version: 2, items: [{ itemId: 'item-1', actualQty: 95 }] };
      const result = await service.complete('sc-1', dto, actor);

      expect(result.status).toBe('COMPLETED');
      expect(result.version).toBe(3);
      expect(stockCountRepository.complete).toHaveBeenCalledWith(
        'sc-1',
        'org-1',
        2,
        dto.items,
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'stock_count.complete' }),
      );
    });

    it('dịch StockCountItemMismatchError sang UnprocessableEntityException', async () => {
      stockCountRepository.findById.mockResolvedValue(
        makeStockCount({ status: 'COUNTING' }),
      );
      stockCountRepository.complete.mockRejectedValue(
        new StockCountItemMismatchError('unknown-item'),
      );
      await expect(
        service.complete(
          'sc-1',
          { version: 1, items: [{ itemId: 'unknown-item', actualQty: 1 }] },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('dịch InventoryConcurrencyConflictError sang ConflictException (Optimistic Lock)', async () => {
      stockCountRepository.findById.mockResolvedValue(
        makeStockCount({ status: 'COUNTING' }),
      );
      stockCountRepository.complete.mockRejectedValue(
        new InventoryConcurrencyConflictError('product-1'),
      );
      await expect(
        service.complete(
          'sc-1',
          { version: 1, items: [{ itemId: 'item-1', actualQty: 90 }] },
          actor,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('T051.02: dịch StockCountConcurrencyConflictError sang ConflictException (STOCK_COUNT_007)', async () => {
      stockCountRepository.findById.mockResolvedValue(
        makeStockCount({ status: 'COUNTING', version: 1 }),
      );
      stockCountRepository.complete.mockRejectedValue(
        new StockCountConcurrencyConflictError('sc-1'),
      );
      let caught: ConflictException | undefined;
      try {
        await service.complete(
          'sc-1',
          { version: 1, items: [{ itemId: 'item-1', actualQty: 90 }] },
          actor,
        );
      } catch (error) {
        caught = error as ConflictException;
      }
      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught?.getResponse() as { errorCode?: string })?.errorCode).toBe(
        'STOCK_COUNT_007',
      );
    });
  });
});
