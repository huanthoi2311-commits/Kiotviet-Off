import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { InventoryAdjustmentEntity } from '../domain/entities/inventory-adjustment.entity';
import {
  IInventoryAdjustmentRepository,
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

    service = new InventoryAdjustmentService(
      adjustmentRepository,
      codeGenerator,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('create', () => {
    it('tạo thành công và ghi audit log', async () => {
      adjustmentRepository.create.mockResolvedValue(makeAdjustment());
      const result = await service.create(
        {
          warehouseId: 'wh-1',
          reason: 'LOST',
          items: [{ productId: 'product-1', quantity: -5 }],
        },
        actor,
      );
      expect(result.code).toBe('PDCK000001');
      expect(codeGenerator.generate).toHaveBeenCalledWith('org-1');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'inventory_adjustment.create' }),
      );
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
    it('gọi repository.complete và ghi audit log', async () => {
      adjustmentRepository.findById.mockResolvedValue(
        makeAdjustment({ status: 'APPROVED' }),
      );
      adjustmentRepository.complete.mockResolvedValue(
        makeAdjustment({ status: 'COMPLETED' }),
      );

      const result = await service.complete('adj-1', actor);
      expect(result.status).toBe('COMPLETED');
      expect(adjustmentRepository.complete).toHaveBeenCalledWith(
        'adj-1',
        'org-1',
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
      await expect(service.complete('adj-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
