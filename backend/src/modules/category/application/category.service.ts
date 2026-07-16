import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { ProductDomainService } from '../../product/application/product-domain.service';
import {
  CategoryEntity,
  CategoryTreeNode,
} from '../domain/entities/category.entity';
import { CategoryConcurrencyConflictError } from '../domain/errors/category.errors';
import { CATEGORY_REPOSITORY } from '../domain/repositories/category.repository.interface';
import type { ICategoryRepository } from '../domain/repositories/category.repository.interface';
import { CATEGORY_SLUG_GENERATOR } from '../domain/services/category-slug-generator.interface';
import type { ICategorySlugGenerator } from '../domain/services/category-slug-generator.interface';
import {
  CategoryResponseDto,
  CategoryTreeResponseDto,
  PaginatedCategoryResponseDto,
} from './dto/category-response.dto';
import { CategoryQueryDto } from './dto/category-query.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryMapper } from './mappers/category.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class CategoryService {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
    @Inject(CATEGORY_SLUG_GENERATOR)
    private readonly slugGenerator: ICategorySlugGenerator,
    private readonly productDomainService: ProductDomainService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    dto: CreateCategoryDto,
    actor: ActorContext,
  ): Promise<CategoryResponseDto> {
    if (dto.parentId) {
      await this.assertParentExists(dto.parentId, actor.organizationId);
    }

    const slug = await this.slugGenerator.generateUnique(
      actor.organizationId,
      dto.name,
    );

    const created = await this.categoryRepository.create({
      organizationId: actor.organizationId,
      parentId: dto.parentId ?? null,
      code: dto.code,
      slug,
      name: dto.name,
      description: dto.description ?? null,
      imageUrl: dto.imageUrl ?? null,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
      status: dto.status,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'category.create',
      entityType: 'Category',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onCategoryCreated(created);
    return CategoryMapper.toResponseDto(created);
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findById(id, organizationId);
    if (!category) throw this.notFound();
    return CategoryMapper.toResponseDto(category);
  }

  async list(
    query: CategoryQueryDto,
    organizationId: string,
  ): Promise<PaginatedCategoryResponseDto> {
    const result = await this.categoryRepository.search({
      organizationId,
      search: query.search,
      status: query.status,
      parentId: query.parentId,
      isActive: query.isActive,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortBy: query.sortBy ?? 'sortOrder',
      sortOrder: query.sortOrder ?? 'asc',
    });

    return {
      items: result.items.map((c) => CategoryMapper.toResponseDto(c)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async getTree(organizationId: string): Promise<CategoryTreeResponseDto[]> {
    const categories = await this.categoryRepository.listAll(organizationId);
    const tree = this.buildTree(categories);
    return tree.map((node) => CategoryMapper.toTreeResponseDto(node));
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    actor: ActorContext,
  ): Promise<CategoryResponseDto> {
    const existing = await this.categoryRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.CATEGORY_CIRCULAR_REFERENCE,
            'Danh mục không thể là cha của chính nó',
          ),
        );
      }
      await this.assertParentExists(dto.parentId, actor.organizationId);
      const allCategories = await this.categoryRepository.listAll(
        actor.organizationId,
      );
      this.assertNoCircularReference(id, dto.parentId, allCategories);
    }

    const slug =
      dto.name && dto.name !== existing.name
        ? await this.slugGenerator.generateUnique(
            actor.organizationId,
            dto.name,
            id,
          )
        : undefined;

    let updated: CategoryEntity;
    try {
      updated = await this.categoryRepository.update(id, dto.version, {
        parentId: dto.parentId,
        code: dto.code,
        slug,
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        status: dto.status,
        updatedBy: actor.userId,
      });
    } catch (error) {
      if (error instanceof CategoryConcurrencyConflictError) {
        throw new ConflictException(
          withCode(ErrorCode.CATEGORY_VERSION_CONFLICT, error.message),
        );
      }
      throw error;
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'category.update',
      entityType: 'Category',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onCategoryUpdated(updated);
    return CategoryMapper.toResponseDto(updated);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await this.categoryRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    const hasProducts =
      await this.productDomainService.hasActiveProductsInCategory(id);
    if (hasProducts) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.CATEGORY_HAS_PRODUCTS,
          'Không thể xóa danh mục đang có sản phẩm sử dụng',
        ),
      );
    }

    const allCategories = await this.categoryRepository.listAll(
      actor.organizationId,
    );
    this.assertNoActiveDescendant(id, allCategories);

    await this.categoryRepository.softDelete(id, actor.userId);

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'category.delete',
      entityType: 'Category',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onCategoryArchived(id);
  }

  async restore(id: string, actor: ActorContext): Promise<CategoryResponseDto> {
    const existing = await this.categoryRepository.findByIdIncludingDeleted(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();
    if (!existing.deletedAt) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.CATEGORY_NOT_DELETED,
          'Danh mục chưa bị xóa, không thể khôi phục',
        ),
      );
    }

    const ancestors =
      await this.categoryRepository.findAncestorChainIncludingArchived(
        id,
        actor.organizationId,
      );
    const archivedAncestor = ancestors.find((a) => a.status === 'ARCHIVED');
    if (archivedAncestor) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.CATEGORY_ANCESTOR_ARCHIVED,
          'Không thể khôi phục vì danh mục cha đang bị lưu trữ, vui lòng khôi phục danh mục cha trước',
        ),
      );
    }

    await this.categoryRepository.restore(id, actor.userId);
    const restored = await this.categoryRepository.findById(
      id,
      actor.organizationId,
    );
    if (!restored) throw this.notFound();

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'category.restore',
      entityType: 'Category',
      entityId: id,
      newValue: this.toAuditSnapshot(restored),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onCategoryRestored(restored);
    return CategoryMapper.toResponseDto(restored);
  }

  private async assertParentExists(
    parentId: string,
    organizationId: string,
  ): Promise<void> {
    const parent = await this.categoryRepository.findById(
      parentId,
      organizationId,
    );
    if (!parent) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.CATEGORY_PARENT_NOT_FOUND,
          'Danh mục cha không tồn tại',
        ),
      );
    }
  }

  /** Đi ngược chuỗi cha của `newParentId` — nếu gặp lại `categoryId` thì sẽ tạo vòng lặp. */
  private assertNoCircularReference(
    categoryId: string,
    newParentId: string,
    allCategories: CategoryEntity[],
  ): void {
    const byId = new Map(allCategories.map((c) => [c.id, c]));
    let current = byId.get(newParentId);
    const visited = new Set<string>();

    while (current) {
      if (current.id === categoryId) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.CATEGORY_CIRCULAR_REFERENCE,
            'Không thể gán danh mục cha vì sẽ tạo thành vòng lặp cha-con',
          ),
        );
      }
      if (visited.has(current.id)) break;
      visited.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }

  /**
   * Archive Rule đệ quy (SPEC-CATEGORY-001 §5, Decision Q6/S05) — kiểm tra TOÀN BỘ cây con
   * (không chỉ con trực tiếp), không N+1 query (Decision IP06 — 1 lần `listAll()` đã có sẵn ở
   * `remove()`, duyệt trong bộ nhớ). Bảo vệ vòng lặp bất thường (Decision IP03).
   */
  private assertNoActiveDescendant(
    categoryId: string,
    allCategories: CategoryEntity[],
  ): void {
    const childrenByParent = new Map<string, CategoryEntity[]>();
    for (const c of allCategories) {
      if (!c.parentId) continue;
      const list = childrenByParent.get(c.parentId) ?? [];
      list.push(c);
      childrenByParent.set(c.parentId, list);
    }

    const stack = [...(childrenByParent.get(categoryId) ?? [])];
    const visited = new Set<string>([categoryId]);

    while (stack.length) {
      const node = stack.pop()!;
      if (visited.has(node.id)) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.CATEGORY_CIRCULAR_REFERENCE,
            'Phát hiện vòng lặp bất thường trong dữ liệu danh mục',
          ),
        );
      }
      visited.add(node.id);
      if (node.status === 'ACTIVE') {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.CATEGORY_HAS_ACTIVE_DESCENDANT,
            'Không thể lưu trữ danh mục vì còn danh mục con đang hoạt động',
          ),
        );
      }
      stack.push(...(childrenByParent.get(node.id) ?? []));
    }
  }

  private buildTree(categories: CategoryEntity[]): CategoryTreeNode[] {
    const nodeById = new Map<string, CategoryTreeNode>(
      categories.map((c) => [c.id, { ...c, children: [] }]),
    );
    const roots: CategoryTreeNode[] = [];

    for (const category of categories) {
      const node = nodeById.get(category.id)!;
      if (category.parentId && nodeById.has(category.parentId)) {
        nodeById.get(category.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(ErrorCode.CATEGORY_NOT_FOUND, 'Không tìm thấy danh mục'),
    );
  }

  private toAuditSnapshot(category: CategoryEntity): Record<string, unknown> {
    return {
      code: category.code,
      slug: category.slug,
      name: category.name,
      parentId: category.parentId,
      isActive: category.isActive,
      status: category.status,
      version: category.version,
    };
  }

  /**
   * Điểm mở rộng Domain Event (RFC-0002 §14, SPEC-CATEGORY-001 §10, Decision Q11) - cố ý để
   * trống, KHÔNG publish (đúng mẫu `ProductService.onProductCreated()` v.v., T005). Chỉ định
   * nghĩa tên + thời điểm gọi, chờ Sprint Event triển khai Outbox thật (ADR-0009/ADR-0011).
   */
  private onCategoryCreated(category: CategoryEntity): void {
    void category;
  }

  private onCategoryUpdated(category: CategoryEntity): void {
    void category;
  }

  private onCategoryArchived(categoryId: string): void {
    void categoryId;
  }

  private onCategoryRestored(category: CategoryEntity): void {
    void category;
  }
}
