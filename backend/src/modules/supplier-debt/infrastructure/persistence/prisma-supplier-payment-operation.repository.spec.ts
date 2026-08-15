import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SupplierPaymentOperationConflictError } from '../../domain/errors/supplier-payment-operation.errors';
import { PrismaSupplierPaymentOperationRepository } from './prisma-supplier-payment-operation.repository';

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
  idempotencyKey: 'key-1',
  requestFingerprint: 'fingerprint-1',
  status: 'PROCESSING' as const,
  paymentId: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  completedAt: null,
};

describe('PrismaSupplierPaymentOperationRepository', () => {
  let repository: PrismaSupplierPaymentOperationRepository;
  let prisma: {
    supplierPaymentOperation: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      supplierPaymentOperation: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    repository = new PrismaSupplierPaymentOperationRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('findByKey', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.supplierPaymentOperation.findUnique.mockResolvedValue(null);
      await expect(
        repository.findByKey('org-1', 'missing-key'),
      ).resolves.toBeNull();
    });

    it('map đúng entity khi tìm thấy, scoped theo organizationId+idempotencyKey', async () => {
      prisma.supplierPaymentOperation.findUnique.mockResolvedValue(
        rawOperation,
      );
      const result = await repository.findByKey('org-1', 'key-1');
      expect(result?.id).toBe('op-1');
      expect(prisma.supplierPaymentOperation.findUnique).toHaveBeenCalledWith({
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
    it('tạo mới với status PROCESSING', async () => {
      prisma.supplierPaymentOperation.create.mockResolvedValue(rawOperation);
      const result = await repository.create({
        organizationId: 'org-1',
        idempotencyKey: 'key-1',
        requestFingerprint: 'fingerprint-1',
      });
      expect(result.status).toBe('PROCESSING');
      expect(prisma.supplierPaymentOperation.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          idempotencyKey: 'key-1',
          requestFingerprint: 'fingerprint-1',
          status: 'PROCESSING',
        },
      });
    });

    it('[Concurrency] dịch lỗi P2002 (2 request đồng thời cùng key) sang SupplierPaymentOperationConflictError', async () => {
      prisma.supplierPaymentOperation.create.mockRejectedValue(
        knownError('P2002', { target: ['organizationId', 'idempotencyKey'] }),
      );
      await expect(
        repository.create({
          organizationId: 'org-1',
          idempotencyKey: 'key-1',
          requestFingerprint: 'fingerprint-1',
        }),
      ).rejects.toThrow(SupplierPaymentOperationConflictError);
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.supplierPaymentOperation.create.mockRejectedValue(
        new Error('boom'),
      );
      await expect(
        repository.create({
          organizationId: 'org-1',
          idempotencyKey: 'key-1',
          requestFingerprint: 'fingerprint-1',
        }),
      ).rejects.toThrow('boom');
    });
  });

  describe('tryReclaim', () => {
    // T052.05A.1 §9 (Architect Decision D5) — requestFingerprint KHÔNG bao giờ được ghi trong
    // `data` (bất biến), chỉ dùng làm điều kiện WHERE (khớp giá trị đã lưu) — khác hẳn
    // PrismaCheckoutOperationRepository.tryReclaim(), vốn ghi đè requestHash trong `data`.
    it('chiếm lại thành công khi row FAILED hoặc PROCESSING đã treo VÀ fingerprint khớp — KHÔNG ghi requestFingerprint trong data', async () => {
      prisma.supplierPaymentOperation.updateMany.mockResolvedValue({
        count: 1,
      });
      prisma.supplierPaymentOperation.findUniqueOrThrow.mockResolvedValue(
        rawOperation,
      );
      const result = await repository.tryReclaim(
        'op-1',
        'fingerprint-1',
        120_000,
      );
      expect(result?.id).toBe('op-1');
      expect(prisma.supplierPaymentOperation.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'op-1',
          requestFingerprint: 'fingerprint-1',
          OR: [
            { status: 'FAILED' },
            { status: 'PROCESSING', createdAt: { lt: expect.any(Date) } },
          ],
        },
        data: {
          status: 'PROCESSING',
          createdAt: expect.any(Date),
          completedAt: null,
          paymentId: null,
        },
      });
      const dataArg =
        prisma.supplierPaymentOperation.updateMany.mock.calls[0][0].data;
      expect(dataArg).not.toHaveProperty('requestFingerprint');
    });

    it('trả về null khi fingerprint không khớp (0 row thỏa WHERE)', async () => {
      prisma.supplierPaymentOperation.updateMany.mockResolvedValue({
        count: 0,
      });
      const result = await repository.tryReclaim(
        'op-1',
        'fingerprint-khac',
        120_000,
      );
      expect(result).toBeNull();
      expect(
        prisma.supplierPaymentOperation.findUniqueOrThrow,
      ).not.toHaveBeenCalled();
    });

    it('trả về null khi thua CAS race (0 row thỏa WHERE dù fingerprint khớp)', async () => {
      prisma.supplierPaymentOperation.updateMany.mockResolvedValue({
        count: 0,
      });
      const result = await repository.tryReclaim(
        'op-1',
        'fingerprint-1',
        120_000,
      );
      expect(result).toBeNull();
    });
  });

  describe('markCompleted', () => {
    it('cập nhật status=COMPLETED, gán paymentId, set completedAt trong tx truyền vào', async () => {
      const txUpdate = jest.fn().mockResolvedValue(rawOperation);
      const tx = { supplierPaymentOperation: { update: txUpdate } };
      await repository.markCompleted('op-1', 'payment-1', tx as never);
      expect(txUpdate).toHaveBeenCalledWith({
        where: { id: 'op-1' },
        data: {
          status: 'COMPLETED',
          paymentId: 'payment-1',
          completedAt: expect.any(Date),
        },
      });
    });
  });

  describe('markFailed', () => {
    it('cập nhật status=FAILED, set completedAt', async () => {
      prisma.supplierPaymentOperation.update.mockResolvedValue(rawOperation);
      await repository.markFailed('op-1');
      expect(prisma.supplierPaymentOperation.update).toHaveBeenCalledWith({
        where: { id: 'op-1' },
        data: { status: 'FAILED', completedAt: expect.any(Date) },
      });
    });
  });
});
