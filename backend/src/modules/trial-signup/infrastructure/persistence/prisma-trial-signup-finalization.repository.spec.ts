import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TrialSignupFinalizationConflictError } from '../../domain/repositories/trial-signup-finalization.repository.interface';
import { PrismaTrialSignupFinalizationRepository } from './prisma-trial-signup-finalization.repository';

describe('PrismaTrialSignupFinalizationRepository (T053.04 D9)', () => {
  let repository: PrismaTrialSignupFinalizationRepository;
  let prisma: {
    trialSignupFinalization: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
  };

  const raw = {
    id: 'fin-1',
    proofTokenHash: 'hash-1',
    normalizedEmail: 'owner@acme.com',
    requestFingerprint: 'fp-1',
    status: 'PROCESSING' as const,
    organizationId: null,
    userId: null,
    createdAt: new Date('2026-01-01'),
    completedAt: null,
    expiresAt: new Date('2026-01-03'),
  };

  beforeEach(() => {
    prisma = {
      trialSignupFinalization: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
    };
    repository = new PrismaTrialSignupFinalizationRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('create', () => {
    it('P2002 (proofTokenHash trùng — race) → TrialSignupFinalizationConflictError', async () => {
      prisma.trialSignupFinalization.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['proofTokenHash'] },
        }),
      );

      await expect(
        repository.create({
          proofTokenHash: 'hash-1',
          normalizedEmail: 'owner@acme.com',
          requestFingerprint: 'fp-1',
          expiresAt: new Date(),
        }),
      ).rejects.toThrow(TrialSignupFinalizationConflictError);
    });

    it('thành công → status luôn PROCESSING khi tạo mới', async () => {
      prisma.trialSignupFinalization.create.mockResolvedValue(raw);
      await repository.create({
        proofTokenHash: 'hash-1',
        normalizedEmail: 'owner@acme.com',
        requestFingerprint: 'fp-1',
        expiresAt: new Date(),
      });
      expect(prisma.trialSignupFinalization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PROCESSING' }),
        }),
      );
    });
  });

  describe('tryReclaimFailed (CAS)', () => {
    it('WHERE status=FAILED — thua race (count=0) → null, KHÔNG gọi findUniqueOrThrow', async () => {
      prisma.trialSignupFinalization.updateMany.mockResolvedValue({
        count: 0,
      });
      const result = await repository.tryReclaimFailed(
        'fin-1',
        'fp-2',
        new Date(),
      );
      expect(result).toBeNull();
      expect(
        prisma.trialSignupFinalization.findUniqueOrThrow,
      ).not.toHaveBeenCalled();
    });

    it('thắng race (count=1) → đọc lại bản ghi đã reclaim, status/requestFingerprint mới', async () => {
      prisma.trialSignupFinalization.updateMany.mockResolvedValue({
        count: 1,
      });
      prisma.trialSignupFinalization.findUniqueOrThrow.mockResolvedValue({
        ...raw,
        requestFingerprint: 'fp-2',
      });

      const result = await repository.tryReclaimFailed(
        'fin-1',
        'fp-2',
        new Date(),
      );

      expect(prisma.trialSignupFinalization.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fin-1', status: 'FAILED' },
        }),
      );
      expect(result?.requestFingerprint).toBe('fp-2');
    });
  });

  describe('markCompleted', () => {
    it('dùng ĐÚNG tx được truyền vào (cùng Business Transaction với provisioning, D9)', async () => {
      const tx = {
        trialSignupFinalization: { update: jest.fn().mockResolvedValue({}) },
      };
      await repository.markCompleted(
        'fin-1',
        'org-1',
        'user-1',
        tx as unknown as Prisma.TransactionClient,
      );
      expect(tx.trialSignupFinalization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fin-1' },
          data: expect.objectContaining({
            status: 'COMPLETED',
            organizationId: 'org-1',
            userId: 'user-1',
          }),
        }),
      );
      // Không dùng this.prisma (out-of-tx client) cho bước cuối này.
      expect(prisma.trialSignupFinalization.update).not.toHaveBeenCalled();
    });
  });

  describe('markFailed', () => {
    it('gọi NGOÀI transaction (this.prisma, không cần tx) — cho phép retry ngay', async () => {
      prisma.trialSignupFinalization.update.mockResolvedValue({});
      await repository.markFailed('fin-1');
      expect(prisma.trialSignupFinalization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fin-1' },
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });
});
