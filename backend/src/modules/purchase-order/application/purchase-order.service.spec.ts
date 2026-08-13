import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { BranchService } from '../../branch/application/branch.service';
import { SupplierDomainService } from '../../supplier/application/supplier-domain.service';
import { WarehouseService } from '../../warehouse/application/warehouse.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { InventoryConcurrencyConflictError } from '../../inventory/domain/errors/inventory.errors';
import { PurchaseOrderEntity } from '../domain/entities/purchase-order.entity';
import {
  IPurchaseOrderRepository,
  PurchaseOrderConcurrencyConflictError,
  PurchaseOrderStatusConflictError,
} from '../domain/repositories/purchase-order.repository.interface';
import { IPurchaseOrderCodeGenerator } from '../domain/services/purchase-order-code-generator.interface';
import { ActorContext, PurchaseOrderService } from './purchase-order.service';

describe('PurchaseOrderService', () => {
  let service: PurchaseOrderService;
  let purchaseOrderRepository: jest.Mocked<IPurchaseOrderRepository>;
  let codeGenerator: jest.Mocked<IPurchaseOrderCodeGenerator>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;
  let branchService: jest.Mocked<Pick<BranchService, 'getById'>>;
  let supplierDomainService: jest.Mocked<
    Pick<SupplierDomainService, 'assertBelongsToOrganization'>
  >;
  let warehouseService: jest.Mocked<Pick<WarehouseService, 'findOne'>>;
  let productDomainService: jest.Mocked<Pick<ProductDomainService, 'findById'>>;

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
    version: 1,
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
    // T051.06B — mặc định resolve (Branch/Supplier/Warehouse/Product thuộc actor.organizationId)
    // để mọi test hiện có không bị ảnh hưởng; test negative-path bên dưới tự override.
    branchService = { getById: jest.fn().mockResolvedValue({}) };
    supplierDomainService = {
      assertBelongsToOrganization: jest.fn().mockResolvedValue(undefined),
    };
    warehouseService = { findOne: jest.fn().mockResolvedValue({}) };
    productDomainService = {
      findById: jest.fn().mockResolvedValue({}),
    };

    service = new PurchaseOrderService(
      purchaseOrderRepository,
      codeGenerator,
      auditLogService as unknown as AuditLogService,
      branchService as unknown as BranchService,
      supplierDomainService as unknown as SupplierDomainService,
      warehouseService as unknown as WarehouseService,
      productDomainService as unknown as ProductDomainService,
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

    const baseCreateDto = {
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
    };

    describe('[T051.06B] Branch/Supplier/Warehouse/Product phải thuộc actor.organizationId', () => {
      it('Branch cùng tổ chức — gọi branchService.getById(dto.branchId, actor), cho qua', async () => {
        purchaseOrderRepository.create.mockResolvedValue(makeOrder());
        await service.create(baseCreateDto, actor);
        expect(branchService.getById).toHaveBeenCalledWith('branch-1', actor);
      });

      it('Branch khác tổ chức — reject, repository.create() KHÔNG được gọi', async () => {
        branchService.getById.mockRejectedValue(
          new NotFoundException('Không tìm thấy chi nhánh'),
        );
        await expect(service.create(baseCreateDto, actor)).rejects.toThrow(
          NotFoundException,
        );
        expect(purchaseOrderRepository.create).not.toHaveBeenCalled();
      });

      it('Supplier cùng tổ chức — gọi assertBelongsToOrganization(actor.organizationId, dto.supplierId), cho qua', async () => {
        purchaseOrderRepository.create.mockResolvedValue(makeOrder());
        await service.create(baseCreateDto, actor);
        expect(
          supplierDomainService.assertBelongsToOrganization,
        ).toHaveBeenCalledWith('org-1', 'supplier-1');
      });

      it('Supplier khác tổ chức — reject, repository.create() KHÔNG được gọi', async () => {
        supplierDomainService.assertBelongsToOrganization.mockRejectedValue(
          new NotFoundException('Không tìm thấy nhà cung cấp'),
        );
        await expect(service.create(baseCreateDto, actor)).rejects.toThrow(
          NotFoundException,
        );
        expect(purchaseOrderRepository.create).not.toHaveBeenCalled();
      });

      it('Warehouse (dòng hàng) cùng tổ chức — gọi warehouseService.findOne(warehouseId, actor.organizationId), cho qua', async () => {
        purchaseOrderRepository.create.mockResolvedValue(makeOrder());
        await service.create(baseCreateDto, actor);
        expect(warehouseService.findOne).toHaveBeenCalledWith('wh-1', 'org-1');
      });

      it('Warehouse (dòng hàng) khác tổ chức — reject, repository.create() KHÔNG được gọi', async () => {
        warehouseService.findOne.mockRejectedValue(
          new NotFoundException('Không tìm thấy kho'),
        );
        await expect(service.create(baseCreateDto, actor)).rejects.toThrow(
          NotFoundException,
        );
        expect(purchaseOrderRepository.create).not.toHaveBeenCalled();
      });

      it('Product (dòng hàng) cùng tổ chức — gọi productDomainService.findById(productId, actor.organizationId), cho qua', async () => {
        purchaseOrderRepository.create.mockResolvedValue(makeOrder());
        await service.create(baseCreateDto, actor);
        expect(productDomainService.findById).toHaveBeenCalledWith(
          'product-1',
          'org-1',
        );
      });

      it('Product (dòng hàng) khác tổ chức (hoặc không tồn tại) — reject, repository.create() KHÔNG được gọi', async () => {
        productDomainService.findById.mockResolvedValue(null);
        await expect(service.create(baseCreateDto, actor)).rejects.toThrow(
          NotFoundException,
        );
        expect(purchaseOrderRepository.create).not.toHaveBeenCalled();
      });

      it('Danh sách nhiều dòng hàng, MỘT dòng có warehouseId ngoài tổ chức — toàn bộ request bị reject', async () => {
        warehouseService.findOne.mockImplementation((id) => {
          if (id === 'wh-foreign') {
            return Promise.reject(new NotFoundException('Không tìm thấy kho'));
          }
          return Promise.resolve({} as never);
        });
        await expect(
          service.create(
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
                {
                  productId: 'product-2',
                  warehouseId: 'wh-foreign',
                  quantity: 5,
                  unitCost: 2000,
                },
              ],
            },
            actor,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(purchaseOrderRepository.create).not.toHaveBeenCalled();
      });

      it('Thứ tự: Branch/Supplier/Warehouse/Product được xác minh TRƯỚC repository.create()', async () => {
        const callOrder: string[] = [];
        branchService.getById.mockImplementation(() => {
          callOrder.push('branch');
          return Promise.resolve({} as never);
        });
        supplierDomainService.assertBelongsToOrganization.mockImplementation(
          () => {
            callOrder.push('supplier');
            return Promise.resolve(undefined);
          },
        );
        warehouseService.findOne.mockImplementation(() => {
          callOrder.push('warehouse');
          return Promise.resolve({} as never);
        });
        productDomainService.findById.mockImplementation(() => {
          callOrder.push('product');
          return Promise.resolve({} as never);
        });
        purchaseOrderRepository.create.mockImplementation(() => {
          callOrder.push('repository.create');
          return Promise.resolve(makeOrder());
        });

        await service.create(baseCreateDto, actor);

        expect(callOrder.indexOf('repository.create')).toBe(
          callOrder.length - 1,
        );
        expect(callOrder.slice(0, 4).sort()).toEqual(
          ['branch', 'supplier', 'warehouse', 'product'].sort(),
        );
      });
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
      await expect(service.receive('missing', 1, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gọi repository.receive kèm expectedVersion và ghi audit log', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(
        makeOrder({ status: 'APPROVED', version: 3 }),
      );
      purchaseOrderRepository.receive.mockResolvedValue(
        makeOrder({ status: 'RECEIVED', version: 4 }),
      );

      const result = await service.receive('po-1', 3, actor);
      expect(result.status).toBe('RECEIVED');
      expect(result.version).toBe(4);
      expect(purchaseOrderRepository.receive).toHaveBeenCalledWith(
        'po-1',
        'org-1',
        3,
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
      await expect(service.receive('po-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('dịch InventoryConcurrencyConflictError sang ConflictException (Optimistic Lock)', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(makeOrder());
      purchaseOrderRepository.receive.mockRejectedValue(
        new InventoryConcurrencyConflictError('product-1'),
      );
      await expect(service.receive('po-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('T051.02: dịch PurchaseOrderConcurrencyConflictError sang ConflictException (PURCHASE_ORDER_005)', async () => {
      purchaseOrderRepository.findById.mockResolvedValue(
        makeOrder({ status: 'APPROVED', version: 1 }),
      );
      purchaseOrderRepository.receive.mockRejectedValue(
        new PurchaseOrderConcurrencyConflictError('po-1'),
      );
      let caught: ConflictException | undefined;
      try {
        await service.receive('po-1', 1, actor);
      } catch (error) {
        caught = error as ConflictException;
      }
      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught?.getResponse() as { errorCode?: string })?.errorCode).toBe(
        'PURCHASE_ORDER_005',
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
