import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { PurchaseOrderEntity } from '../domain/entities/purchase-order.entity';
import {
  IPurchaseOrderRepository,
  PurchaseOrderStatusConflictError,
} from '../domain/repositories/purchase-order.repository.interface';
import { IPurchaseOrderCodeGenerator } from '../domain/services/purchase-order-code-generator.interface';
import { ActorContext, PurchaseOrderService } from './purchase-order.service';

describe('PurchaseOrderService', () => {
  let service: PurchaseOrderService;
  let purchaseOrderRepository: jest.Mocked<IPurchaseOrderRepository>;
  let codeGenerator: jest.Mocked<IPurchaseOrderCodeGenerator>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeOrder = (
    overrides: Partial<PurchaseOrderEntity> = {},
  ): PurchaseOrderEntity => ({
    id: 'po-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    supplierId: 'supplier-1',
    code: 'PN000001',
    status: 'DRAFT',
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
        receivedQuantity: '0',
        unitCost: '10000',
        discount: '0',
        taxAmount: '0',
        totalAmount: '1000000',
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    purchaseOrderRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      search: jest.fn(),
      existsByCode: jest.fn(),
      approve: jest.fn(),
      receive: jest.fn(),
      cancel: jest.fn(),
    };
    codeGenerator = { generate: jest.fn().mockResolvedValue('PN000001') };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new PurchaseOrderService(
      purchaseOrderRepository,
      codeGenerator,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('create', () => {
    it('tính totalAmount từng dòng + tổng đơn, sinh code, ghi audit log', async () => {
      purchaseOrderRepository.create.mockResolvedValue(makeOrder());

      const result = await service.create(
        {
          branchId: 'branch-1',
          supplierId: 'supplier-1',
          items: [
            {
              productId: 'product-1',
              warehouseId: 'wh-1',
              quantity: 100,
              unitCost: 10000,
              discount: 5000,
              taxAmount: 2000,
            },
          ],
        },
        actor,
      );

      expect(result.code).toBe('PN000001');
      expect(codeGenerator.generate).toHaveBeenCalledWith('org-1');
      expect(purchaseOrderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          totalAmount: 100 * 10000 - 5000 + 2000,
          items: [
            expect.objectContaining({
              productId: 'product-1',
              warehouseId: 'wh-1',
              quantity: 100,
              unitCost: 10000,
              discount: 5000,
              taxAmount: 2000,
              totalAmount: 100 * 10000 - 5000 + 2000,
            }),
          ],
        }),
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'purchase_order.create' }),
      );
    });

    it('mặc định discount/taxAmount = 0 khi không truyền', async () => {
      purchaseOrderRepository.create.mockResolvedValue(makeOrder());

      await service.create(
        {
          branchId: 'branch-1',
          supplierId: 'supplier-1',
          items: [
            {
              productId: 'product-1',
              warehouseId: 'wh-1',
              quantity: 10,
              unitCost: 1000,
            },
          ],
        },
        actor,
      );

      expect(purchaseOrderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAmount: 10000,
          items: [
            expect.objectContaining({
              discount: 0,
              taxAmount: 0,
              totalAmount: 10000,
            }),
          ],
        }),
      );
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('trả về order khi tồn tại', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(makeOrder());
      const result = await service.findOne('po-1', 'org-1');
      expect(result.id).toBe('po-1');
    });
  });

  describe('search', () => {
    it('map query sang search params với page/limit mặc định', async () => {
      purchaseOrderRepository.search.mockResolvedValue({
        items: [makeOrder()],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search(
        { supplierId: 'supplier-1' },
        'org-1',
      );
      expect(result.total).toBe(1);
      expect(purchaseOrderRepository.search).toHaveBeenCalledWith(
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
    it('ném NotFoundException khi không tồn tại', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(null);
      await expect(service.approve('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gọi repository.approve và ghi audit log', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(makeOrder());
      purchaseOrderRepository.approve.mockResolvedValue(
        makeOrder({ status: 'APPROVED' }),
      );

      const result = await service.approve('po-1', actor);
      expect(result.status).toBe('APPROVED');
      expect(purchaseOrderRepository.approve).toHaveBeenCalledWith(
        'po-1',
        'org-1',
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'purchase_order.approve' }),
      );
    });

    it('dịch StatusConflictError sang UnprocessableEntityException', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(makeOrder());
      purchaseOrderRepository.approve.mockRejectedValue(
        new PurchaseOrderStatusConflictError('APPROVED'),
      );
      await expect(service.approve('po-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('receive', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(null);
      await expect(service.receive('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gọi repository.receive và ghi audit log', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(
        makeOrder({ status: 'APPROVED' }),
      );
      purchaseOrderRepository.receive.mockResolvedValue(
        makeOrder({ status: 'RECEIVED' }),
      );

      const result = await service.receive('po-1', actor);
      expect(result.status).toBe('RECEIVED');
      expect(purchaseOrderRepository.receive).toHaveBeenCalledWith(
        'po-1',
        'org-1',
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'purchase_order.receive' }),
      );
    });

    it('dịch StatusConflictError sang UnprocessableEntityException', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(makeOrder());
      purchaseOrderRepository.receive.mockRejectedValue(
        new PurchaseOrderStatusConflictError('DRAFT'),
      );
      await expect(service.receive('po-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('cancel', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(null);
      await expect(service.cancel('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gọi repository.cancel và ghi audit log', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(makeOrder());
      purchaseOrderRepository.cancel.mockResolvedValue(
        makeOrder({ status: 'CANCELLED' }),
      );

      const result = await service.cancel('po-1', actor);
      expect(result.status).toBe('CANCELLED');
      expect(purchaseOrderRepository.cancel).toHaveBeenCalledWith(
        'po-1',
        'org-1',
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'purchase_order.cancel' }),
      );
    });

    it('dịch StatusConflictError sang UnprocessableEntityException', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(
        makeOrder({ status: 'RECEIVED' }),
      );
      purchaseOrderRepository.cancel.mockRejectedValue(
        new PurchaseOrderStatusConflictError('RECEIVED'),
      );
      await expect(service.cancel('po-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
