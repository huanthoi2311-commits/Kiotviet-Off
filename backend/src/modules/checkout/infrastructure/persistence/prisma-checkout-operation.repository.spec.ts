import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CheckoutOperationConflictError } from '../../domain/errors/checkout-operation.errors';
import { PrismaCheckoutOperationRepository } from './prisma-checkout-operation.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

const rawOperation = {
  id: 'op-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  idempotencyKey: 'key-1',
  requestHash: 'hash-1',
  status: 'PROCESSING' as const,
  invoiceId: null,
  paymentId: null,
  createdBy: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  completedAt: null,
  expiresAt: new Date('2026-01-03T00:00:00.000Z'),
};

describe('PrismaCheckoutOperationRepository', () => {
  let repository: PrismaCheckoutOperationRepository;
  let prisma: {
    checkoutOperation: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      checkoutOperation: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    repository = new PrismaCheckoutOperationRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('findByKey', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.checkoutOperation.findUnique.mockResolvedValue(null);
      await expect(
        repository.findByKey('org-1', 'missing-key'),
      ).resolves.toBeNull();
    });

    it('map đúng entity khi tìm thấy, scoped theo organizationId+idempotencyKey', async () => {
      prisma.checkoutOperation.findUnique.mockResolvedValue(rawOperation);
      const result = await repository.findByKey('org-1', 'key-1');
      expect(result?.id).toBe('op-1');
      expect(prisma.checkoutOperation.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_idempotencyKey: {
            organizationId: 'org-1',
            idempotencyKey: 'key-1',
          },
        },
      });
    });
  });

  describe('create', () => {
    it('tạo mới với status PROCESSING và expiresAt = now + 48h', async () => {
      prisma.checkoutOperation.create.mockResolvedValue(rawOperation);
      const before = Date.now();
      const result = await repository.create({
        organizationId: 'org-1',
        branchId: 'branch-1',
        idempotencyKey: 'key-1',
        requestHash: 'hash-1',
        createdBy: 'user-1',
      });
      expect(result.status).toBe('PROCESSING');
      const callArgs = prisma.checkoutOperation.create.mock.calls[0][0];
      expect(callArgs.data.status).toBe('PROCESSING');
      const expiresAt = (callArgs.data.expiresAt as Date).getTime();
      expect(expiresAt - before).toBeGreaterThanOrEqual(
        48 * 60 * 60 * 1000 - 1000,
      );
      expect(expiresAt - before).toBeLessThanOrEqual(
        48 * 60 * 60 * 1000 + 1000,
      );
    });

    it('[Concurrency] dịch lỗi P2002 (2 request đồng thời cùng key) sang CheckoutOperationConflictError', async () => {
      prisma.checkoutOperation.create.mockRejectedValue(
        knownError('P2002', {
          target: ['organizationId', 'idempotencyKey'],
        }),
      );
      await expect(
        repository.create({
          organizationId: 'org-1',
          branchId: 'branch-1',
          idempotencyKey: 'key-1',
          requestHash: 'hash-1',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow(CheckoutOperationConflictError);
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.checkoutOperation.create.mockRejectedValue(new Error('boom'));
      await expect(
        repository.create({
          organizationId: 'org-1',
          branchId: 'branch-1',
          idempotencyKey: 'key-1',
          requestHash: 'hash-1',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('boom');
    });
  });

  describe('tryReclaim', () => {
    it('chiếm lại thành công khi row FAILED hoặc PROCESSING đã treo', async () => {
      prisma.checkoutOperation.updateMany.mockResolvedValue({ count: 1 });
      prisma.checkoutOperation.findUniqueOrThrow.mockResolvedValue({
        ...rawOperation,
        requestHash: 'hash-2',
      });
      const result = await repository.tryReclaim(
        'op-1',
        'hash-2',
        120_000,
        new Date('2026-01-05T00:00:00.000Z'),
      );
      expect(result?.requestHash).toBe('hash-2');
      expect(prisma.checkoutOperation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'op-1',
            OR: [
              { status: 'FAILED' },
              { status: 'PROCESSING', createdAt: { lt: expect.any(Date) } },
            ],
          }),
          data: expect.objectContaining({
            status: 'PROCESSING',
            requestHash: 'hash-2',
            completedAt: null,
            invoiceId: null,
            paymentId: null,
          }),
        }),
      );
    });

    it('trả về null khi không còn row nào thỏa điều kiện (thua race hoặc đang PROCESSING hợp lệ)', async () => {
      prisma.checkoutOperation.updateMany.mockResolvedValue({ count: 0 });
      const result = await repository.tryReclaim(
        'op-1',
        'hash-2',
        120_000,
        new Date('2026-01-05T00:00:00.000Z'),
      );
      expect(result).toBeNull();
      expect(prisma.checkoutOperation.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  describe('markCompleted', () => {
    it('cập nhật status=COMPLETED, gán invoiceId/paymentId, set completedAt trong tx truyền vào', async () => {
      const txUpdate = jest.fn().mockResolvedValue(rawOperation);
      const tx = { checkoutOperation: { update: txUpdate } };
      await repository.markCompleted(
        'op-1',
        'invoice-1',
        'payment-1',
        tx as never,
      );
      expect(txUpdate).toHaveBeenCalledWith({
        where: { id: 'op-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          invoiceId: 'invoice-1',
          paymentId: 'payment-1',
          completedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('markFailed', () => {
    it('cập nhật status=FAILED, set completedAt', async () => {
      prisma.checkoutOperation.update.mockResolvedValue(rawOperation);
      await repository.markFailed('op-1');
      expect(prisma.checkoutOperation.update).toHaveBeenCalledWith({
        where: { id: 'op-1' },
        data: { status: 'FAILED', completedAt: expect.any(Date) },
      });
    });
  });

  describe('findStuckProcessing', () => {
    it('tìm row PROCESSING cũ hơn ngưỡng truyền vào', async () => {
      prisma.checkoutOperation.findMany.mockResolvedValue([rawOperation]);
      const result = await repository.findStuckProcessing(120_000);
      expect(result).toHaveLength(1);
      expect(prisma.checkoutOperation.findMany).toHaveBeenCalledWith({
        where: { status: 'PROCESSING', createdAt: { lt: expect.any(Date) } },
      });
    });
  });

  describe('deleteExpired', () => {
    it('xóa row COMPLETED/FAILED đã hết hạn, trả về số dòng đã xóa', async () => {
      prisma.checkoutOperation.deleteMany.mockResolvedValue({ count: 3 });
      await expect(repository.deleteExpired()).resolves.toBe(3);
      expect(prisma.checkoutOperation.deleteMany).toHaveBeenCalledWith({
        where: {
          status: { in: ['COMPLETED', 'FAILED'] },
          expiresAt: { lt: expect.any(Date) },
        },
      });
    });
  });
});
