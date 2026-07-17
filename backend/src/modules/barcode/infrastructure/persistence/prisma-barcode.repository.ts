import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { BarcodeEntity } from '../../domain/entities/barcode.entity';
import { BarcodeConcurrencyConflictError } from '../../domain/errors/barcode.errors';
import {
  BarcodeSearchParams,
  BarcodeSearchResult,
  CreateBarcodeInput,
  IBarcodeRepository,
  UpdateBarcodeInput,
} from '../../domain/repositories/barcode.repository.interface';

type RawBarcode = Prisma.BarcodeGetPayload<Record<string, never>>;

@Injectable()
export class PrismaBarcodeRepository implements IBarcodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateBarcodeInput): Promise<BarcodeEntity> {
    try {
      if (input.isDefault) {
        return await this.prisma.$transaction(async (tx) => {
          await tx.barcode.updateMany({
            where: { productId: input.productId, isDefault: true },
            data: { isDefault: false },
          });
          const barcode = await tx.barcode.create({
            data: {
              productId: input.productId,
              organizationId: input.organizationId,
              unitId: input.unitId ?? null,
              code: input.code,
              type: input.type,
              isDefault: true,
              status: input.status ?? 'ACTIVE',
              createdBy: input.createdBy,
              updatedBy: input.createdBy,
            },
          });
          return this.toEntity(barcode);
        });
      }

      const barcode = await this.prisma.barcode.create({
        data: {
          productId: input.productId,
          organizationId: input.organizationId,
          unitId: input.unitId ?? null,
          code: input.code,
          type: input.type,
          isDefault: false,
          status: input.status ?? 'ACTIVE',
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
      });
      return this.toEntity(barcode);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<BarcodeEntity | null> {
    const barcode = await this.prisma.barcode.findFirst({
      where: {
        id,
        deletedAt: null,
        product: { organizationId, deletedAt: null },
      },
    });
    return barcode ? this.toEntity(barcode) : null;
  }

  async findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<BarcodeEntity | null> {
    const barcode = await this.prisma.barcode.findFirst({
      where: {
        id,
        product: { organizationId },
      },
    });
    return barcode ? this.toEntity(barcode) : null;
  }

  async listByProduct(
    productId: string,
    organizationId: string,
  ): Promise<BarcodeEntity[]> {
    const barcodes = await this.prisma.barcode.findMany({
      where: {
        productId,
        deletedAt: null,
        product: { organizationId, deletedAt: null },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return barcodes.map((barcode) => this.toEntity(barcode));
  }

  /** SPEC-BARCODE-001 §4.2/§4.3 — tra cứu org-wide cho GET /barcodes (Decision BQ1/SB08/SB09). */
  async search(params: BarcodeSearchParams): Promise<BarcodeSearchResult> {
    const statusConditions: Prisma.BarcodeWhereInput[] = [];
    if (params.status) statusConditions.push({ status: params.status });
    if (params.isActive !== undefined) {
      statusConditions.push({
        status: params.isActive ? 'ACTIVE' : { not: 'ACTIVE' },
      });
    }

    const where: Prisma.BarcodeWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      ...(statusConditions.length > 0 ? { AND: statusConditions } : {}),
      ...(params.search
        ? { code: { contains: params.search, mode: 'insensitive' } }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.barcode.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip,
        take: params.limit,
      }),
      this.prisma.barcode.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  /**
   * Optimistic Lock (SPEC-BARCODE-001 §9.1, Decision BQ10/SB02) — compare-and-swap qua
   * `updateMany`, đúng mẫu `PrismaUnitRepository.update()`. `organizationId` bắt buộc trong
   * `where` (Decision BQ8, ADR-0003 — sửa lỗ hổng đã tồn tại từ trước).
   */
  async update(
    id: string,
    organizationId: string,
    expectedVersion: number,
    input: UpdateBarcodeInput,
  ): Promise<BarcodeEntity> {
    try {
      const updateResult = await this.prisma.barcode.updateMany({
        where: { id, organizationId, version: expectedVersion },
        data: {
          code: input.code,
          type: input.type,
          unitId: input.unitId,
          status: input.status,
          updatedBy: input.updatedBy,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new BarcodeConcurrencyConflictError(id);
      }

      const barcode = await this.prisma.barcode.findUniqueOrThrow({
        where: { id },
      });
      return this.toEntity(barcode);
    } catch (error) {
      if (error instanceof BarcodeConcurrencyConflictError) {
        throw error;
      }
      throw this.translateWriteError(error);
    }
  }

  /** SPEC-BARCODE-001 §4.1 — Archive set cả deletedAt lẫn status=ARCHIVED (BarcodeStatus có giá trị này). */
  async softDelete(
    id: string,
    organizationId: string,
    expectedVersion: number,
    deletedBy: string,
  ): Promise<void> {
    const result = await this.prisma.barcode.updateMany({
      where: { id, organizationId, version: expectedVersion },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
        updatedBy: deletedBy,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new BarcodeConcurrencyConflictError(id);
    }
  }

  /** SPEC-BARCODE-001 §4.1 (Decision BQ3): restore luôn trả status về INACTIVE, không tự động ACTIVE. */
  async restore(
    id: string,
    organizationId: string,
    expectedVersion: number,
    restoredBy: string,
  ): Promise<void> {
    const result = await this.prisma.barcode.updateMany({
      where: { id, organizationId, version: expectedVersion },
      data: {
        deletedAt: null,
        status: 'INACTIVE',
        updatedBy: restoredBy,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new BarcodeConcurrencyConflictError(id);
    }
  }

  /**
   * Decision BQ9 (atomic) + BQ10 (Optimistic Lock trên setDefault). Bước "unset others" KHÔNG
   * kiểm version (áp dụng cho toàn bộ barcode khác của Product, không phải 1 bản ghi cụ thể) —
   * chỉ dòng barcode ĐÍCH mới compare-and-swap version (SPEC-BARCODE-001 §9.1).
   */
  async setDefault(
    id: string,
    organizationId: string,
    productId: string,
    expectedVersion: number,
    updatedBy: string,
  ): Promise<BarcodeEntity> {
    return this.prisma.$transaction(async (tx) => {
      await tx.barcode.updateMany({
        where: { productId, organizationId, isDefault: true, id: { not: id } },
        data: { isDefault: false, version: { increment: 1 } },
      });

      const updateResult = await tx.barcode.updateMany({
        where: { id, organizationId, version: expectedVersion },
        data: {
          isDefault: true,
          updatedBy,
          version: { increment: 1 },
        },
      });
      if (updateResult.count === 0) {
        throw new BarcodeConcurrencyConflictError(id);
      }

      const barcode = await tx.barcode.findUniqueOrThrow({ where: { id } });
      return this.toEntity(barcode);
    });
  }

  /** Decision BQ6 — wiring thật, dùng làm pre-check trước khi ghi (2 lớp cùng với P2002). */
  async existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean> {
    const found = await this.prisma.barcode.findFirst({
      where: {
        organizationId,
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return !!found;
  }

  /** SPEC-UNIT-001 §8 (Decision RQ5) — Delete Guard của Unit qua BarcodeDomainService. */
  async hasActiveBarcodesInUnit(unitId: string): Promise<boolean> {
    const found = await this.prisma.barcode.findFirst({
      where: { unitId, deletedAt: null },
      select: { id: true },
    });
    return !!found;
  }

  private translateWriteError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new ConflictException(
          withCode(
            ErrorCode.BARCODE_DUPLICATE,
            'Mã vạch này đã tồn tại trong hệ thống',
          ),
        );
      }
      if (error.code === 'P2003') {
        return new BadRequestException(
          withCode(
            ErrorCode.VALIDATION_FAILED,
            'Giá trị "unitId" không tồn tại',
          ),
        );
      }
    }
    return error as Error;
  }

  private toEntity(barcode: RawBarcode): BarcodeEntity {
    return {
      id: barcode.id,
      organizationId: barcode.organizationId,
      productId: barcode.productId,
      unitId: barcode.unitId,
      code: barcode.code,
      type: barcode.type,
      isDefault: barcode.isDefault,
      status: barcode.status,
      version: barcode.version,
      createdAt: barcode.createdAt,
      updatedAt: barcode.updatedAt,
      deletedAt: barcode.deletedAt,
    };
  }
}
