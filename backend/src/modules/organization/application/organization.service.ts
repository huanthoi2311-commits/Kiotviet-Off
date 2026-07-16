import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { PASSWORD_HASHER } from '../../auth/domain/services/password-hasher.interface';
import type { IPasswordHasher } from '../../auth/domain/services/password-hasher.interface';
import {
  AuditContext,
  ORGANIZATION_REPOSITORY,
  OrganizationEmailConflictError,
  OrganizationNotActiveError,
  OrganizationOwnerNotInOrganizationError,
  OrganizationSlugConflictError,
  OrganizationTaxCodeConflictError,
} from '../domain/repositories/organization.repository.interface';
import type { IOrganizationRepository } from '../domain/repositories/organization.repository.interface';
import { ORGANIZATION_CODE_GENERATOR } from '../domain/services/organization-code-generator.interface';
import type { IOrganizationCodeGenerator } from '../domain/services/organization-code-generator.interface';
import { ArchiveOrganizationDto } from './dto/archive-organization.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import {
  OrganizationDetailResponseDto,
  OrganizationResponseDto,
  PaginatedOrganizationResponseDto,
} from './dto/organization-response.dto';
import { OrganizationQueryDto } from './dto/organization-query.dto';
import { TransferOwnerDto } from './dto/transfer-owner.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationMapper } from './mappers/organization.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  isPlatformAdmin: boolean;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: IOrganizationRepository,
    @Inject(ORGANIZATION_CODE_GENERATOR)
    private readonly codeGenerator: IOrganizationCodeGenerator,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
  ) {}

  /** Route đã có PlatformAdminGuard — chỉ Platform Admin mới tới được đây (SPEC-ORG-001 Decision 4). */
  async create(
    dto: CreateOrganizationDto,
    actor: ActorContext,
  ): Promise<OrganizationDetailResponseDto> {
    if (await this.organizationRepository.existsBySlug(dto.organization.slug)) {
      throw new ConflictException(
        withCode(
          ErrorCode.ORGANIZATION_SLUG_CONFLICT,
          `Slug "${dto.organization.slug}" đã được sử dụng`,
        ),
      );
    }
    if (
      dto.organization.taxCode &&
      (await this.organizationRepository.existsByTaxCode(
        dto.organization.taxCode,
      ))
    ) {
      throw new ConflictException(
        withCode(
          ErrorCode.ORGANIZATION_TAXCODE_CONFLICT,
          `Mã số thuế "${dto.organization.taxCode}" đã được sử dụng`,
        ),
      );
    }

    const code = await this.codeGenerator.generate();
    const passwordHash = await this.passwordHasher.hash(dto.owner.password);
    const auditContext: AuditContext = {
      ip: actor.ip,
      userAgent: actor.userAgent,
    };

    try {
      const aggregate = await this.organizationRepository.createWithOwner(
        {
          code,
          displayName: dto.organization.displayName,
          legalName: dto.organization.legalName ?? null,
          slug: dto.organization.slug,
          taxCode: dto.organization.taxCode ?? null,
          owner: {
            username: this.deriveUsername(dto.owner.email),
            fullName: dto.owner.fullName,
            email: dto.owner.email,
            passwordHash,
          },
        },
        actor.userId,
        auditContext,
      );
      return OrganizationMapper.toDetailResponseDto(aggregate);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  async getById(
    id: string,
    actor: ActorContext,
  ): Promise<OrganizationDetailResponseDto> {
    this.assertOrganizationContext(id, actor);
    const aggregate = await this.organizationRepository.findById(id);
    if (!aggregate) {
      throw new NotFoundException(
        withCode(ErrorCode.ORGANIZATION_NOT_FOUND, 'Không tìm thấy tổ chức'),
      );
    }
    return OrganizationMapper.toDetailResponseDto(aggregate);
  }

  async getCurrent(
    actor: ActorContext,
  ): Promise<OrganizationDetailResponseDto> {
    return this.getById(actor.organizationId, actor);
  }

  /** Route đã có PlatformAdminGuard — danh sách toàn bộ tổ chức chỉ Platform Admin mới xem được. */
  async search(
    query: OrganizationQueryDto,
  ): Promise<PaginatedOrganizationResponseDto> {
    const result = await this.organizationRepository.search({
      search: query.search,
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return {
      items: result.items.map((item) => OrganizationMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
    actor: ActorContext,
  ): Promise<OrganizationResponseDto> {
    this.assertOrganizationContext(id, actor);
    try {
      const updated = await this.organizationRepository.update(id, {
        ...dto,
        updatedBy: actor.userId,
      });
      return OrganizationMapper.toResponseDto(updated);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  async archive(
    id: string,
    dto: ArchiveOrganizationDto,
    actor: ActorContext,
  ): Promise<OrganizationResponseDto> {
    this.assertOrganizationContext(id, actor);
    const current = await this.organizationRepository.findById(id);
    if (!current) {
      throw new NotFoundException(
        withCode(ErrorCode.ORGANIZATION_NOT_FOUND, 'Không tìm thấy tổ chức'),
      );
    }
    if (current.organization.slug !== dto.confirmSlug) {
      throw new ConflictException(
        withCode(
          ErrorCode.ORGANIZATION_ARCHIVE_CONFIRMATION_MISMATCH,
          'Slug xác nhận không khớp — vui lòng nhập đúng slug hiện tại của tổ chức',
        ),
      );
    }
    try {
      const archived = await this.organizationRepository.archive(
        id,
        actor.userId,
      );
      return OrganizationMapper.toResponseDto(archived);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  async transferOwner(
    id: string,
    dto: TransferOwnerDto,
    actor: ActorContext,
  ): Promise<OrganizationResponseDto> {
    this.assertOrganizationContext(id, actor);
    try {
      const updated = await this.organizationRepository.transferOwner(
        id,
        dto.newOwnerUserId,
        actor.userId,
      );
      return OrganizationMapper.toResponseDto(updated);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  /** "owner@acme.com" -> "owner" — SPEC không có field username trong payload Owner. */
  private deriveUsername(email: string): string {
    return email.split('@')[0];
  }

  /** "Mọi API đều kiểm tra Organization Context từ JWT" (SPEC-ORG-001 §15). */
  private assertOrganizationContext(id: string, actor: ActorContext): void {
    if (!actor.isPlatformAdmin && actor.organizationId !== id) {
      throw new ForbiddenException(
        withCode(
          ErrorCode.ORGANIZATION_CONTEXT_FORBIDDEN,
          'Không có quyền truy cập tổ chức này',
        ),
      );
    }
  }

  private mapDomainError(error: unknown): Error {
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
    if (error instanceof OrganizationNotActiveError) {
      return new ConflictException(
        withCode(ErrorCode.ORGANIZATION_NOT_ACTIVE, error.message),
      );
    }
    if (error instanceof OrganizationOwnerNotInOrganizationError) {
      return new ConflictException(
        withCode(
          ErrorCode.ORGANIZATION_OWNER_NOT_IN_ORGANIZATION,
          error.message,
        ),
      );
    }
    return error as Error;
  }
}
