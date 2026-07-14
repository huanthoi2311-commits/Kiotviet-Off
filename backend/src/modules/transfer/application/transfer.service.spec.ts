import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { TransferEntity } from '../domain/entities/transfer.entity';
import {
  ITransferRepository,
  TransferStatusConflictError,
} from '../domain/repositories/transfer.repository.interface';
import { ITransferCodeGenerator } from '../domain/services/transfer-code-generator.interface';
import { ActorContext, TransferService } from './transfer.service';

describe('TransferService', () => {
  let service: TransferService;
  let transferRepository: jest.Mocked<ITransferRepository>;
  let codeGenerator: jest.Mocked<ITransferCodeGenerator>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

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

    service = new TransferService(
      transferRepository,
      codeGenerator,
      auditLogService as unknown as AuditLogService,
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
      await expect(service.approve('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gọi transitionStatus với movement TRANSFER_OUT âm + captureUnitCostToItem', async () => {
      transferRepository.findById.mockResolvedValue(makeTransfer());
      transferRepository.transitionStatus.mockResolvedValue(
        makeTransfer({ status: 'APPROVED' }),
      );

      const result = await service.approve('transfer-1', actor);

      expect(result.status).toBe('APPROVED');
      expect(transferRepository.transitionStatus).toHaveBeenCalledWith(
        'transfer-1',
        ['PENDING'],
        'APPROVED',
        [
          expect.objectContaining({
            transferItemId: 'item-1',
            warehouseId: 'wh-a',
            productId: 'product-1',
            quantity: -10,
            movementType: 'TRANSFER_OUT',
            referenceType: 'TRANSFER',
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
      await expect(service.approve('transfer-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('receive', () => {
    it('gọi transitionStatus với movement TRANSFER_IN dương, mang unitCost đã capture', async () => {
      transferRepository.findById.mockResolvedValue(
        makeTransfer({
          status: 'APPROVED',
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
        makeTransfer({ status: 'RECEIVED' }),
      );

      await service.receive('transfer-1', actor);

      expect(transferRepository.transitionStatus).toHaveBeenCalledWith(
        'transfer-1',
        ['APPROVED'],
        'RECEIVED',
        [
          expect.objectContaining({
            warehouseId: 'wh-b',
            productId: 'product-1',
            quantity: 10,
            unitCost: 50,
            movementType: 'TRANSFER_IN',
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
      await expect(service.cancel('transfer-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(transferRepository.transitionStatus).not.toHaveBeenCalled();
    });

    it('hủy từ PENDING không sinh movement nào', async () => {
      transferRepository.findById.mockResolvedValue(
        makeTransfer({ status: 'PENDING' }),
      );
      transferRepository.transitionStatus.mockResolvedValue(
        makeTransfer({ status: 'CANCELLED' }),
      );

      await service.cancel('transfer-1', actor);

      expect(transferRepository.transitionStatus).toHaveBeenCalledWith(
        'transfer-1',
        ['PENDING'],
        'CANCELLED',
        [],
        'user-1',
      );
    });

    it('hủy từ APPROVED hoàn lại kho nguồn với unitCost đã capture', async () => {
      transferRepository.findById.mockResolvedValue(
        makeTransfer({
          status: 'APPROVED',
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
        makeTransfer({ status: 'CANCELLED' }),
      );

      await service.cancel('transfer-1', actor);

      expect(transferRepository.transitionStatus).toHaveBeenCalledWith(
        'transfer-1',
        ['APPROVED'],
        'CANCELLED',
        [
          expect.objectContaining({
            warehouseId: 'wh-a',
            productId: 'product-1',
            quantity: 10,
            unitCost: 50,
            movementType: 'TRANSFER_IN',
          }),
        ],
        'user-1',
      );
    });
  });
});
