import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { WarehouseService } from '../../warehouse/application/warehouse.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { InventoryConcurrencyConflictError } from '../../inventory/domain/errors/inventory.errors';
import { TransferEntity } from '../domain/entities/transfer.entity';
import {
  ITransferRepository,
  TransferConcurrencyConflictError,
  TransferNegativeStockError,
  TransferStatusConflictError,
} from '../domain/repositories/transfer.repository.interface';
import { ITransferCodeGenerator } from '../domain/services/transfer-code-generator.interface';
import { ActorContext, TransferService } from './transfer.service';

describe('TransferService', () => {
  let service: TransferService;
  let transferRepository: jest.Mocked<ITransferRepository>;
  let codeGenerator: jest.Mocked<ITransferCodeGenerator>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;
  let warehouseService: jest.Mocked<Pick<WarehouseService, 'findOne'>>;
  let productDomainService: jest.Mocked<Pick<ProductDomainService, 'findById'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeTransfer = (
    overrides: Partial<TransferEntity> = {},
  ): TransferEntity => ({
    id: 'transfer-1',
    organizationId: 'org-1',
    fromWarehouseId: 'wh-a',
    toWarehouseId: 'wh-b',
    code: 'PDC000001',
    status: 'PENDING',
    note: null,
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    items: [
      { id: 'item-1', productId: 'product-1', quantity: '10', unitCost: null },
    ],
    ...overrides,
  });

  beforeEach(() => {
    transferRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      search: jest.fn(),
      existsByCode: jest.fn(),
      transitionStatus: jest.fn(),
    };
    codeGenerator = { generate: jest.fn().mockResolvedValue('PDC000001') };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    // T051.06B — mặc định resolve (Warehouse/Product thuộc actor.organizationId) để mọi test
    // hiện có không bị ảnh hưởng; test negative-path bên dưới tự override.
    warehouseService = { findOne: jest.fn().mockResolvedValue({}) };
    productDomainService = {
      findById: jest.fn().mockResolvedValue({}),
    };

    service = new TransferService(
      transferRepository,
      codeGenerator,
      auditLogService as unknown as AuditLogService,
      warehouseService as unknown as WarehouseService,
      productDomainService as unknown as ProductDomainService,
    );
  });

  describe('create', () => {
    const dto = {
      fromWarehouseId: 'wh-a',
      toWarehouseId: 'wh-b',
      items: [{ productId: 'product-1', quantity: 10 }],
    };

    it('từ chối khi kho nguồn và kho đích trùng nhau', async () => {
      await expect(
        service.create({ ...dto, toWarehouseId: 'wh-a' }, actor),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(transferRepository.create).not.toHaveBeenCalled();
    });

    it('từ chối khi không có sản phẩm nào', async () => {
      await expect(
        service.create({ ...dto, items: [] }, actor),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('tạo thành công và ghi audit log', async () => {
      transferRepository.create.mockResolvedValue(makeTransfer());
      const result = await service.create(dto, actor);
      expect(result.code).toBe('PDC000001');
      expect(codeGenerator.generate).toHaveBeenCalledWith('org-1');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'transfer.create' }),
      );
    });

    describe('[T051.06B] fromWarehouseId/toWarehouseId/productId phải thuộc actor.organizationId', () => {
      it('Kho nguồn cùng tổ chức — gọi warehouseService.findOne(fromWarehouseId, org), cho qua', async () => {
        transferRepository.create.mockResolvedValue(makeTransfer());
        await service.create(dto, actor);
        expect(warehouseService.findOne).toHaveBeenCalledWith('wh-a', 'org-1');
      });

      it('Kho nguồn khác tổ chức — reject, repository.create() KHÔNG được gọi', async () => {
        warehouseService.findOne.mockImplementation((id) =>
          id === 'wh-a'
            ? Promise.reject(new NotFoundException('Không tìm thấy kho'))
            : Promise.resolve({} as never),
        );
        await expect(service.create(dto, actor)).rejects.toThrow(
          NotFoundException,
        );
        expect(transferRepository.create).not.toHaveBeenCalled();
      });

      it('Kho đích cùng tổ chức — gọi warehouseService.findOne(toWarehouseId, org), cho qua', async () => {
        transferRepository.create.mockResolvedValue(makeTransfer());
        await service.create(dto, actor);
        expect(warehouseService.findOne).toHaveBeenCalledWith('wh-b', 'org-1');
      });

      it('Kho đích khác tổ chức — reject, repository.create() KHÔNG được gọi', async () => {
        warehouseService.findOne.mockImplementation((id) =>
          id === 'wh-b'
            ? Promise.reject(new NotFoundException('Không tìm thấy kho'))
            : Promise.resolve({} as never),
        );
        await expect(service.create(dto, actor)).rejects.toThrow(
          NotFoundException,
        );
        expect(transferRepository.create).not.toHaveBeenCalled();
      });

      it('Product (dòng hàng) khác tổ chức (hoặc không tồn tại) — reject, repository.create() KHÔNG được gọi', async () => {
        productDomainService.findById.mockResolvedValue(null);
        await expect(service.create(dto, actor)).rejects.toThrow(
          NotFoundException,
        );
        expect(transferRepository.create).not.toHaveBeenCalled();
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
                { productId: 'product-1', quantity: 10 },
                { productId: 'product-foreign', quantity: 5 },
              ],
            },
            actor,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(transferRepository.create).not.toHaveBeenCalled();
      });

      it('Thứ tự: Kho nguồn/Kho đích/Product được xác minh TRƯỚC repository.create()', async () => {
        const callOrder: string[] = [];
        warehouseService.findOne.mockImplementation((id) => {
          callOrder.push(`warehouse:${id}`);
          return Promise.resolve({} as never);
        });
        productDomainService.findById.mockImplementation((id) => {
          callOrder.push(`product:${id}`);
          return Promise.resolve({} as never);
        });
        transferRepository.create.mockImplementation(() => {
          callOrder.push('repository.create');
          return Promise.resolve(makeTransfer());
        });

        await service.create(dto, actor);

        expect(callOrder.indexOf('repository.create')).toBe(
          callOrder.length - 1,
        );
        expect(callOrder.slice(0, 3).sort()).toEqual(
          ['warehouse:wh-a', 'warehouse:wh-b', 'product:product-1'].sort(),
        );
      });
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      transferRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('search', () => {
    it('map query sang search params', async () => {
      transferRepository.search.mockResolvedValue({
        items: [makeTransfer()],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({ status: 'PENDING' }, 'org-1');
      expect(result.total).toBe(1);
      expect(transferRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          status: 'PENDING',
          page: 1,
          limit: 20,
        }),
      );
    });
  });

  describe('approve', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      transferRepository.findById.mockResolvedValue(null);
      await expect(service.approve('missing', 1, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gọi transitionStatus kèm organizationId/expectedVersion, movement direction=OUT + captureUnitCostToItem', async () => {
      transferRepository.findById.mockResolvedValue(
        makeTransfer({ version: 1 }),
      );
      transferRepository.transitionStatus.mockResolvedValue(
        makeTransfer({ status: 'APPROVED', version: 2 }),
      );

      const result = await service.approve('transfer-1', 1, actor);

      expect(result.status).toBe('APPROVED');
      expect(result.version).toBe(2);
      expect(transferRepository.transitionStatus).toHaveBeenCalledWith(
        'transfer-1',
        'org-1',
        ['PENDING'],
        'APPROVED',
        1,
        [
          expect.objectContaining({
            transferItemId: 'item-1',
            warehouseId: 'wh-a',
            productId: 'product-1',
            quantity: 10,
            direction: 'OUT',
            captureUnitCostToItem: true,
          }),
        ],
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'transfer.approve' }),
      );
    });

    it('dịch TransferStatusConflictError sang UnprocessableEntityException', async () => {
      transferRepository.findById.mockResolvedValue(makeTransfer());
      transferRepository.transitionStatus.mockRejectedValue(
        new TransferStatusConflictError('CANCELLED'),
      );
      await expect(service.approve('transfer-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('dịch TransferNegativeStockError sang UnprocessableEntityException', async () => {
      transferRepository.findById.mockResolvedValue(makeTransfer());
      transferRepository.transitionStatus.mockRejectedValue(
        new TransferNegativeStockError('product-1'),
      );
      await expect(service.approve('transfer-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('dịch InventoryConcurrencyConflictError sang ConflictException', async () => {
      transferRepository.findById.mockResolvedValue(makeTransfer());
      transferRepository.transitionStatus.mockRejectedValue(
        new InventoryConcurrencyConflictError('product-1'),
      );
      await expect(service.approve('transfer-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('T051.02: dịch TransferConcurrencyConflictError sang ConflictException (TRANSFER_008)', async () => {
      transferRepository.findById.mockResolvedValue(makeTransfer());
      transferRepository.transitionStatus.mockRejectedValue(
        new TransferConcurrencyConflictError('transfer-1'),
      );
      let caught: ConflictException | undefined;
      try {
        await service.approve('transfer-1', 1, actor);
      } catch (error) {
        caught = error as ConflictException;
      }
      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught?.getResponse() as { errorCode?: string })?.errorCode).toBe(
        'TRANSFER_008',
      );
    });
  });

  describe('receive', () => {
    it('gọi transitionStatus với movement TRANSFER_IN dương, mang unitCost đã capture', async () => {
      transferRepository.findById.mockResolvedValue(
        makeTransfer({
          status: 'APPROVED',
          version: 2,
          items: [
            {
              id: 'item-1',
              productId: 'product-1',
              quantity: '10',
              unitCost: '50',
            },
          ],
        }),
      );
      transferRepository.transitionStatus.mockResolvedValue(
        makeTransfer({ status: 'RECEIVED', version: 3 }),
      );

      await service.receive('transfer-1', 2, actor);

      expect(transferRepository.transitionStatus).toHaveBeenCalledWith(
        'transfer-1',
        'org-1',
        ['APPROVED'],
        'RECEIVED',
        2,
        [
          expect.objectContaining({
            warehouseId: 'wh-b',
            productId: 'product-1',
            quantity: 10,
            unitCost: 50,
            direction: 'IN',
          }),
        ],
        'user-1',
      );
    });
  });

  describe('cancel', () => {
    it('từ chối khi trạng thái không cho phép hủy (RECEIVED)', async () => {
      transferRepository.findById.mockResolvedValue(
        makeTransfer({ status: 'RECEIVED' }),
      );
      await expect(service.cancel('transfer-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(transferRepository.transitionStatus).not.toHaveBeenCalled();
    });

    it('hủy từ PENDING không sinh movement nào', async () => {
      transferRepository.findById.mockResolvedValue(
        makeTransfer({ status: 'PENDING', version: 1 }),
      );
      transferRepository.transitionStatus.mockResolvedValue(
        makeTransfer({ status: 'CANCELLED', version: 2 }),
      );

      await service.cancel('transfer-1', 1, actor);

      expect(transferRepository.transitionStatus).toHaveBeenCalledWith(
        'transfer-1',
        'org-1',
        ['PENDING'],
        'CANCELLED',
        1,
        [],
        'user-1',
      );
    });

    it('hủy từ APPROVED hoàn lại kho nguồn với unitCost đã capture', async () => {
      transferRepository.findById.mockResolvedValue(
        makeTransfer({
          status: 'APPROVED',
          version: 2,
          items: [
            {
              id: 'item-1',
              productId: 'product-1',
              quantity: '10',
              unitCost: '50',
            },
          ],
        }),
      );
      transferRepository.transitionStatus.mockResolvedValue(
        makeTransfer({ status: 'CANCELLED', version: 3 }),
      );

      await service.cancel('transfer-1', 2, actor);

      expect(transferRepository.transitionStatus).toHaveBeenCalledWith(
        'transfer-1',
        'org-1',
        ['APPROVED'],
        'CANCELLED',
        2,
        [
          expect.objectContaining({
            warehouseId: 'wh-a',
            productId: 'product-1',
            quantity: 10,
            unitCost: 50,
            direction: 'IN',
          }),
        ],
        'user-1',
      );
    });
  });
});
