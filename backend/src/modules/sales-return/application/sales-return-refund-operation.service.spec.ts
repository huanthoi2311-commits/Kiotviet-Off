import { createHash } from 'crypto';
import { ConflictException } from '@nestjs/common';
import { SalesReturnRefundOperationEntity } from '../domain/entities/sales-return-refund-operation.entity';
import { SalesReturnRefundOperationConflictError } from '../domain/errors/sales-return-refund-operation.errors';
import { ISalesReturnRefundOperationRepository } from '../domain/repositories/sales-return-refund-operation.repository.interface';
import { SalesReturnRefundOperationService } from './sales-return-refund-operation.service';

describe('SalesReturnRefundOperationService', () => {
  let service: SalesReturnRefundOperationService;
  let repository: jest.Mocked<ISalesReturnRefundOperationRepository>;

  const payload = { salesReturnId: 'sr-1', amount: 100000 };

  const makeOperation = (
    overrides: Partial<SalesReturnRefundOperationEntity> = {},
  ): SalesReturnRefundOperationEntity => ({
    id: 'op-1',
    organizationId: 'org-1',
    idempotencyKey: 'key-1',
    requestFingerprint: 'will-be-overridden',
    status: 'PROCESSING',
    refundId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    repository = {
      findByKey: jest.fn(),
      create: jest.fn(),
      tryReclaim: jest.fn(),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
    };
    service = new SalesReturnRefundOperationService(repository);
  });

  describe('reserve — request mới hoàn toàn', () => {
    it('không tìm thấy key → tạo mới, trả NEW', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.create.mockResolvedValue(makeOperation());

      const result = await service.reserve({
        organizationId: 'org-1',
        idempotencyKey: 'key-1',
        payload,
      });

      expect(result).toEqual({ kind: 'NEW', operationId: 'op-1' });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          idempotencyKey: 'key-1',
          requestFingerprint: expect.any(String),
        }),
      );
    });

    it('hash payload ổn định bất kể thứ tự key (deep sort — canonical)', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.create.mockResolvedValue(makeOperation());

      await service.reserve({
        organizationId: 'org-1',
        idempotencyKey: 'key-1',
        payload: { a: 1, b: { y: 2, x: 1 } },
      });
      const hash1 = repository.create.mock.calls[0][0].requestFingerprint;

      repository.findByKey.mockResolvedValue(null);
      await service.reserve({
        organizationId: 'org-1',
        idempotencyKey: 'key-1',
        payload: { b: { x: 1, y: 2 }, a: 1 },
      });
      const hash2 = repository.create.mock.calls[1][0].requestFingerprint;

      expect(hash1).toBe(hash2);
    });

    it('giá trị field payload khác nhau tạo ra fingerprint khác nhau', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.create.mockResolvedValue(makeOperation());

      await service.reserve({
        organizationId: 'org-1',
        idempotencyKey: 'key-1',
        payload: { salesReturnId: 'sr-1', amount: 100000 },
      });
      const hash1 = repository.create.mock.calls[0][0].requestFingerprint;

      repository.findByKey.mockResolvedValue(null);
      await service.reserve({
        organizationId: 'org-1',
        idempotencyKey: 'key-1',
        payload: { salesReturnId: 'sr-1', amount: 999999 },
      });
      const hash2 = repository.create.mock.calls[1][0].requestFingerprint;

      expect(hash1).not.toBe(hash2);
    });

    it('[Concurrency] request thứ 2 gặp P2002 từ create() → 409, không tạo 2 operation', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.create.mockRejectedValue(
        new SalesReturnRefundOperationConflictError('key-1'),
      );

      await expect(
        service.reserve({
          organizationId: 'org-1',
          idempotencyKey: 'key-1',
          payload,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reserve — request trùng lặp (duplicate)', () => {
    it('COMPLETED + fingerprint khớp → REPLAY, không tạo mới', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.create.mockResolvedValue(makeOperation());
      await service.reserve({
        organizationId: 'org-1',
        idempotencyKey: 'key-1',
        payload,
      });
      const requestFingerprint =
        repository.create.mock.calls[0][0].requestFingerprint;

      repository.findByKey.mockResolvedValue(
        makeOperation({
          status: 'COMPLETED',
          requestFingerprint,
          refundId: 'refund-1',
        }),
      );

      const result = await service.reserve({
        organizationId: 'org-1',
        idempotencyKey: 'key-1',
        payload,
      });

      expect(result).toEqual({ kind: 'REPLAY', refundId: 'refund-1' });
      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.tryReclaim).not.toHaveBeenCalled();
    });

    it('COMPLETED + fingerprint khác → 409 key-reused', async () => {
      repository.findByKey.mockResolvedValue(
        makeOperation({
          status: 'COMPLETED',
          requestFingerprint: 'hash-cua-payload-khac',
          refundId: 'refund-1',
        }),
      );

      await expect(
        service.reserve({
          organizationId: 'org-1',
          idempotencyKey: 'key-1',
          payload,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reserve — PROCESSING còn hạn (request khác đang xử lý thật)', () => {
    it('409 conflict, không gọi tryReclaim', async () => {
      repository.findByKey.mockResolvedValue(
        makeOperation({ status: 'PROCESSING', createdAt: new Date() }),
      );

      await expect(
        service.reserve({
          organizationId: 'org-1',
          idempotencyKey: 'key-1',
          payload,
        }),
      ).rejects.toThrow(ConflictException);
      expect(repository.tryReclaim).not.toHaveBeenCalled();
    });
  });

  describe('reserve — PROCESSING bị treo (stale, ≥ 2 phút)', () => {
    it('cùng fingerprint → tryReclaim() thành công → NEW', async () => {
      const stuckCreatedAt = new Date(Date.now() - 3 * 60 * 1000);
      const requestFingerprint = hashOf(payload);
      repository.findByKey.mockResolvedValue(
        makeOperation({
          status: 'PROCESSING',
          createdAt: stuckCreatedAt,
          requestFingerprint,
        }),
      );
      repository.tryReclaim.mockResolvedValue(
        makeOperation({ id: 'op-1', status: 'PROCESSING', requestFingerprint }),
      );

      const result = await service.reserve({
        organizationId: 'org-1',
        idempotencyKey: 'key-1',
        payload,
      });

      expect(result).toEqual({ kind: 'NEW', operationId: 'op-1' });
      expect(repository.tryReclaim).toHaveBeenCalledWith(
        'op-1',
        hashOf(payload),
        2 * 60 * 1000,
      );
    });

    // DIVERGENCE từ Checkout (mirror T052.05A.1 §9, Architect Decision D5): fingerprint BẤT
    // BIẾN — CAS reclaim với fingerprint khác bị TỪ CHỐI (409 key-reused), KHÔNG ghi đè.
    it('fingerprint KHÁC → 409 key-reused, KHÔNG gọi tryReclaim (fingerprint không bị ghi đè)', async () => {
      const stuckCreatedAt = new Date(Date.now() - 3 * 60 * 1000);
      repository.findByKey.mockResolvedValue(
        makeOperation({
          status: 'PROCESSING',
          createdAt: stuckCreatedAt,
          requestFingerprint: 'fingerprint-cu-khac-voi-payload-moi',
        }),
      );

      await expect(
        service.reserve({
          organizationId: 'org-1',
          idempotencyKey: 'key-1',
          payload,
        }),
      ).rejects.toThrow(ConflictException);
      expect(repository.tryReclaim).not.toHaveBeenCalled();
    });

    it('[Concurrency] 2 request cùng fingerprint cố reclaim 1 row bị treo — request thua CAS race nhận 409', async () => {
      const stuckCreatedAt = new Date(Date.now() - 3 * 60 * 1000);
      const requestFingerprint = hashOf(payload);
      repository.findByKey.mockResolvedValue(
        makeOperation({
          status: 'PROCESSING',
          createdAt: stuckCreatedAt,
          requestFingerprint,
        }),
      );
      repository.tryReclaim
        .mockResolvedValueOnce(
          makeOperation({
            id: 'op-1',
            status: 'PROCESSING',
            requestFingerprint,
          }),
        )
        .mockResolvedValueOnce(null);

      const first = await service.reserve({
        organizationId: 'org-1',
        idempotencyKey: 'key-1',
        payload,
      });
      expect(first).toEqual({ kind: 'NEW', operationId: 'op-1' });

      await expect(
        service.reserve({
          organizationId: 'org-1',
          idempotencyKey: 'key-1',
          payload,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reserve — FAILED (retry sau lỗi nghiệp vụ)', () => {
    it('cùng fingerprint → tryReclaim() thành công → NEW', async () => {
      const requestFingerprint = hashOf(payload);
      repository.findByKey.mockResolvedValue(
        makeOperation({ status: 'FAILED', requestFingerprint }),
      );
      repository.tryReclaim.mockResolvedValue(
        makeOperation({ id: 'op-1', status: 'PROCESSING', requestFingerprint }),
      );

      const result = await service.reserve({
        organizationId: 'org-1',
        idempotencyKey: 'key-1',
        payload,
      });

      expect(result).toEqual({ kind: 'NEW', operationId: 'op-1' });
      expect(repository.tryReclaim).toHaveBeenCalledWith(
        'op-1',
        requestFingerprint,
        2 * 60 * 1000,
      );
    });

    it('fingerprint KHÁC → 409 key-reused, KHÔNG gọi tryReclaim, client phải sinh Idempotency-Key MỚI', async () => {
      repository.findByKey.mockResolvedValue(
        makeOperation({
          status: 'FAILED',
          requestFingerprint: 'fingerprint-cua-payload-that-bai-truoc-do',
        }),
      );

      await expect(
        service.reserve({
          organizationId: 'org-1',
          idempotencyKey: 'key-1',
          payload,
        }),
      ).rejects.toThrow(ConflictException);
      expect(repository.tryReclaim).not.toHaveBeenCalled();
    });
  });

  describe('markCompleted', () => {
    it('ủy quyền cho repository.markCompleted kèm tx', async () => {
      const tx = {} as never;
      await service.markCompleted('op-1', 'refund-1', tx);
      expect(repository.markCompleted).toHaveBeenCalledWith(
        'op-1',
        'refund-1',
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

/** Test-only re-implementation của thuật toán hash trong service (SHA-256 deep-sorted JSON) —
 * dùng để tính trước fingerprint mong đợi cho các test cần khớp đúng giá trị đã lưu. */
function hashOf(payload: Record<string, unknown>): string {
  const sortKeysDeep = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value !== null && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return value;
  };
  return createHash('sha256')
    .update(JSON.stringify(sortKeysDeep(payload)))
    .digest('hex');
}
