import { createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { TrialSignupService } from './trial-signup.service';
import { FinalizeTrialSignupDto } from './dto/finalize-trial-signup.dto';
import type { ITrialSignupFinalizationRepository } from '../domain/repositories/trial-signup-finalization.repository.interface';
import { TrialSignupFinalizationConflictError } from '../domain/repositories/trial-signup-finalization.repository.interface';
import { SignupProofService } from '../infrastructure/security/signup-proof.service';
import { AuthService } from '../../auth/application/auth.service';
import type { IOrganizationRepository } from '../../organization/domain/repositories/organization.repository.interface';
import { OrganizationSlugConflictError } from '../../organization/domain/repositories/organization.repository.interface';
import type { IOrganizationCodeGenerator } from '../../organization/domain/services/organization-code-generator.interface';
import type { IPasswordHasher } from '../../auth/domain/services/password-hasher.interface';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { DeviceContext } from '../../auth/domain/value-objects/device-context';

describe('TrialSignupService (T053.04)', () => {
  let prisma: { $transaction: jest.Mock };
  let organizationRepository: jest.Mocked<
    Pick<IOrganizationRepository, 'createWithOwnerInTransaction'>
  >;
  let codeGenerator: jest.Mocked<IOrganizationCodeGenerator>;
  let passwordHasher: jest.Mocked<IPasswordHasher>;
  let finalizationRepository: jest.Mocked<ITrialSignupFinalizationRepository>;
  let signupProof: jest.Mocked<
    Pick<SignupProofService, 'verifyProof' | 'hashProofToken'>
  >;
  let authService: jest.Mocked<Pick<AuthService, 'issueSessionForNewUser'>>;
  let service: TrialSignupService;

  const device: DeviceContext = {
    userAgent: 'jest',
    ip: '127.0.0.1',
    clientType: 'WEB',
    deviceName: null,
  };

  const dto: FinalizeTrialSignupDto = {
    signupProofToken: 'raw-proof-token',
    organization: { displayName: 'Acme Co', slug: 'acme-co' },
    owner: { fullName: 'Owner Name', password: 'SuperSecret123' },
  };

  const orgAggregate = {
    organization: {
      id: 'org-1',
      ownerUserId: 'user-1',
      code: 'ORG000001',
      slug: 'acme-co',
    },
  };

  const issuedSession = {
    response: {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      userInfo: {
        id: 'user-1',
        email: 'owner@acme.com',
        username: 'owner',
        organizationId: 'org-1',
        branchId: null,
        permissions: [],
      },
    },
    refreshTokenExpiresAt: new Date('2026-12-31'),
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({})),
    };
    organizationRepository = {
      createWithOwnerInTransaction: jest.fn().mockResolvedValue(orgAggregate),
    };
    codeGenerator = { generate: jest.fn().mockResolvedValue('ORG000001') };
    passwordHasher = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      verify: jest.fn(),
    };
    finalizationRepository = {
      findByProofTokenHash: jest.fn(),
      create: jest.fn(),
      tryReclaimFailed: jest.fn(),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    signupProof = {
      verifyProof: jest
        .fn()
        .mockReturnValue({ outcome: 'OK', email: 'owner@acme.com' }),
      hashProofToken: jest.fn().mockReturnValue('proof-token-hash'),
    };
    authService = {
      issueSessionForNewUser: jest.fn().mockResolvedValue(issuedSession),
    };

    service = new TrialSignupService(
      prisma as unknown as PrismaService,
      organizationRepository as unknown as IOrganizationRepository,
      codeGenerator,
      passwordHasher,
      finalizationRepository,
      signupProof as unknown as SignupProofService,
      authService as unknown as AuthService,
    );
  });

  describe('proof verification', () => {
    it('proof EXPIRED → BadRequestException SIGNUP_PROOF_EXPIRED, KHÔNG chạm tới finalizationRepository', async () => {
      signupProof.verifyProof.mockReturnValue({ outcome: 'EXPIRED' });
      await expect(service.finalize(dto, {}, device)).rejects.toThrow(
        BadRequestException,
      );
      expect(
        finalizationRepository.findByProofTokenHash,
      ).not.toHaveBeenCalled();
    });

    it('proof INVALID (chữ ký sai/giả mạo) → BadRequestException SIGNUP_PROOF_INVALID', async () => {
      signupProof.verifyProof.mockReturnValue({ outcome: 'INVALID' });
      await expect(service.finalize(dto, {}, device)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('NEW — happy path', () => {
    beforeEach(() => {
      finalizationRepository.findByProofTokenHash.mockResolvedValue(null);
      finalizationRepository.create.mockResolvedValue({
        id: 'fin-1',
        proofTokenHash: 'proof-token-hash',
        normalizedEmail: 'owner@acme.com',
        requestFingerprint: 'fp-1',
        status: 'PROCESSING',
        organizationId: null,
        userId: null,
        createdAt: new Date(),
        completedAt: null,
        expiresAt: new Date(),
      });
    });

    it('CASE 24 — plan LUÔN hardcode TRIAL, DTO không có trường plan nào để client can thiệp', async () => {
      await service.finalize(dto, {}, device);

      expect(
        organizationRepository.createWithOwnerInTransaction,
      ).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ plan: 'TRIAL' }),
        null,
        expect.anything(),
      );
    });

    it('CASE 25 — actorUserId LUÔN null (D10, không bịa actor cho luồng công khai)', async () => {
      await service.finalize(dto, {}, device);
      expect(
        organizationRepository.createWithOwnerInTransaction,
      ).toHaveBeenCalledWith({}, expect.anything(), null, expect.anything());
    });

    it('owner.email LUÔN lấy từ proof đã xác thực, KHÔNG bao giờ từ input DTO trực tiếp (DTO vốn không có trường email)', async () => {
      await service.finalize(dto, {}, device);
      expect(
        organizationRepository.createWithOwnerInTransaction,
      ).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          owner: expect.objectContaining({ email: 'owner@acme.com' }),
        }),
        null,
        expect.anything(),
      );
    });

    it('action audit = "organization.trial_signup", có extraAuditMetadata.provisionedVia', async () => {
      await service.finalize(dto, {}, device);
      expect(
        organizationRepository.createWithOwnerInTransaction,
      ).toHaveBeenCalledWith(
        {},
        expect.anything(),
        null,
        expect.objectContaining({
          action: 'organization.trial_signup',
          extraAuditMetadata: { provisionedVia: 'public_trial_signup' },
        }),
      );
    });

    it('slug client cung cấp được dùng nguyên văn (không tự derive)', async () => {
      await service.finalize(dto, {}, device);
      expect(
        organizationRepository.createWithOwnerInTransaction,
      ).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ slug: 'acme-co' }),
        null,
        expect.anything(),
      );
    });

    it('slug BỎ TRỐNG → tự derive từ displayName (slugify + hậu tố ngẫu nhiên, D6)', async () => {
      const dtoNoSlug: FinalizeTrialSignupDto = {
        ...dto,
        organization: { displayName: 'Công Ty Ví Dụ', slug: undefined },
      };
      await service.finalize(dtoNoSlug, {}, device);

      const call =
        organizationRepository.createWithOwnerInTransaction.mock.calls[0];
      const input = call[1] as { slug: string };
      expect(input.slug).toMatch(/^cong-ty-vi-du-[a-f0-9]{6}$/);
    });

    it('markCompleted() được gọi TRONG cùng tx (D9), rồi issueSessionForNewUser() cho owner mới', async () => {
      const result = await service.finalize(dto, {}, device);

      expect(finalizationRepository.markCompleted).toHaveBeenCalledWith(
        'fin-1',
        'org-1',
        'user-1',
        {},
      );
      expect(authService.issueSessionForNewUser).toHaveBeenCalledWith(
        'user-1',
        device,
      );
      expect(result).toBe(issuedSession);
    });

    it('finalizationRepository.create() thua race (TrialSignupFinalizationConflictError) → ConflictException SIGNUP_FINALIZATION_CONFLICT', async () => {
      finalizationRepository.create.mockRejectedValue(
        new TrialSignupFinalizationConflictError('proof-token-hash'),
      );
      await expect(service.finalize(dto, {}, device)).rejects.toThrow(
        ConflictException,
      );
      expect(
        organizationRepository.createWithOwnerInTransaction,
      ).not.toHaveBeenCalled();
    });
  });

  describe('REPLAY (D9)', () => {
    it('COMPLETED + CÙNG fingerprint (intent giống hệt) → trả session MỚI cho user cũ, KHÔNG chạy lại provisioning', async () => {
      const dtoRepeat = { ...dto };
      // Tính lại fingerprint bằng cách gọi finalize() một lần trước để suy ra shape — thay vào đó,
      // xác nhận qua hành vi: khi record COMPLETED tồn tại và ta gửi LẠI dto giống hệt, provisioning
      // không được gọi lần thứ 2.
      finalizationRepository.findByProofTokenHash.mockResolvedValue({
        id: 'fin-1',
        proofTokenHash: 'proof-token-hash',
        normalizedEmail: 'owner@acme.com',
        requestFingerprint: computeExpectedFingerprint(dtoRepeat),
        status: 'COMPLETED',
        organizationId: 'org-1',
        userId: 'user-1',
        createdAt: new Date(),
        completedAt: new Date(),
        expiresAt: new Date(),
      });

      const result = await service.finalize(dtoRepeat, {}, device);

      expect(
        organizationRepository.createWithOwnerInTransaction,
      ).not.toHaveBeenCalled();
      expect(authService.issueSessionForNewUser).toHaveBeenCalledWith(
        'user-1',
        device,
      );
      expect(result).toBe(issuedSession);
    });

    it('CASE 21 — COMPLETED + fingerprint KHÁC (intent đã đổi) → ConflictException SIGNUP_INTENT_MISMATCH, KHÔNG replay', async () => {
      finalizationRepository.findByProofTokenHash.mockResolvedValue({
        id: 'fin-1',
        proofTokenHash: 'proof-token-hash',
        normalizedEmail: 'owner@acme.com',
        requestFingerprint: 'a-completely-different-fingerprint',
        status: 'COMPLETED',
        organizationId: 'org-1',
        userId: 'user-1',
        createdAt: new Date(),
        completedAt: new Date(),
        expiresAt: new Date(),
      });

      await expect(service.finalize(dto, {}, device)).rejects.toThrow(
        ConflictException,
      );
      expect(authService.issueSessionForNewUser).not.toHaveBeenCalled();
    });

    it('PROCESSING (request khác đang xử lý đồng thời) → ConflictException SIGNUP_FINALIZATION_CONFLICT', async () => {
      finalizationRepository.findByProofTokenHash.mockResolvedValue({
        id: 'fin-1',
        proofTokenHash: 'proof-token-hash',
        normalizedEmail: 'owner@acme.com',
        requestFingerprint: 'whatever',
        status: 'PROCESSING',
        organizationId: null,
        userId: null,
        createdAt: new Date(),
        completedAt: null,
        expiresAt: new Date(),
      });

      await expect(service.finalize(dto, {}, device)).rejects.toThrow(
        ConflictException,
      );
      expect(
        organizationRepository.createWithOwnerInTransaction,
      ).not.toHaveBeenCalled();
    });

    it('FAILED → reclaim thành công → chạy lại provisioning bình thường (retry-after-failure)', async () => {
      finalizationRepository.findByProofTokenHash.mockResolvedValue({
        id: 'fin-1',
        proofTokenHash: 'proof-token-hash',
        normalizedEmail: 'owner@acme.com',
        requestFingerprint: computeExpectedFingerprint(dto),
        status: 'FAILED',
        organizationId: null,
        userId: null,
        createdAt: new Date(),
        completedAt: new Date(),
        expiresAt: new Date(),
      });
      finalizationRepository.tryReclaimFailed.mockResolvedValue({
        id: 'fin-1',
        proofTokenHash: 'proof-token-hash',
        normalizedEmail: 'owner@acme.com',
        requestFingerprint: computeExpectedFingerprint(dto),
        status: 'PROCESSING',
        organizationId: null,
        userId: null,
        createdAt: new Date(),
        completedAt: null,
        expiresAt: new Date(),
      });

      await service.finalize(dto, {}, device);

      expect(
        organizationRepository.createWithOwnerInTransaction,
      ).toHaveBeenCalled();
    });

    it('FAILED → reclaim thua race (1 request khác vừa chiếm trước) → ConflictException', async () => {
      finalizationRepository.findByProofTokenHash.mockResolvedValue({
        id: 'fin-1',
        proofTokenHash: 'proof-token-hash',
        normalizedEmail: 'owner@acme.com',
        requestFingerprint: computeExpectedFingerprint(dto),
        status: 'FAILED',
        organizationId: null,
        userId: null,
        createdAt: new Date(),
        completedAt: new Date(),
        expiresAt: new Date(),
      });
      finalizationRepository.tryReclaimFailed.mockResolvedValue(null);

      await expect(service.finalize(dto, {}, device)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('provisioning failure (D9 §rollback)', () => {
    it('CASE 22/23 — createWithOwnerInTransaction() ném lỗi bất kỳ → markFailed() được gọi, lỗi map thành SIGNUP_PROVISIONING_FAILED (500), KHÔNG issue session', async () => {
      finalizationRepository.findByProofTokenHash.mockResolvedValue(null);
      finalizationRepository.create.mockResolvedValue({
        id: 'fin-1',
        proofTokenHash: 'proof-token-hash',
        normalizedEmail: 'owner@acme.com',
        requestFingerprint: 'fp-1',
        status: 'PROCESSING',
        organizationId: null,
        userId: null,
        createdAt: new Date(),
        completedAt: null,
        expiresAt: new Date(),
      });
      organizationRepository.createWithOwnerInTransaction.mockRejectedValue(
        new Error('unexpected DB failure'),
      );

      await expect(service.finalize(dto, {}, device)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(finalizationRepository.markFailed).toHaveBeenCalledWith('fin-1');
      expect(authService.issueSessionForNewUser).not.toHaveBeenCalled();
    });

    it('slug conflict (P2002 đã map ở repository) → ConflictException ORGANIZATION_SLUG_CONFLICT, vẫn markFailed()', async () => {
      finalizationRepository.findByProofTokenHash.mockResolvedValue(null);
      finalizationRepository.create.mockResolvedValue({
        id: 'fin-1',
        proofTokenHash: 'proof-token-hash',
        normalizedEmail: 'owner@acme.com',
        requestFingerprint: 'fp-1',
        status: 'PROCESSING',
        organizationId: null,
        userId: null,
        createdAt: new Date(),
        completedAt: null,
        expiresAt: new Date(),
      });
      organizationRepository.createWithOwnerInTransaction.mockRejectedValue(
        new OrganizationSlugConflictError('acme-co'),
      );

      await expect(service.finalize(dto, {}, device)).rejects.toThrow(
        ConflictException,
      );
      expect(finalizationRepository.markFailed).toHaveBeenCalledWith('fin-1');
    });
  });
});

/** Suy ra fingerprint mong đợi qua sha256(JSON.stringify(...)) — dùng CÙNG shape với
 * TrialSignupService.hashIntent() (đã cố ý giữ hàm private, test qua hành vi thay vì export). */
function computeExpectedFingerprint(dto: FinalizeTrialSignupDto): string {
  const normalized = JSON.stringify({
    displayName: dto.organization.displayName,
    slug: dto.organization.slug ?? null,
    fullName: dto.owner.fullName,
    password: dto.owner.password,
  });
  return createHash('sha256').update(normalized).digest('hex');
}
