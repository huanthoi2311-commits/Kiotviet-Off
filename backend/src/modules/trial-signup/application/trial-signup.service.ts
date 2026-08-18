import { randomBytes, createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { slugify } from '../../../common/utils/slugify.util';
import {
  AuthService,
  IssuedSession,
} from '../../auth/application/auth.service';
import { PASSWORD_HASHER } from '../../auth/domain/services/password-hasher.interface';
import type { IPasswordHasher } from '../../auth/domain/services/password-hasher.interface';
import { DeviceContext } from '../../auth/domain/value-objects/device-context';
import {
  ORGANIZATION_REPOSITORY,
  OrganizationEmailConflictError,
  OrganizationSlugConflictError,
  OrganizationTaxCodeConflictError,
} from '../../organization/domain/repositories/organization.repository.interface';
import type { IOrganizationRepository } from '../../organization/domain/repositories/organization.repository.interface';
import { ORGANIZATION_CODE_GENERATOR } from '../../organization/domain/services/organization-code-generator.interface';
import type { IOrganizationCodeGenerator } from '../../organization/domain/services/organization-code-generator.interface';
import { FinalizeTrialSignupDto } from './dto/finalize-trial-signup.dto';
import {
  TrialSignupFinalizationConflictError,
  TRIAL_SIGNUP_FINALIZATION_REPOSITORY,
} from '../domain/repositories/trial-signup-finalization.repository.interface';
import type { ITrialSignupFinalizationRepository } from '../domain/repositories/trial-signup-finalization.repository.interface';
import { SignupProofService } from '../infrastructure/security/signup-proof.service';

/** T053.04 D9 — retention của bản ghi finalize (mirror CheckoutOperation's 48h, KHÔNG có cleanup
 * job trong T053.04 — chỉ trường dữ liệu, chờ scheduler chung trong tương lai). */
const FINALIZATION_RETENTION_MS = 48 * 60 * 60 * 1000;

export interface AuditContextInput {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class TrialSignupService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: IOrganizationRepository,
    @Inject(ORGANIZATION_CODE_GENERATOR)
    private readonly codeGenerator: IOrganizationCodeGenerator,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    @Inject(TRIAL_SIGNUP_FINALIZATION_REPOSITORY)
    private readonly finalizationRepository: ITrialSignupFinalizationRepository,
    private readonly signupProof: SignupProofService,
    private readonly authService: AuthService,
  ) {}

  async finalize(
    dto: FinalizeTrialSignupDto,
    auditContext: AuditContextInput,
    device: DeviceContext,
  ): Promise<IssuedSession> {
    const verified = this.signupProof.verifyProof(dto.signupProofToken);
    if (verified.outcome === 'EXPIRED') {
      throw new BadRequestException(
        withCode(
          ErrorCode.SIGNUP_PROOF_EXPIRED,
          'Signup proof đã hết hạn, vui lòng xác thực OTP lại',
        ),
      );
    }
    if (verified.outcome === 'INVALID') {
      throw new BadRequestException(
        withCode(ErrorCode.SIGNUP_PROOF_INVALID, 'Signup proof không hợp lệ'),
      );
    }
    const normalizedEmail = verified.email;

    const proofTokenHash = this.signupProof.hashProofToken(
      dto.signupProofToken,
    );
    const requestFingerprint = this.hashIntent(dto);
    const expiresAt = new Date(Date.now() + FINALIZATION_RETENTION_MS);

    const reservation = await this.reserve(
      proofTokenHash,
      normalizedEmail,
      requestFingerprint,
      expiresAt,
    );

    if (reservation.kind === 'REPLAY') {
      return this.authService.issueSessionForNewUser(
        reservation.userId,
        device,
      );
    }

    const operationId = reservation.operationId;
    let ownerUserId: string;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const code = await this.codeGenerator.generate();
        const passwordHash = await this.passwordHasher.hash(dto.owner.password);
        const slug =
          dto.organization.slug ??
          this.deriveSlug(dto.organization.displayName);

        const aggregate =
          await this.organizationRepository.createWithOwnerInTransaction(
            tx,
            {
              code,
              displayName: dto.organization.displayName,
              legalName: null,
              slug,
              taxCode: null,
              owner: {
                username: this.deriveUsername(normalizedEmail),
                fullName: dto.owner.fullName,
                email: normalizedEmail,
                passwordHash,
              },
              // D3 — server LUÔN hardcode TRIAL, DTO công khai không có trường plan nào để client
              // gửi lên (đóng ở tầng type, không chỉ runtime).
              plan: 'TRIAL',
            },
            // D10 — signup công khai không có actor xác thực, KHÔNG được bịa — null hợp lệ ở
            // tầng schema (createdBy/AuditLog.userId đều nullable).
            null,
            {
              ip: auditContext.ip,
              userAgent: auditContext.userAgent,
              action: 'organization.trial_signup',
              extraAuditMetadata: { provisionedVia: 'public_trial_signup' },
            },
          );

        await this.finalizationRepository.markCompleted(
          operationId,
          aggregate.organization.id,
          aggregate.organization.ownerUserId as string,
          tx,
        );

        return aggregate;
      });
      ownerUserId = result.organization.ownerUserId as string;
    } catch (error) {
      await this.finalizationRepository.markFailed(operationId).catch(() => {
        // best-effort — không được che lấp lỗi provisioning gốc bên dưới.
      });
      throw this.mapProvisioningError(error);
    }

    return this.authService.issueSessionForNewUser(ownerUserId, device);
  }

  /** D9 — reserve/replay state machine. Trả `NEW` (caller phải chạy transaction provisioning) hoặc
   * `REPLAY` (proof này đã hoàn tất trước đó VỚI CÙNG intent — trả kết quả cũ, không chạy lại). */
  private async reserve(
    proofTokenHash: string,
    normalizedEmail: string,
    requestFingerprint: string,
    expiresAt: Date,
  ): Promise<
    { kind: 'NEW'; operationId: string } | { kind: 'REPLAY'; userId: string }
  > {
    const existing =
      await this.finalizationRepository.findByProofTokenHash(proofTokenHash);

    if (!existing) {
      try {
        const created = await this.finalizationRepository.create({
          proofTokenHash,
          normalizedEmail,
          requestFingerprint,
          expiresAt,
        });
        return { kind: 'NEW', operationId: created.id };
      } catch (error) {
        if (error instanceof TrialSignupFinalizationConflictError) {
          throw this.activeConflict();
        }
        throw error;
      }
    }

    if (existing.status === 'COMPLETED') {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new ConflictException(
          withCode(
            ErrorCode.SIGNUP_INTENT_MISMATCH,
            'Signup proof này đã được dùng cho một yêu cầu khác với dữ liệu khác',
          ),
        );
      }
      return { kind: 'REPLAY', userId: existing.userId as string };
    }

    if (existing.status === 'PROCESSING') {
      throw this.activeConflict();
    }

    // FAILED — cho phép chiếm lại (CAS).
    const reclaimed = await this.finalizationRepository.tryReclaimFailed(
      existing.id,
      requestFingerprint,
      expiresAt,
    );
    if (!reclaimed) {
      throw this.activeConflict();
    }
    return { kind: 'NEW', operationId: reclaimed.id };
  }

  /** D9 — "bind one verified signup proof to one immutable final intent": hash TOÀN BỘ payload
   * xác định ý định (bao gồm mật khẩu — đây LÀ 1 phần bất biến của ý định tạo tài khoản, không
   * lưu mật khẩu thô, chỉ hash 1 chiều). KHÔNG dùng `dto.organization.slug` đã derive — dùng
   * ĐÚNG giá trị client gửi lên (kể cả `undefined`) để 2 lần gọi giống hệt nhau từ client luôn ra
   * cùng 1 fingerprint bất kể server derive slug ngẫu nhiên thế nào. */
  private hashIntent(dto: FinalizeTrialSignupDto): string {
    const normalized = JSON.stringify({
      displayName: dto.organization.displayName,
      slug: dto.organization.slug ?? null,
      fullName: dto.owner.fullName,
      password: dto.owner.password,
    });
    return createHash('sha256').update(normalized).digest('hex');
  }

  private deriveSlug(displayName: string): string {
    const base = slugify(displayName) || 'to-chuc';
    return `${base}-${randomBytes(3).toString('hex')}`;
  }

  private deriveUsername(email: string): string {
    return email.split('@')[0];
  }

  private activeConflict(): ConflictException {
    return new ConflictException(
      withCode(
        ErrorCode.SIGNUP_FINALIZATION_CONFLICT,
        'Yêu cầu với signup proof này đang được xử lý, vui lòng thử lại sau',
      ),
    );
  }

  private mapProvisioningError(error: unknown): Error {
    if (error instanceof OrganizationSlugConflictError) {
      return new ConflictException(
        withCode(ErrorCode.ORGANIZATION_SLUG_CONFLICT, error.message),
      );
    }
    if (error instanceof OrganizationTaxCodeConflictError) {
      return new ConflictException(
        withCode(ErrorCode.ORGANIZATION_TAXCODE_CONFLICT, error.message),
      );
    }
    if (error instanceof OrganizationEmailConflictError) {
      return new ConflictException(
        withCode(ErrorCode.ORGANIZATION_EMAIL_CONFLICT, error.message),
      );
    }
    return new InternalServerErrorException(
      withCode(
        ErrorCode.SIGNUP_PROVISIONING_FAILED,
        'Không thể khởi tạo tổ chức, vui lòng thử lại',
      ),
    );
  }
}
