import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { BrandEntity } from '../../domain/entities/brand.entity';
import { BrandConcurrencyConflictError } from '../../domain/errors/brand.errors';
import {
  BrandSearchParams,
  BrandSearchResult,
  CreateBrandInput,
  IBrandRepository,
  UpdateBrandInput,
} from '../../domain/repositories/brand.repository.interface';

type RawBrand = Prisma.BrandGetPayload<Record<string, never>>;

@Injectable()
export class PrismaBrandRepository implements IBrandRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateBrandInput): Promise<BrandEntity> {
    try {
      const brand = await this.prisma.brand.create({
        data: {
          organizationId: input.organizationId,
          code: input.code,
          name: input.name,
          logo: input.logo ?? null,
          description: input.description ?? null,
          website: input.website ?? null,
          country: input.country ?? null,
          status: input.status ?? 'ACTIVE',
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
      });
      return this.toEntity(brand);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<BrandEntity | null> {
    const brand = await this.prisma.brand.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    return brand ? this.toEntity(brand) : null;
  }

  async findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<BrandEntity | null> {
    const brand = await this.prisma.brand.findFirst({
      where: { id, organizationId },
    });
    return brand ? this.toEntity(brand) : null;
  }

  /**
   * Optimistic Lock (SPEC-BRAND-001 §7.1, Decision B02.7) — compare-and-swap qua `updateMany`
   * (Prisma `update()` không cho thêm điều kiện ngoài unique field ở `where`), đúng mẫu
   * `PrismaCategoryRepository.update()` (T006). 0 dòng bị ảnh hưởng → `expectedVersion` không
   * khớp → `BrandConcurrencyConflictError`.
   */
  async update(
    id: string,
    expectedVersion: number,
    input: UpdateBrandInput,
  ): Promise<BrandEntity> {
    try {
      const updateResult = await this.prisma.brand.updateMany({
        where: { id, version: expectedVersion },
        data: {
          code: input.code,
          name: input.name,
          logo: input.logo,
          description: input.description,
          website: input.website,
          country: input.country,
          status: input.status,
          updatedBy: input.updatedBy,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new BrandConcurrencyConflictError(id);
      }

      const brand = await this.prisma.brand.findUniqueOrThrow({
        where: { id },
      });
      return this.toEntity(brand);
    } catch (error) {
      if (error instanceof BrandConcurrencyConflictError) {
        throw error;
      }
      throw this.translateWriteError(error);
    }
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.prisma.brand.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedBy: deletedBy,
        version: { increment: 1 },
      },
    });
  }

  /** SPEC-BRAND-001 §8/Decision RQ2: restore luôn trả status về INACTIVE, không tự động ACTIVE. */
  async restore(id: string, restoredBy: string): Promise<void> {
    await this.prisma.brand.update({
      where: { id },
      data: {
        deletedAt: null,
        status: 'INACTIVE',
        updatedBy: restoredBy,
        version: { increment: 1 },
      },
    });
  }

  async search(params: BrandSearchParams): Promise<BrandSearchResult> {
    const statusConditions: Prisma.BrandWhereInput[] = [];
    if (params.status) statusConditions.push({ status: params.status });
    if (params.isActive !== undefined) {
      statusConditions.push({
        status: params.isActive ? 'ACTIVE' : { not: 'ACTIVE' },
      });
    }

    const where: Prisma.BrandWhereInput = {
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
      this.prisma.brand.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip,
        take: params.limit,
      }),
      this.prisma.brand.count({ where }),
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
    const found = await this.prisma.brand.findFirst({
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
          ErrorCode.BRAND_DUPLICATE,
          `Giá trị của "${target}" đã tồn tại`,
        ),
      );
    }
    return error as Error;
  }

  private toEntity(brand: RawBrand): BrandEntity {
    return {
      id: brand.id,
      organizationId: brand.organizationId,
      code: brand.code,
      name: brand.name,
      logo: brand.logo,
      description: brand.description,
      website: brand.website,
      country: brand.country,
      status: brand.status,
      version: brand.version,
      createdAt: brand.createdAt,
      updatedAt: brand.updatedAt,
      deletedAt: brand.deletedAt,
    };
  }
}
