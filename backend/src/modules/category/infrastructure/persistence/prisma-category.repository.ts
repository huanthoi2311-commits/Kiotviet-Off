import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { CategoryEntity } from '../../domain/entities/category.entity';
import {
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

  async update(
    id: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryEntity> {
    try {
      const category = await this.prisma.category.update({
        where: { id },
        data: {
          parentId: input.parentId,
          code: input.code,
          slug: input.slug,
          name: input.name,
          description: input.description,
          imageUrl: input.imageUrl,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          updatedBy: input.updatedBy,
        },
      });
      return this.toEntity(category);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  }

  async restore(id: string, restoredBy: string): Promise<void> {
    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: null, updatedBy: restoredBy },
    });
  }

  async listAll(organizationId: string): Promise<CategoryEntity[]> {
    const categories = await this.prisma.category.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return categories.map((c) => this.toEntity(c));
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
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      deletedAt: category.deletedAt,
    };
  }
}
