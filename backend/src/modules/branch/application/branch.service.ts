import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import {
  BRANCH_REPOSITORY,
  BranchHasActiveWarehouseError,
  BranchInvoicePrefixConflictError,
  BranchNotActiveError,
  BranchOrganizationMinOneActiveError,
} from '../domain/repositories/branch.repository.interface';
import type { IBranchRepository } from '../domain/repositories/branch.repository.interface';
import { BRANCH_CODE_GENERATOR } from '../domain/services/branch-code-generator.interface';
import type { IBranchCodeGenerator } from '../domain/services/branch-code-generator.interface';
import { BranchQueryDto } from './dto/branch-query.dto';
import {
  BranchResponseDto,
  PaginatedBranchResponseDto,
} from './dto/branch-response.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchMapper } from './mappers/branch.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
}

@Injectable()
export class BranchService {
  constructor(
    @Inject(BRANCH_REPOSITORY)
    private readonly branchRepository: IBranchRepository,
    @Inject(BRANCH_CODE_GENERATOR)
    private readonly codeGenerator: IBranchCodeGenerator,
  ) {}

  async create(
    dto: CreateBranchDto,
    actor: ActorContext,
  ): Promise<BranchResponseDto> {
    if (
      dto.invoicePrefix &&
      (await this.branchRepository.existsByInvoicePrefix(
        actor.organizationId,
        dto.invoicePrefix,
      ))
    ) {
      throw new ConflictException(
        withCode(
          ErrorCode.BRANCH_INVOICE_PREFIX_CONFLICT,
          `Tiền tố hóa đơn "${dto.invoicePrefix}" đã được sử dụng trong tổ chức`,
        ),
      );
    }

    const code = await this.codeGenerator.generate(actor.organizationId);
    try {
      const branch = await this.branchRepository.create({
        organizationId: actor.organizationId,
        code,
        name: dto.name,
        email: dto.email ?? null,
        address: dto.address ?? null,
        province: dto.province ?? null,
        district: dto.district ?? null,
        ward: dto.ward ?? null,
        phone: dto.phone ?? null,
        invoicePrefix: dto.invoicePrefix ?? null,
        receiptPrefix: dto.receiptPrefix ?? null,
        timezone: dto.timezone,
        currencyCode: dto.currencyCode,
        managerUserId: dto.managerUserId ?? null,
        createdBy: actor.userId,
      });
      return BranchMapper.toResponseDto(branch);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  async getById(id: string, actor: ActorContext): Promise<BranchResponseDto> {
    const branch = await this.findOrThrow(id, actor.organizationId);
    return BranchMapper.toResponseDto(branch);
  }

  async search(
    query: BranchQueryDto,
    actor: ActorContext,
  ): Promise<PaginatedBranchResponseDto> {
    const result = await this.branchRepository.search({
      organizationId: actor.organizationId,
      search: query.search,
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return {
      items: result.items.map((item) => BranchMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async update(
    id: string,
    dto: UpdateBranchDto,
    actor: ActorContext,
  ): Promise<BranchResponseDto> {
    await this.findOrThrow(id, actor.organizationId);
    try {
      const branch = await this.branchRepository.update(
        id,
        actor.organizationId,
        { ...dto, updatedBy: actor.userId },
      );
      return BranchMapper.toResponseDto(branch);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  async archive(id: string, actor: ActorContext): Promise<BranchResponseDto> {
    await this.findOrThrow(id, actor.organizationId);
    try {
      const branch = await this.branchRepository.archive(
        id,
        actor.organizationId,
        actor.userId,
      );
      return BranchMapper.toResponseDto(branch);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  async setDefault(
    id: string,
    actor: ActorContext,
  ): Promise<BranchResponseDto> {
    await this.findOrThrow(id, actor.organizationId);
    const branch = await this.branchRepository.setDefault(
      id,
      actor.organizationId,
      actor.userId,
    );
    return BranchMapper.toResponseDto(branch);
  }

  private async findOrThrow(id: string, organizationId: string) {
    const branch = await this.branchRepository.findById(id, organizationId);
    if (!branch) {
      throw new NotFoundException(
        withCode(ErrorCode.BRANCH_NOT_FOUND, 'Không tìm thấy chi nhánh'),
      );
    }
    return branch;
  }

  private mapDomainError(error: unknown): Error {
    if (error instanceof BranchInvoicePrefixConflictError) {
      return new ConflictException(
        withCode(ErrorCode.BRANCH_INVOICE_PREFIX_CONFLICT, error.message),
      );
    }
    if (error instanceof BranchHasActiveWarehouseError) {
      return new ConflictException(
        withCode(ErrorCode.BRANCH_HAS_ACTIVE_WAREHOUSE, error.message),
      );
    }
    if (error instanceof BranchOrganizationMinOneActiveError) {
      return new ConflictException(
        withCode(ErrorCode.BRANCH_ORGANIZATION_MIN_ONE_ACTIVE, error.message),
      );
    }
    if (error instanceof BranchNotActiveError) {
      return new ConflictException(
        withCode(ErrorCode.BRANCH_NOT_ACTIVE, error.message),
      );
    }
    return error as Error;
  }
}
