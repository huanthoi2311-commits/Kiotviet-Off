import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { UnitEntity } from '../../domain/entities/unit.entity';
import { UnitConcurrencyConflictError } from '../../domain/errors/unit.errors';
import {
  CreateUnitInput,
  IUnitRepository,
  UnitSearchParams,
  UnitSearchResult,
  UpdateUnitInput,
} from '../../domain/repositories/unit.repository.interface';

type RawUnit = Prisma.UnitGetPayload<Record<string, never>>;

@Injectable()
export class PrismaUnitRepository implements IUnitRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUnitInput): Promise<UnitEntity> {
    try {
      const unit = await this.prisma.unit.create({
        data: {
          organizationId: input.organizationId,
          code: input.code,
          name: input.name,
          symbol: input.symbol,
          status: input.status ?? 'ACTIVE',
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
      });
      return this.toEntity(unit);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<UnitEntity | null> {
    const unit = await this.prisma.unit.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    return unit ? this.toEntity(unit) : null;
  }

  async findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<UnitEntity | null> {
    const unit = await this.prisma.unit.findFirst({
      where: { id, organizationId },
    });
    return unit ? this.toEntity(unit) : null;
  }

  /**
   * Optimistic Lock (SPEC-UNIT-001 §10.1, Decision RQ2) — compare-and-swap qua `updateMany`,
   * đúng mẫu `PrismaBrandRepository.update()`. `organizationId` bắt buộc trong `where` (Decision
   * SU03/UP06). 0 dòng bị ảnh hưởng → `id`/`organizationId`/`expectedVersion` không khớp →
   * `UnitConcurrencyConflictError`.
   */
  async update(
    id: string,
    organizationId: string,
    expectedVersion: number,
    input: UpdateUnitInput,
  ): Promise<UnitEntity> {
    try {
      const updateResult = await this.prisma.unit.updateMany({
        where: { id, organizationId, version: expectedVersion },
        data: {
          code: input.code,
          name: input.name,
          symbol: input.symbol,
          status: input.status,
          updatedBy: input.updatedBy,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new UnitConcurrencyConflictError(id);
      }

      const unit = await this.prisma.unit.findUniqueOrThrow({
        where: { id },
      });
      return this.toEntity(unit);
    } catch (error) {
      if (error instanceof UnitConcurrencyConflictError) {
        throw error;
      }
      throw this.translateWriteError(error);
    }
  }

  async softDelete(
    id: string,
    organizationId: string,
    deletedBy: string,
  ): Promise<void> {
    await this.prisma.unit.updateMany({
      where: { id, organizationId },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
        updatedBy: deletedBy,
        version: { increment: 1 },
      },
    });
  }

  /** SPEC-UNIT-001 §9/Decision RQ3: restore luôn trả status về INACTIVE, không tự động ACTIVE. */
  async restore(
    id: string,
    organizationId: string,
    restoredBy: string,
  ): Promise<void> {
    await this.prisma.unit.updateMany({
      where: { id, organizationId },
      data: {
        deletedAt: null,
        status: 'INACTIVE',
        updatedBy: restoredBy,
        version: { increment: 1 },
      },
    });
  }

  async search(params: UnitSearchParams): Promise<UnitSearchResult> {
    const statusConditions: Prisma.UnitWhereInput[] = [];
    if (params.status) statusConditions.push({ status: params.status });
    if (params.isActive !== undefined) {
      statusConditions.push({
        status: params.isActive ? 'ACTIVE' : { not: 'ACTIVE' },
      });
    }

    const where: Prisma.UnitWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      ...(statusConditions.length > 0 ? { AND: statusConditions } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { code: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.unit.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip,
        take: params.limit,
      }),
      this.prisma.unit.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean> {
    const found = await this.prisma.unit.findFirst({
      where: {
        organizationId,
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return !!found;
  }

  private translateWriteError(error: unknown): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target =
        (error.meta?.target as string[] | undefined)?.join(', ') ??
        'trường dữ liệu';
      return new ConflictException(
        withCode(
          ErrorCode.UNIT_DUPLICATE,
          `Giá trị của "${target}" đã tồn tại`,
        ),
      );
    }
    return error as Error;
  }

  private toEntity(unit: RawUnit): UnitEntity {
    return {
      id: unit.id,
      organizationId: unit.organizationId,
      code: unit.code,
      name: unit.name,
      symbol: unit.symbol,
      status: unit.status,
      version: unit.version,
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
      deletedAt: unit.deletedAt,
    };
  }
}
