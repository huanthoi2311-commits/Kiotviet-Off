import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { UserReferenceService } from '../../user/application/user-reference.service';
import { WarehouseReferenceService } from '../../warehouse/application/warehouse-reference.service';
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
    private readonly userReferenceService: UserReferenceService,
    private readonly warehouseReferenceService: WarehouseReferenceService,
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
    // T053.05C-2 — managerUserId là foreign id tenant-owned (User) — FK Prisma chỉ đảm bảo hàng
    // tồn tại, KHÔNG đảm bảo đúng tổ chức. CreateBranchDto không cho phép null (chỉ optional
    // string) nhưng vẫn kiểm tra truthy (cùng pattern WarehouseService.create() đã dùng cho
    // managerId, T053.05A) — undefined/không có giá trị thì bỏ qua.
    if (dto.managerUserId) {
      await this.assertManagerInOrganization(
        dto.managerUserId,
        actor.organizationId,
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
    // T053.05C-2 — managerUserId/defaultWarehouseId: tri-state — undefined = giữ nguyên (không
    // kiểm tra), null = xoá (KHÔNG cần tra User/Warehouse), string = xác minh thuộc
    // actor.organizationId trước khi ghi. KHÔNG được gộp undefined/null làm một (cùng pattern
    // WarehouseService.update() đã dùng cho managerId, T053.05A).
    if (dto.managerUserId !== undefined && dto.managerUserId !== null) {
      await this.assertManagerInOrganization(
        dto.managerUserId,
        actor.organizationId,
      );
    }
    if (
      dto.defaultWarehouseId !== undefined &&
      dto.defaultWarehouseId !== null
    ) {
      await this.assertDefaultWarehouseInOrganization(
        dto.defaultWarehouseId,
        actor.organizationId,
      );
    }
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

  /** T053.05C-2 — `UserReferenceService.findById` đã non-disclosing sẵn (cross-tenant hoặc không
   * tồn tại đều trả `null` như nhau — xem doc-comment interface), nên cross-tenant managerUserId
   * và managerUserId không tồn tại luôn ra CÙNG 1 USER_001, không có tín hiệu phân biệt nào rò rỉ
   * ra ngoài (cùng pattern WarehouseService.assertManagerInOrganization()). */
  private async assertManagerInOrganization(
    managerUserId: string,
    organizationId: string,
  ): Promise<void> {
    const manager = await this.userReferenceService.findById(
      managerUserId,
      organizationId,
    );
    if (!manager) {
      throw new NotFoundException(
        withCode(ErrorCode.USER_NOT_FOUND, 'Không tìm thấy người dùng'),
      );
    }
  }

  /** T053.05C-2 — cùng bất biến non-disclosing như `assertManagerInOrganization` ở trên, áp dụng
   * cho `defaultWarehouseId` (Warehouse). */
  private async assertDefaultWarehouseInOrganization(
    warehouseId: string,
    organizationId: string,
  ): Promise<void> {
    const warehouse = await this.warehouseReferenceService.findById(
      warehouseId,
      organizationId,
    );
    if (!warehouse) {
      throw new NotFoundException(
        withCode(ErrorCode.WAREHOUSE_NOT_FOUND, 'Không tìm thấy kho'),
      );
    }
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
