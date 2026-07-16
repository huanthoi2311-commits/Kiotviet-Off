import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { CategoryEntity } from '../../domain/entities/category.entity';
import { CategoryConcurrencyConflictError } from '../../domain/errors/category.errors';
import {
  CategorySearchParams,
  CategorySearchResult,
  CreateCategoryInput,
  ICategoryRepository,
  UpdateCategoryInput,
} from '../../domain/repositories/category.repository.interface';

type RawCategory = Prisma.CategoryGetPayload<Record<string, never>>;

@Injectable()
export class PrismaCategoryRepository implements ICategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCategoryInput): Promise<CategoryEntity> {
    try {
      const category = await this.prisma.category.create({
        data: {
          organizationId: input.organizationId,
          parentId: input.parentId ?? null,
          code: input.code,
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          status: input.status ?? 'ACTIVE',
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
      });
      return this.toEntity(category);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<CategoryEntity | null> {
    const category = await this.prisma.category.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    return category ? this.toEntity(category) : null;
  }

  async findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<CategoryEntity | null> {
    const category = await this.prisma.category.findFirst({
      where: { id, organizationId },
    });
    return category ? this.toEntity(category) : null;
  }

  /**
   * Optimistic Lock (SPEC-CATEGORY-001 §7.1, Decision Q9) — compare-and-swap qua `updateMany`
   * (Prisma `update()` không cho thêm điều kiện ngoài unique field ở `where`), đúng mẫu
   * `PrismaProductRepository.update()` (T005). 0 dòng bị ảnh hưởng → `expectedVersion` không
   * khớp → `CategoryConcurrencyConflictError`.
   */
  async update(
    id: string,
    expectedVersion: number,
    input: UpdateCategoryInput,
  ): Promise<CategoryEntity> {
    try {
      const updateResult = await this.prisma.category.updateMany({
        where: { id, version: expectedVersion },
        data: {
          parentId: input.parentId,
          code: input.code,
          slug: input.slug,
          name: input.name,
          description: input.description,
          imageUrl: input.imageUrl,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          status: input.status,
          updatedBy: input.updatedBy,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new CategoryConcurrencyConflictError(id);
      }

      const category = await this.prisma.category.findUniqueOrThrow({
        where: { id },
      });
      return this.toEntity(category);
    } catch (error) {
      if (error instanceof CategoryConcurrencyConflictError) {
        throw error;
      }
      throw this.translateWriteError(error);
    }
  }

  /** Decision (SPEC §4, đúng mẫu Product Decision 4): Archive luôn set CẢ status=ARCHIVED lẫn deletedAt. */
  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.prisma.category.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
        updatedBy: deletedBy,
        version: { increment: 1 },
      },
    });
  }

  /** RFC-0002 §6 / SPEC §4: restore luôn trả status về INACTIVE, không tự động ACTIVE. */
  async restore(id: string, restoredBy: string): Promise<void> {
    await this.prisma.category.update({
      where: { id },
      data: {
        deletedAt: null,
        status: 'INACTIVE',
        updatedBy: restoredBy,
        version: { increment: 1 },
      },
    });
  }

  async listAll(organizationId: string): Promise<CategoryEntity[]> {
    const categories = await this.prisma.category.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return categories.map((c) => this.toEntity(c));
  }

  async search(params: CategorySearchParams): Promise<CategorySearchResult> {
    const where: Prisma.CategoryWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      status: params.status,
      parentId: params.parentId,
      isActive: params.isActive,
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
      this.prisma.category.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip,
        take: params.limit,
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      items: items.map((c) => this.toEntity(c)),
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
    const found = await this.prisma.category.findFirst({
      where: {
        organizationId,
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return !!found;
  }

  async existsBySlug(
    organizationId: string,
    slug: string,
    excludeId?: string,
  ): Promise<boolean> {
    const found = await this.prisma.category.findFirst({
      where: {
        organizationId,
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return !!found;
  }

  /**
   * Decision IP02 — 1 truy vấn duy nhất (không N+1, Decision IP06) tải toàn bộ Category của
   * `organizationId` (KHÔNG lọc `deletedAt` — khác `listAll()`, cố ý giữ nguyên hành vi
   * `listAll()`, không sửa), rồi đi ngược `parentId` trong bộ nhớ. Bảo vệ vòng lặp bất thường
   * (Decision IP03) bằng tập `visited` — dừng và ném lỗi nghiệp vụ thay vì lặp vô hạn.
   */
  async findAncestorChainIncludingArchived(
    categoryId: string,
    organizationId: string,
  ): Promise<CategoryEntity[]> {
    const all = await this.prisma.category.findMany({
      where: { organizationId },
    });
    const byId = new Map(all.map((c) => [c.id, c]));

    const chain: CategoryEntity[] = [];
    const visited = new Set<string>([categoryId]);
    let currentParentId = byId.get(categoryId)?.parentId ?? null;

    while (currentParentId) {
      if (visited.has(currentParentId)) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.CATEGORY_CIRCULAR_REFERENCE,
            'Phát hiện vòng lặp bất thường trong dữ liệu danh mục',
          ),
        );
      }
      visited.add(currentParentId);
      const parent = byId.get(currentParentId);
      if (!parent) break;
      chain.push(this.toEntity(parent));
      currentParentId = parent.parentId;
    }

    return chain;
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
          ErrorCode.CATEGORY_DUPLICATE,
          `Giá trị của "${target}" đã tồn tại`,
        ),
      );
    }
    return error as Error;
  }

  private toEntity(category: RawCategory): CategoryEntity {
    return {
      id: category.id,
      organizationId: category.organizationId,
      parentId: category.parentId,
      code: category.code,
      name: category.name,
      slug: category.slug,
      description: category.description,
      imageUrl: category.imageUrl,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      status: category.status,
      version: category.version,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      deletedAt: category.deletedAt,
    };
  }
}
