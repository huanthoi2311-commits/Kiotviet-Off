import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { DomainEventPublisher } from '../../platform/events/domain-event-publisher.service';
import { InvoiceService } from '../../invoice/application/invoice.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { InventoryDomainService } from '../../inventory/application/inventory-domain.service';
import { WarehouseService } from '../../warehouse/application/warehouse.service';
import {
  SalesReturnConcurrencyRetryError,
  SalesReturnInvalidTransitionError,
  SalesReturnQtyExceededError,
  SalesReturnVersionConflictError,
} from '../domain/errors/sales-return.errors';
import {
  INVENTORY_RESTORED_EVENT,
  SALES_RETURN_RECEIVED_EVENT,
} from '../domain/events/sales-return.events';
import { ISalesReturnRepository } from '../domain/repositories/sales-return.repository.interface';
import { ISalesReturnCodeGenerator } from '../domain/services/sales-return-code-generator.interface';
import { ReturnEligibilityService } from './return-eligibility.service';
import { SalesReturnService } from './sales-return.service';

describe('SalesReturnService', () => {
  let service: SalesReturnService;
  let prisma: { $transaction: jest.Mock };
  let salesReturnRepository: jest.Mocked<ISalesReturnRepository>;
  let codeGenerator: jest.Mocked<ISalesReturnCodeGenerator>;
  let eligibilityService: jest.Mocked<
    Pick<
      ReturnEligibilityService,
      'validateRequestedQuantities' | 'getEligibleQuantity'
    >
  >;
  let invoiceService: jest.Mocked<Pick<InvoiceService, 'getById'>>;
  let productDomainService: jest.Mocked<Pick<ProductDomainService, 'findById'>>;
  let inventoryDomainService: jest.Mocked<
    Pick<InventoryDomainService, 'increase'>
  >;
  let warehouseService: jest.Mocked<Pick<WarehouseService, 'findOne'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;
  let eventPublisher: jest.Mocked<Pick<DomainEventPublisher, 'publish'>>;

  const actor = { userId: 'user-1', organizationId: 'org-1' };

  const invoiceResponse = {
    id: 'inv-1',
    branchId: 'branch-1',
    customerId: 'cus-1',
    status: 'PAID',
    items: [
      {
        id: 'invitem-1',
        productId: 'prod-1',
        quantity: '2.000',
        unitPrice: '100000.00',
        discount: '0.00',
        taxAmount: '20000.00',
        totalAmount: '220000.00',
        productCodeSnapshot: 'SP000001',
        productNameSnapshot: 'Áo thun',
        unitNameSnapshot: 'Cái',
      },
    ],
  };

  const stockProduct = {
    id: 'prod-1',
    type: 'STANDARD',
    costPrice: '80000.00',
  };
  const serviceProduct = {
    id: 'prod-2',
    type: 'SERVICE',
    costPrice: '0.00',
  };

  const salesReturnEntity = {
    id: 'sr-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    invoiceId: 'inv-1',
    customerId: 'cus-1',
    code: 'SR000001',
    status: 'DRAFT',
    totalAmount: '220000.00',
    note: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    version: 1,
    items: [
      {
        id: 'sritem-1',
        invoiceItemId: 'invitem-1',
        productId: 'prod-1',
        warehouseId: 'wh-1',
        quantity: '2.000',
        unitPrice: '100000.00',
        discount: '0.00',
        taxAmount: '20000.00',
        totalAmount: '220000.00',
        productCodeSnapshot: 'SP000001',
        productNameSnapshot: 'Áo thun',
        unitNameSnapshot: 'Cái',
        reason: 'DAMAGED' as const,
        reasonNote: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    ],
    refunds: [] as { amount: string; status: string }[],
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({})),
    };
    salesReturnRepository = {
      create: jest.fn().mockResolvedValue(salesReturnEntity),
      findById: jest.fn(),
      search: jest.fn(),
      updateDraft: jest.fn(),
      submit: jest.fn(),
      approve: jest.fn(),
      receive: jest.fn(),
      complete: jest.fn(),
      cancel: jest.fn(),
      createRefund: jest.fn(),
      findRefundById: jest.fn(),
      processRefund: jest.fn(),
      completeRefund: jest.fn(),
      failRefund: jest.fn(),
      cancelRefund: jest.fn(),
    };
    codeGenerator = { generate: jest.fn().mockResolvedValue('SR000001') };
    eligibilityService = {
      validateRequestedQuantities: jest.fn(),
      getEligibleQuantity: jest.fn(),
    };
    invoiceService = { getById: jest.fn().mockResolvedValue(invoiceResponse) };
    productDomainService = {
      findById: jest.fn().mockResolvedValue(stockProduct),
    };
    inventoryDomainService = {
      increase: jest
        .fn()
        .mockResolvedValue({ movement: {}, avgCostAfter: '0' }),
    };
    warehouseService = {
      findOne: jest.fn().mockResolvedValue({ id: 'wh-1' }),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    eventPublisher = { publish: jest.fn() };

    service = new SalesReturnService(
      prisma as unknown as PrismaService,
      salesReturnRepository,
      codeGenerator,
      eligibilityService as unknown as ReturnEligibilityService,
      invoiceService as unknown as InvoiceService,
      productDomainService as unknown as ProductDomainService,
      inventoryDomainService as unknown as InventoryDomainService,
      warehouseService as unknown as WarehouseService,
      auditLogService as unknown as AuditLogService,
      eventPublisher as unknown as DomainEventPublisher,
    );
  });

  describe('create', () => {
    it('tính lineReturnValue tỉ lệ, gọi eligibility trước khi tạo, audit+event sau khi tạo', async () => {
      const result = await service.create(
        {
          invoiceId: 'inv-1',
          items: [
            {
              invoiceItemId: 'invitem-1',
              quantity: 1,
              reason: 'DAMAGED',
              warehouseId: 'wh-1',
            },
          ],
        },
        actor,
      );

      // invoiceItem totalAmount=220000, quantity=2 -> đơn giá dòng trả = 110000/1 = 110000
      expect(salesReturnRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: 'inv-1',
          branchId: 'branch-1',
          customerId: 'cus-1',
          items: [expect.objectContaining({ totalAmount: 110000 })],
        }),
      );
      expect(
        eligibilityService.validateRequestedQuantities,
      ).toHaveBeenCalledWith(
        [{ invoiceItemId: 'invitem-1', quantity: 1 }],
        'org-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sales_return.create' }),
      );
      expect(eventPublisher.publish).toHaveBeenCalled();
      expect(result.code).toBe('SR000001');
    });

    it('ném UnprocessableEntityException khi Invoice đã CANCELLED', async () => {
      invoiceService.getById.mockResolvedValue({
        ...invoiceResponse,
        status: 'CANCELLED',
      } as never);
      await expect(
        service.create(
          {
            invoiceId: 'inv-1',
            items: [
              { invoiceItemId: 'invitem-1', quantity: 1, reason: 'DAMAGED' },
            ],
          },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('ném UnprocessableEntityException khi invoiceItemId không thuộc Invoice', async () => {
      await expect(
        service.create(
          {
            invoiceId: 'inv-1',
            items: [
              { invoiceItemId: 'invitem-x', quantity: 1, reason: 'DAMAGED' },
            ],
          },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('Phase 5 fix — map SalesReturnQtyExceededError từ eligibilityService.validateRequestedQuantities -> UnprocessableEntityException (trước đây leak thành lỗi 500 chưa map)', async () => {
      eligibilityService.validateRequestedQuantities.mockRejectedValue(
        new SalesReturnQtyExceededError('invitem-1', '1'),
      );
      await expect(
        service.create(
          {
            invoiceId: 'inv-1',
            items: [
              { invoiceItemId: 'invitem-1', quantity: 1, reason: 'DAMAGED' },
            ],
          },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(salesReturnRepository.create).not.toHaveBeenCalled();
    });

    it('map lỗi từ salesReturnRepository.create -> exception tương ứng', async () => {
      salesReturnRepository.create.mockRejectedValue(
        new SalesReturnConcurrencyRetryError(['invitem-1']),
      );
      await expect(
        service.create(
          {
            invoiceId: 'inv-1',
            items: [
              { invoiceItemId: 'invitem-1', quantity: 1, reason: 'DAMAGED' },
            ],
          },
          actor,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateDraft', () => {
    it('Phase 5 fix — map SalesReturnQtyExceededError từ eligibilityService.validateRequestedQuantities -> UnprocessableEntityException', async () => {
      salesReturnRepository.findById.mockResolvedValue(
        salesReturnEntity as never,
      );
      eligibilityService.validateRequestedQuantities.mockRejectedValue(
        new SalesReturnQtyExceededError('invitem-1', '1'),
      );
      await expect(
        service.updateDraft(
          'sr-1',
          1,
          {
            items: [
              { invoiceItemId: 'invitem-1', quantity: 5, reason: 'DAMAGED' },
            ],
          },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(salesReturnRepository.updateDraft).not.toHaveBeenCalled();
    });

    it('cập nhật note thành công khi không đổi items', async () => {
      salesReturnRepository.updateDraft.mockResolvedValue({
        ...salesReturnEntity,
        note: 'note mới',
      } as never);
      const result = await service.updateDraft(
        'sr-1',
        1,
        { note: 'note mới' },
        actor,
      );
      expect(result.note).toBe('note mới');
      expect(
        eligibilityService.validateRequestedQuantities,
      ).not.toHaveBeenCalled();
    });

    it('map lỗi từ salesReturnRepository.updateDraft -> exception tương ứng', async () => {
      salesReturnRepository.updateDraft.mockRejectedValue(
        new SalesReturnVersionConflictError('sr-1'),
      );
      await expect(
        service.updateDraft('sr-1', 1, { note: 'x' }, actor),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('T053.05C-1 — warehouseId tenant validation (create/updateDraft)', () => {
    const itemWithWarehouse = (warehouseId: string | undefined) => ({
      invoiceItemId: 'invitem-1',
      quantity: 1,
      reason: 'DAMAGED' as const,
      warehouseId,
    });

    it('SR-U1: same-tenant Warehouse được chấp nhận — findOne gọi đúng (warehouseId, organizationId)', async () => {
      await service.create(
        { invoiceId: 'inv-1', items: [itemWithWarehouse('wh-1')] },
        actor,
      );
      expect(warehouseService.findOne).toHaveBeenCalledWith('wh-1', 'org-1');
      expect(salesReturnRepository.create).toHaveBeenCalled();
    });

    it('SR-U2: Warehouse không tồn tại — WAREHOUSE_001, write không được gọi', async () => {
      const notFound = new NotFoundException(
        withCode(ErrorCode.WAREHOUSE_NOT_FOUND, 'Không tìm thấy kho'),
      );
      warehouseService.findOne.mockRejectedValueOnce(notFound);

      await expect(
        service.create(
          { invoiceId: 'inv-1', items: [itemWithWarehouse('wh-nonexistent')] },
          actor,
        ),
      ).rejects.toThrow(notFound);
      expect(salesReturnRepository.create).not.toHaveBeenCalled();
    });

    it('SR-U3: Warehouse thuộc tổ chức khác (cross-tenant) — WAREHOUSE_001, write không được gọi', async () => {
      const notFound = new NotFoundException(
        withCode(ErrorCode.WAREHOUSE_NOT_FOUND, 'Không tìm thấy kho'),
      );
      warehouseService.findOne.mockRejectedValueOnce(notFound);

      await expect(
        service.create(
          { invoiceId: 'inv-1', items: [itemWithWarehouse('wh-other-org')] },
          actor,
        ),
      ).rejects.toThrow(notFound);
      expect(salesReturnRepository.create).not.toHaveBeenCalled();
    });

    it('SR-U4: nonexistent và cross-tenant tạo ra CÙNG MỘT exception (không phân biệt được) — WarehouseService.findOne (đã kiểm chứng non-disclosing ở T053.05A) là nguồn duy nhất của hành vi này, service này chỉ cần propagate nguyên trạng', async () => {
      const notFound = new NotFoundException(
        withCode(ErrorCode.WAREHOUSE_NOT_FOUND, 'Không tìm thấy kho'),
      );
      warehouseService.findOne.mockRejectedValue(notFound);

      const nonexistentAttempt = service
        .create(
          { invoiceId: 'inv-1', items: [itemWithWarehouse('wh-nonexistent')] },
          actor,
        )
        .catch((error: unknown) => error);
      const crossTenantAttempt = service
        .create(
          { invoiceId: 'inv-1', items: [itemWithWarehouse('wh-other-org')] },
          actor,
        )
        .catch((error: unknown) => error);

      const [errorA, errorB] = await Promise.all([
        nonexistentAttempt,
        crossTenantAttempt,
      ]);
      expect(errorA).toBe(notFound);
      expect(errorB).toBe(notFound);
    });

    it('SR-U5: bỏ trống warehouseId (Product SERVICE tại thời điểm return) giữ nguyên hành vi cũ — không gọi WarehouseService', async () => {
      await service.create(
        { invoiceId: 'inv-1', items: [itemWithWarehouse(undefined)] },
        actor,
      );
      expect(warehouseService.findOne).not.toHaveBeenCalled();
      expect(salesReturnRepository.create).toHaveBeenCalled();
    });

    it('SR-U6: updateDraft() — same-tenant Warehouse được chấp nhận, findOne gọi đúng tham số', async () => {
      salesReturnRepository.findById.mockResolvedValue(
        salesReturnEntity as never,
      );
      salesReturnRepository.updateDraft.mockResolvedValue(
        salesReturnEntity as never,
      );
      await service.updateDraft(
        'sr-1',
        1,
        { items: [itemWithWarehouse('wh-1')] },
        actor,
      );
      expect(warehouseService.findOne).toHaveBeenCalledWith('wh-1', 'org-1');
      expect(salesReturnRepository.updateDraft).toHaveBeenCalled();
    });

    it('SR-U6: updateDraft() — cross-tenant/nonexistent Warehouse bị từ chối trước khi ghi, updateDraft không được gọi', async () => {
      salesReturnRepository.findById.mockResolvedValue(
        salesReturnEntity as never,
      );
      const notFound = new NotFoundException(
        withCode(ErrorCode.WAREHOUSE_NOT_FOUND, 'Không tìm thấy kho'),
      );
      warehouseService.findOne.mockRejectedValueOnce(notFound);

      await expect(
        service.updateDraft(
          'sr-1',
          1,
          { items: [itemWithWarehouse('wh-other-org')] },
          actor,
        ),
      ).rejects.toThrow(notFound);
      expect(salesReturnRepository.updateDraft).not.toHaveBeenCalled();
    });
  });

  describe('findOne/search/getInvoiceEligibility (Phase 5 — read-only, hoàn thiện API surface)', () => {
    it('findOne trả entity khi tồn tại', async () => {
      salesReturnRepository.findById.mockResolvedValue(
        salesReturnEntity as never,
      );
      const result = await service.findOne('sr-1', 'org-1');
      expect(result.id).toBe('sr-1');
    });

    it('findOne ném NotFoundException khi không tồn tại', async () => {
      salesReturnRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('sr-x', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('search ủy quyền trực tiếp cho repository.search', async () => {
      salesReturnRepository.search.mockResolvedValue({
        items: [salesReturnEntity as never],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
    });

    it('getInvoiceEligibility đọc Invoice rồi tính eligibility cho từng dòng', async () => {
      eligibilityService.getEligibleQuantity.mockResolvedValue({
        invoiceItemId: 'invitem-1',
        soldQty: '2.000',
        returnedQty: '0.000',
        eligibleQty: '2.000',
      });
      const result = await service.getInvoiceEligibility('inv-1', 'org-1');
      expect(invoiceService.getById).toHaveBeenCalledWith('inv-1', 'org-1');
      expect(eligibilityService.getEligibleQuantity).toHaveBeenCalledWith(
        'invitem-1',
        'org-1',
      );
      expect(result).toEqual([
        {
          invoiceItemId: 'invitem-1',
          soldQty: '2.000',
          returnedQty: '0.000',
          eligibleQty: '2.000',
        },
      ]);
    });
  });

  describe('submit/approve/complete/cancel — simpleTransition', () => {
    it('submit thành công, audit + event chạy sau', async () => {
      salesReturnRepository.submit.mockResolvedValue({
        ...salesReturnEntity,
        status: 'SUBMITTED',
      } as never);
      const result = await service.submit('sr-1', 1, actor);
      expect(result.status).toBe('SUBMITTED');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sales_return.submit' }),
      );
    });

    it('approve thành công', async () => {
      salesReturnRepository.approve.mockResolvedValue({
        ...salesReturnEntity,
        status: 'APPROVED',
      } as never);
      const result = await service.approve('sr-1', 1, actor);
      expect(result.status).toBe('APPROVED');
    });

    it('complete thành công', async () => {
      salesReturnRepository.complete.mockResolvedValue({
        ...salesReturnEntity,
        status: 'COMPLETED',
      } as never);
      const result = await service.complete('sr-1', 1, actor);
      expect(result.status).toBe('COMPLETED');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sales_return.complete' }),
      );
    });

    it('cancel thành công', async () => {
      salesReturnRepository.cancel.mockResolvedValue({
        ...salesReturnEntity,
        status: 'CANCELLED',
      } as never);
      const result = await service.cancel('sr-1', 1, actor);
      expect(result.status).toBe('CANCELLED');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sales_return.cancel' }),
      );
    });

    it('map SalesReturnVersionConflictError -> ConflictException', async () => {
      salesReturnRepository.submit.mockRejectedValue(
        new SalesReturnVersionConflictError('sr-1'),
      );
      await expect(service.submit('sr-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('map SalesReturnInvalidTransitionError -> UnprocessableEntityException', async () => {
      salesReturnRepository.approve.mockRejectedValue(
        new SalesReturnInvalidTransitionError('DRAFT', 'APPROVED'),
      );
      await expect(service.approve('sr-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('receive', () => {
    it('gọi repository.receive(tx,...) rồi InventoryDomainService.increase(tx,...) cho dòng STOCK, dùng Product.costPrice làm unitCost', async () => {
      salesReturnRepository.receive.mockResolvedValue({
        ...salesReturnEntity,
        status: 'RECEIVED',
      } as never);

      const result = await service.receive('sr-1', 1, actor);

      expect(salesReturnRepository.receive).toHaveBeenCalledWith(
        {},
        'sr-1',
        'org-1',
        1,
        'user-1',
      );
      expect(inventoryDomainService.increase).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          warehouseId: 'wh-1',
          productId: 'prod-1',
          quantity: 2,
          unitCost: 80000,
          movementType: 'RETURN',
          referenceType: 'RETURN',
          referenceId: 'sr-1',
        }),
      );
      expect(result.status).toBe('RECEIVED');
      // Events + Audit CHỈ sau khi $transaction resolve
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        SALES_RETURN_RECEIVED_EVENT,
        expect.objectContaining({ salesReturnId: 'sr-1' }),
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        INVENTORY_RESTORED_EVENT,
        expect.objectContaining({ productId: 'prod-1', warehouseId: 'wh-1' }),
      );
    });

    it('bỏ qua Inventory cho dòng SERVICE (Decision AD45)', async () => {
      productDomainService.findById.mockResolvedValue(serviceProduct as never);
      salesReturnRepository.receive.mockResolvedValue({
        ...salesReturnEntity,
        status: 'RECEIVED',
      } as never);

      await service.receive('sr-1', 1, actor);

      expect(inventoryDomainService.increase).not.toHaveBeenCalled();
    });

    it('ném lỗi khi dòng STOCK thiếu warehouseId', async () => {
      salesReturnRepository.receive.mockResolvedValue({
        ...salesReturnEntity,
        items: [{ ...salesReturnEntity.items[0], warehouseId: null }],
      } as never);

      await expect(service.receive('sr-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(inventoryDomainService.increase).not.toHaveBeenCalled();
    });

    it('map SalesReturnQtyExceededError (từ repository.receive) -> UnprocessableEntityException, transaction rollback (không publish event)', async () => {
      salesReturnRepository.receive.mockRejectedValue(
        new SalesReturnQtyExceededError('invitem-1', '1'),
      );
      await expect(service.receive('sr-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(eventPublisher.publish).not.toHaveBeenCalled();
      expect(auditLogService.log).not.toHaveBeenCalled();
    });

    it('ném NotFoundException khi Product không tồn tại', async () => {
      productDomainService.findById.mockResolvedValue(null);
      salesReturnRepository.receive.mockResolvedValue({
        ...salesReturnEntity,
        status: 'RECEIVED',
      } as never);
      await expect(service.receive('sr-1', 1, actor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
