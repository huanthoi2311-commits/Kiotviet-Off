import { ConflictException } from '@nestjs/common';
import { CheckoutOperationEntity } from '../domain/entities/checkout-operation.entity';
import { CheckoutOperationConflictError } from '../domain/errors/checkout-operation.errors';
import { ICheckoutOperationRepository } from '../domain/repositories/checkout-operation.repository.interface';
import { CheckoutOperationService } from './checkout-operation.service';

describe('CheckoutOperationService', () => {
  let service: CheckoutOperationService;
  let repository: jest.Mocked<ICheckoutOperationRepository>;

  const payload = { branchId: 'branch-1', paymentMethod: 'CASH' };

  const makeOperation = (
    overrides: Partial<CheckoutOperationEntity> = {},
  ): CheckoutOperationEntity => ({
    id: 'op-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    idempotencyKey: 'key-1',
    requestHash: 'will-be-overridden',
    status: 'PROCESSING',
    invoiceId: null,
    paymentId: null,
    createdBy: 'user-1',
    createdAt: new Date(),
    completedAt: null,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    ...overrides,
  });

  beforeEach(() => {
    repository = {
      findByKey: jest.fn(),
      create: jest.fn(),
      tryReclaim: jest.fn(),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
      findStuckProcessing: jest.fn(),
      deleteExpired: jest.fn(),
    };
    service = new CheckoutOperationService(repository);
  });

  describe('reserve — request mới hoàn toàn', () => {
    it('không tìm thấy key → tạo mới, trả NEW', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.create.mockResolvedValue(makeOperation());

      const result = await service.reserve({
        organizationId: 'org-1',
        branchId: 'branch-1',
        idempotencyKey: 'key-1',
        payload,
        createdBy: 'user-1',
      });

      expect(result).toEqual({ kind: 'NEW', operationId: 'op-1' });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          branchId: 'branch-1',
          idempotencyKey: 'key-1',
          createdBy: 'user-1',
          requestHash: expect.any(String),
        }),
      );
    });

    it('hash payload ổn định bất kể thứ tự key (deep sort)', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.create.mockResolvedValue(makeOperation());

      await service.reserve({
        organizationId: 'org-1',
        branchId: 'branch-1',
        idempotencyKey: 'key-1',
        payload: { a: 1, b: { y: 2, x: 1 } },
        createdBy: 'user-1',
      });
      const hash1 = repository.create.mock.calls[0][0].requestHash;

      repository.findByKey.mockResolvedValue(null);
      await service.reserve({
        organizationId: 'org-1',
        branchId: 'branch-1',
        idempotencyKey: 'key-1',
        payload: { b: { x: 1, y: 2 }, a: 1 },
        createdBy: 'user-1',
      });
      const hash2 = repository.create.mock.calls[1][0].requestHash;

      expect(hash1).toBe(hash2);
    });
  });

  describe('reserve — request trùng lặp (duplicate)', () => {
    it('COMPLETED + hash khớp → REPLAY, không tạo mới', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.create.mockResolvedValue(makeOperation());
      await service.reserve({
        organizationId: 'org-1',
        branchId: 'branch-1',
        idempotencyKey: 'key-1',
        payload,
        createdBy: 'user-1',
      });
      const requestHash = repository.create.mock.calls[0][0].requestHash;

      repository.findByKey.mockResolvedValue(
        makeOperation({
          status: 'COMPLETED',
          requestHash,
          invoiceId: 'invoice-1',
          paymentId: 'payment-1',
        }),
      );

      const result = await service.reserve({
        organizationId: 'org-1',
        branchId: 'branch-1',
        idempotencyKey: 'key-1',
        payload,
        createdBy: 'user-1',
      });

      expect(result).toEqual({
        kind: 'REPLAY',
        invoiceId: 'invoice-1',
        paymentId: 'payment-1',
      });
      expect(repository.create).toHaveBeenCalledTimes(1); // không gọi thêm lần nữa
    });

    it('COMPLETED + hash khác → 409 CHECKOUT_IDEMPOTENCY_KEY_REUSED', async () => {
      repository.findByKey.mockResolvedValue(
        makeOperation({
          status: 'COMPLETED',
          requestHash: 'hash-cua-payload-khac',
          invoiceId: 'invoice-1',
          paymentId: 'payment-1',
        }),
      );

      await expect(
        service.reserve({
          organizationId: 'org-1',
          branchId: 'branch-1',
          idempotencyKey: 'key-1',
          payload,
          createdBy: 'user-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reserve — PROCESSING còn hạn (request khác đang xử lý thật)', () => {
    it('409 CHECKOUT_IDEMPOTENCY_CONFLICT, không gọi tryReclaim', async () => {
      repository.findByKey.mockResolvedValue(
        makeOperation({ status: 'PROCESSING', createdAt: new Date() }),
      );

      await expect(
        service.reserve({
          organizationId: 'org-1',
          branchId: 'branch-1',
          idempotencyKey: 'key-1',
          payload,
          createdBy: 'user-1',
        }),
      ).rejects.toThrow(ConflictException);
      expect(repository.tryReclaim).not.toHaveBeenCalled();
    });
  });

  describe('reserve — PROCESSING recovery (bị treo quá 2 phút)', () => {
    it('tryReclaim() thành công → NEW', async () => {
      const stuckCreatedAt = new Date(Date.now() - 3 * 60 * 1000); // 3 phút trước
      repository.findByKey.mockResolvedValue(
        makeOperation({ status: 'PROCESSING', createdAt: stuckCreatedAt }),
      );
      repository.tryReclaim.mockResolvedValue(
        makeOperation({ id: 'op-1', status: 'PROCESSING' }),
      );

      const result = await service.reserve({
        organizationId: 'org-1',
        branchId: 'branch-1',
        idempotencyKey: 'key-1',
        payload,
        createdBy: 'user-1',
      });

      expect(result).toEqual({ kind: 'NEW', operationId: 'op-1' });
      expect(repository.tryReclaim).toHaveBeenCalledWith(
        'op-1',
        expect.any(String),
        2 * 60 * 1000,
        expect.any(Date),
      );
    });

    it('[Concurrency] 2 request cùng cố reclaim 1 row bị treo — 1 request thua race nhận 409', async () => {
      const stuckCreatedAt = new Date(Date.now() - 3 * 60 * 1000);
      repository.findByKey.mockResolvedValue(
        makeOperation({ status: 'PROCESSING', createdAt: stuckCreatedAt }),
      );
      // Request đầu tiên chiếm được (tryReclaim trả về row).
      repository.tryReclaim.mockResolvedValueOnce(
        makeOperation({ id: 'op-1', status: 'PROCESSING' }),
      );
      // Request thứ hai đến ngay sau, tryReclaim không còn gì để chiếm (đã bị request đầu đổi trạng thái).
      repository.tryReclaim.mockResolvedValueOnce(null);

      const first = await service.reserve({
        organizationId: 'org-1',
        branchId: 'branch-1',
        idempotencyKey: 'key-1',
        payload,
        createdBy: 'user-1',
      });
      expect(first).toEqual({ kind: 'NEW', operationId: 'op-1' });

      await expect(
        service.reserve({
          organizationId: 'org-1',
          branchId: 'branch-1',
          idempotencyKey: 'key-1',
          payload,
          createdBy: 'user-2',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reserve — FAILED (retry sau lỗi nghiệp vụ hoặc PROCESSING Recovery trước đó)', () => {
    it('tryReclaim() thành công → NEW', async () => {
      repository.findByKey.mockResolvedValue(
        makeOperation({ status: 'FAILED' }),
      );
      repository.tryReclaim.mockResolvedValue(
        makeOperation({ id: 'op-1', status: 'PROCESSING' }),
      );

      const result = await service.reserve({
        organizationId: 'org-1',
        branchId: 'branch-1',
        idempotencyKey: 'key-1',
        payload,
        createdBy: 'user-1',
      });

      expect(result).toEqual({ kind: 'NEW', operationId: 'op-1' });
    });
  });

  describe('reserve — [Concurrency] 2 request đồng thời hoàn toàn mới cùng key', () => {
    it('request thứ hai gặp CheckoutOperationConflictError (P2002) từ create() → 409, không tạo 2 operation', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.create.mockRejectedValue(
        new CheckoutOperationConflictError('key-1'),
      );

      await expect(
        service.reserve({
          organizationId: 'org-1',
          branchId: 'branch-1',
          idempotencyKey: 'key-1',
          payload,
          createdBy: 'user-2',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('markCompleted', () => {
    it('ủy quyền cho repository.markCompleted kèm tx', async () => {
      const tx = {} as never;
      await service.markCompleted('op-1', 'invoice-1', 'payment-1', tx);
      expect(repository.markCompleted).toHaveBeenCalledWith(
        'op-1',
        'invoice-1',
        'payment-1',
        tx,
      );
    });
  });

  describe('markFailed', () => {
    it('ủy quyền cho repository.markFailed', async () => {
      await service.markFailed('op-1');
      expect(repository.markFailed).toHaveBeenCalledWith('op-1');
    });
  });
});
