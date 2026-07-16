import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { InventoryConcurrencyConflictError } from '../../inventory/domain/errors/inventory.errors';
import { PurchaseOrderEntity } from '../../purchase-order/domain/entities/purchase-order.entity';
import { IPurchaseOrderRepository } from '../../purchase-order/domain/repositories/purchase-order.repository.interface';
import { PurchaseReturnEntity } from '../domain/entities/purchase-return.entity';
import {
  IPurchaseReturnRepository,
  PurchaseReturnExceedsReceivedError,
  PurchaseReturnNegativeStockError,
  PurchaseReturnStatusConflictError,
} from '../domain/repositories/purchase-return.repository.interface';
import { IPurchaseReturnCodeGenerator } from '../domain/services/purchase-return-code-generator.interface';
import { ActorContext, PurchaseReturnService } from './purchase-return.service';

describe('PurchaseReturnService', () => {
  let service: PurchaseReturnService;
  let purchaseReturnRepository: jest.Mocked<IPurchaseReturnRepository>;
  let purchaseOrderRepository: jest.Mocked<IPurchaseOrderRepository>;
  let codeGenerator: jest.Mocked<IPurchaseReturnCodeGenerator>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makePurchaseOrder = (
    overrides: Partial<PurchaseOrderEntity> = {},
  ): PurchaseOrderEntity => ({
    id: 'po-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    supplierId: 'supplier-1',
    code: 'PN000001',
    status: 'RECEIVED',
    totalAmount: '1000000',
    paidAmount: '0',
    expectedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        warehouseId: 'wh-1',
        quantity: '100',
        receivedQuantity: '100',
        unitCost: '10000',
        discount: '0',
        taxAmount: '0',
        totalAmount: '1000000',
      },
    ],
    ...overrides,
  });

  const makeReturn = (
    overrides: Partial<PurchaseReturnEntity> = {},
  ): PurchaseReturnEntity => ({
    id: 'pr-1',
    organizationId: 'org-1',
    purchaseOrderId: 'po-1',
    supplierId: 'supplier-1',
    code: 'PTH000001',
    status: 'DRAFT',
    reason: 'DAMAGED',
    totalAmount: '50000',
    note: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    items: [
      {
        id: 'ri-1',
        purchaseItemId: 'item-1',
        productId: 'product-1',
        warehouseId: 'wh-1',
        quantity: '5',
        unitCost: '10000',
        totalAmount: '50000',
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    purchaseReturnRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      search: jest.fn(),
      existsByCode: jest.fn(),
      approve: jest.fn(),
      complete: jest.fn(),
      cancel: jest.fn(),
    };
    purchaseOrderRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      search: jest.fn(),
      existsByCode: jest.fn(),
      approve: jest.fn(),
      receive: jest.fn(),
      cancel: jest.fn(),
    };
    codeGenerator = { generate: jest.fn().mockResolvedValue('PTH000001') };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new PurchaseReturnService(
      purchaseReturnRepository,
      purchaseOrderRepository,
      codeGenerator,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('create', () => {
    it('ném NotFoundException khi Purchase Order không tồn tại', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(null);
      await expect(
        service.create(
          { purchaseOrderId: 'po-1', reason: 'DAMAGED', items: [] },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('ném UnprocessableEntityException khi Purchase Order chưa RECEIVED', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(
        makePurchaseOrder({ status: 'DRAFT' }),
      );
      await expect(
        service.create(
          {
            purchaseOrderId: 'po-1',
            reason: 'DAMAGED',
            items: [{ purchaseItemId: 'item-1', quantity: 5 }],
          },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('ném UnprocessableEntityException khi purchaseItemId không thuộc đơn nhập', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(makePurchaseOrder());
      await expect(
        service.create(
          {
            purchaseOrderId: 'po-1',
            reason: 'DAMAGED',
            items: [{ purchaseItemId: 'item-missing', quantity: 5 }],
          },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('tính unitCost/warehouseId từ PurchaseItem gốc, tính totalAmount, sinh code, ghi audit log', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(makePurchaseOrder());
      purchaseReturnRepository.create.mockResolvedValue(makeReturn());

      const result = await service.create(
        {
          purchaseOrderId: 'po-1',
          reason: 'DAMAGED',
          items: [{ purchaseItemId: 'item-1', quantity: 5 }],
        },
        actor,
      );

      expect(result.code).toBe('PTH000001');
      expect(purchaseReturnRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          supplierId: 'supplier-1',
          totalAmount: 50000,
          items: [
            expect.objectContaining({
              purchaseItemId: 'item-1',
              productId: 'product-1',
              warehouseId: 'wh-1',
              quantity: 5,
              unitCost: 10000,
              totalAmount: 50000,
            }),
          ],
        }),
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'purchase_return.create' }),
      );
    });

    it('dịch PurchaseReturnExceedsReceivedError sang UnprocessableEntityException', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(makePurchaseOrder());
      purchaseReturnRepository.create.mockRejectedValue(
        new PurchaseReturnExceedsReceivedError('item-1'),
      );
      await expect(
        service.create(
          {
            purchaseOrderId: 'po-1',
            reason: 'DAMAGED',
            items: [{ purchaseItemId: 'item-1', quantity: 5 }],
          },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      purchaseReturnRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('search', () => {
    it('map query sang search params với page/limit mặc định', async () => {
      purchaseReturnRepository.search.mockResolvedValue({
        items: [makeReturn()],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search(
        { supplierId: 'supplier-1' },
        'org-1',
      );
      expect(result.total).toBe(1);
      expect(purchaseReturnRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          supplierId: 'supplier-1',
          page: 1,
          limit: 20,
        }),
      );
    });
  });

  describe('approve', () => {
    it('gọi repository.approve và ghi audit log', async () => {
      purchaseReturnRepository.findById.mockResolvedValue(makeReturn());
      purchaseReturnRepository.approve.mockResolvedValue(
        makeReturn({ status: 'APPROVED' }),
      );

      const result = await service.approve('pr-1', actor);
      expect(result.status).toBe('APPROVED');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'purchase_return.approve' }),
      );
    });

    it('dịch StatusConflictError sang UnprocessableEntityException', async () => {
      purchaseReturnRepository.findById.mockResolvedValue(makeReturn());
      purchaseReturnRepository.approve.mockRejectedValue(
        new PurchaseReturnStatusConflictError('APPROVED'),
      );
      await expect(service.approve('pr-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('complete', () => {
    it('gọi repository.complete và ghi audit log', async () => {
      purchaseReturnRepository.findById.mockResolvedValue(
        makeReturn({ status: 'APPROVED' }),
      );
      purchaseReturnRepository.complete.mockResolvedValue(
        makeReturn({ status: 'COMPLETED' }),
      );

      const result = await service.complete('pr-1', actor);
      expect(result.status).toBe('COMPLETED');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'purchase_return.complete' }),
      );
    });

    it('dịch NegativeStockError sang UnprocessableEntityException', async () => {
      purchaseReturnRepository.findById.mockResolvedValue(
        makeReturn({ status: 'APPROVED' }),
      );
      purchaseReturnRepository.complete.mockRejectedValue(
        new PurchaseReturnNegativeStockError('product-1'),
      );
      await expect(service.complete('pr-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('dịch InventoryConcurrencyConflictError sang ConflictException (Optimistic Lock)', async () => {
      purchaseReturnRepository.findById.mockResolvedValue(
        makeReturn({ status: 'APPROVED' }),
      );
      purchaseReturnRepository.complete.mockRejectedValue(
        new InventoryConcurrencyConflictError('product-1'),
      );
      await expect(service.complete('pr-1', actor)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('cancel', () => {
    it('gọi repository.cancel và ghi audit log', async () => {
      purchaseReturnRepository.findById.mockResolvedValue(makeReturn());
      purchaseReturnRepository.cancel.mockResolvedValue(
        makeReturn({ status: 'CANCELLED' }),
      );

      const result = await service.cancel('pr-1', actor);
      expect(result.status).toBe('CANCELLED');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'purchase_return.cancel' }),
      );
    });

    it('dịch StatusConflictError sang UnprocessableEntityException', async () => {
      purchaseReturnRepository.findById.mockResolvedValue(
        makeReturn({ status: 'COMPLETED' }),
      );
      purchaseReturnRepository.cancel.mockRejectedValue(
        new PurchaseReturnStatusConflictError('COMPLETED'),
      );
      await expect(service.cancel('pr-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
