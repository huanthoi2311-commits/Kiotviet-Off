import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { BrandEntity } from '../../domain/entities/brand.entity';
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

  async update(id: string, input: UpdateBrandInput): Promise<BrandEntity> {
    try {
      const brand = await this.prisma.brand.update({
        where: { id },
        data: {
          code: input.code,
          name: input.name,
          logo: input.logo,
          description: input.description,
          website: input.website,
          country: input.country,
          status: input.status,
          updatedBy: input.updatedBy,
        },
      });
      return this.toEntity(brand);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.prisma.brand.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  }

  async search(params: BrandSearchParams): Promise<BrandSearchResult> {
    const where: Prisma.BrandWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      status: params.status,
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
        orderBy: { name: 'asc' },
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
      createdAt: brand.createdAt,
      updatedAt: brand.updatedAt,
      deletedAt: brand.deletedAt,
    };
  }
}
