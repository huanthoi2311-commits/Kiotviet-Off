import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { StockCountEntity } from '../domain/entities/stock-count.entity';
import {
  IStockCountRepository,
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

    service = new StockCountService(
      stockCountRepository,
      codeGenerator,
      auditLogService as unknown as AuditLogService,
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
          { items: [{ itemId: 'item-1', actualQty: 95 }] },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('gọi repository.complete và ghi audit log', async () => {
      stockCountRepository.findById.mockResolvedValue(
        makeStockCount({ status: 'COUNTING' }),
      );
      stockCountRepository.complete.mockResolvedValue(
        makeStockCount({ status: 'COMPLETED' }),
      );

      const dto = { items: [{ itemId: 'item-1', actualQty: 95 }] };
      const result = await service.complete('sc-1', dto, actor);

      expect(result.status).toBe('COMPLETED');
      expect(stockCountRepository.complete).toHaveBeenCalledWith(
        'sc-1',
        'org-1',
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
          { items: [{ itemId: 'unknown-item', actualQty: 1 }] },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
