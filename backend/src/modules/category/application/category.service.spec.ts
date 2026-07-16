import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { CategoryEntity } from '../domain/entities/category.entity';
import { CategoryConcurrencyConflictError } from '../domain/errors/category.errors';
import { ICategoryRepository } from '../domain/repositories/category.repository.interface';
import { ICategorySlugGenerator } from '../domain/services/category-slug-generator.interface';
import { ActorContext, CategoryService } from './category.service';

describe('CategoryService', () => {
  let service: CategoryService;
  let categoryRepository: jest.Mocked<ICategoryRepository>;
  let slugGenerator: jest.Mocked<ICategorySlugGenerator>;
  let productDomainService: jest.Mocked<
    Pick<ProductDomainService, 'hasActiveProductsInCategory'>
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeCategory = (
    overrides: Partial<CategoryEntity> = {},
  ): CategoryEntity => ({
    id: 'cat-1',
    organizationId: 'org-1',
    parentId: null,
    code: 'ROOT',
    name: 'Danh mục gốc',
    slug: 'danh-muc-goc',
    description: null,
    imageUrl: null,
    sortOrder: 0,
    isActive: true,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    categoryRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdIncludingDeleted: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      listAll: jest.fn().mockResolvedValue([]),
      search: jest.fn(),
      existsByCode: jest.fn(),
      existsBySlug: jest.fn(),
      findAncestorChainIncludingArchived: jest.fn().mockResolvedValue([]),
    };
    slugGenerator = {
      generateUnique: jest.fn().mockResolvedValue('danh-muc-moi'),
    };
    productDomainService = {
      hasActiveProductsInCategory: jest.fn().mockResolvedValue(false),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new CategoryService(
      categoryRepository,
      slugGenerator,
      productDomainService as unknown as ProductDomainService,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('create', () => {
    it('tạo danh mục gốc (không parentId) thành công', async () => {
      categoryRepository.create.mockResolvedValue(makeCategory());

      const result = await service.create(
        { code: 'ROOT', name: 'Danh mục gốc' },
        actor,
      );

      expect(result.id).toBe('cat-1');
      expect(categoryRepository.findById).not.toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'category.create' }),
      );
    });

    it('ném lỗi 422 khi parentId không tồn tại trong Organization', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(
        service.create(
          { code: 'CHILD', name: 'Con', parentId: 'missing-parent' },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(categoryRepository.create).not.toHaveBeenCalled();
    });

    it('tạo danh mục con khi parentId hợp lệ', async () => {
      categoryRepository.findById.mockResolvedValue(
        makeCategory({ id: 'parent-1' }),
      );
      categoryRepository.create.mockResolvedValue(
        makeCategory({ id: 'cat-2', parentId: 'parent-1' }),
      );

      const result = await service.create(
        { code: 'CHILD', name: 'Con', parentId: 'parent-1' },
        actor,
      );

      expect(result.parentId).toBe('parent-1');
    });
  });

  describe('list', () => {
    it('trả về danh sách phẳng đã map sang response DTO, phân trang mặc định', async () => {
      categoryRepository.search.mockResolvedValue({
        items: [makeCategory(), makeCategory({ id: 'cat-2' })],
        total: 2,
        page: 1,
        limit: 20,
      });

      const result = await service.list({}, 'org-1');

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(categoryRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          page: 1,
          limit: 20,
          sortBy: 'sortOrder',
          sortOrder: 'asc',
        }),
      );
    });

    it('truyền search/status/parentId/isActive vào search params', async () => {
      categoryRepository.search.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await service.list(
        {
          search: 'ao',
          status: 'ACTIVE',
          parentId: 'parent-1',
          isActive: true,
        },
        'org-1',
      );

      expect(categoryRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'ao',
          status: 'ACTIVE',
          parentId: 'parent-1',
          isActive: true,
        }),
      );
    });

    it('Pagination: truyền đúng page/limit tùy chỉnh (không dùng mặc định)', async () => {
      categoryRepository.search.mockResolvedValue({
        items: [],
        total: 45,
        page: 3,
        limit: 10,
      });

      const result = await service.list({ page: 3, limit: 10 }, 'org-1');

      expect(categoryRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3, limit: 10 }),
      );
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(45);
    });

    it('Pagination: truyền đúng sortBy/sortOrder tùy chỉnh', async () => {
      categoryRepository.search.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await service.list({ sortBy: 'name', sortOrder: 'desc' }, 'org-1');

      expect(categoryRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'name', sortOrder: 'desc' }),
      );
    });

    it('Multi Tenant Isolation: luôn dùng organizationId từ actor, không lấy từ query', async () => {
      categoryRepository.search.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await service.list({}, 'org-khac');

      expect(categoryRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-khac' }),
      );
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      categoryRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Multi Tenant Isolation: truyền đúng organizationId của actor xuống Repository, không bị hardcode', async () => {
      categoryRepository.findById.mockResolvedValue(
        makeCategory({ organizationId: 'org-khac' }),
      );
      await service.findOne('cat-1', 'org-khac');
      expect(categoryRepository.findById).toHaveBeenCalledWith(
        'cat-1',
        'org-khac',
      );
    });
  });

  describe('getTree', () => {
    it('dựng đúng cây nhiều cấp từ danh sách phẳng', async () => {
      const root = makeCategory({ id: 'root', parentId: null, name: 'Gốc' });
      const child = makeCategory({
        id: 'child',
        parentId: 'root',
        name: 'Con',
      });
      const grandchild = makeCategory({
        id: 'grandchild',
        parentId: 'child',
        name: 'Cháu',
      });
      categoryRepository.listAll.mockResolvedValue([root, child, grandchild]);

      const tree = await service.getTree('org-1');

      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe('root');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].id).toBe('child');
      expect(tree[0].children[0].children[0].id).toBe('grandchild');
    });

    it('coi node có parentId trỏ tới bản ghi không tồn tại (đã bị xóa) như root', async () => {
      const orphan = makeCategory({ id: 'orphan', parentId: 'deleted-parent' });
      categoryRepository.listAll.mockResolvedValue([orphan]);

      const tree = await service.getTree('org-1');

      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe('orphan');
    });
  });

  describe('update', () => {
    it('cập nhật thành công, sinh lại slug khi đổi tên', async () => {
      categoryRepository.findById.mockResolvedValue(makeCategory());
      slugGenerator.generateUnique.mockResolvedValue('ten-moi');
      categoryRepository.update.mockResolvedValue(
        makeCategory({ name: 'Tên mới', slug: 'ten-moi' }),
      );

      const result = await service.update(
        'cat-1',
        { version: 1, name: 'Tên mới' },
        actor,
      );

      expect(result.slug).toBe('ten-moi');
    });

    it('ném lỗi khi đổi parentId thành chính nó', async () => {
      categoryRepository.findById.mockResolvedValue(makeCategory());

      await expect(
        service.update('cat-1', { version: 1, parentId: 'cat-1' }, actor),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('ném lỗi khi đổi parentId tạo vòng lặp cha-con (gán cho cháu của chính nó)', async () => {
      const root = makeCategory({ id: 'root', parentId: null });
      const child = makeCategory({ id: 'child', parentId: 'root' });
      const grandchild = makeCategory({ id: 'grandchild', parentId: 'child' });

      categoryRepository.findById.mockImplementation((id) =>
        Promise.resolve(
          id === 'root' ? root : id === 'grandchild' ? grandchild : null,
        ),
      );
      categoryRepository.listAll.mockResolvedValue([root, child, grandchild]);

      // Cố gán root.parentId = grandchild (grandchild là hậu duệ của root) → vòng lặp.
      await expect(
        service.update('root', { version: 1, parentId: 'grandchild' }, actor),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(categoryRepository.update).not.toHaveBeenCalled();
    });

    it('cho phép đổi parentId sang 1 nhánh không liên quan (không vòng lặp)', async () => {
      const root = makeCategory({ id: 'root', parentId: null });
      const other = makeCategory({ id: 'other', parentId: null });
      categoryRepository.findById.mockImplementation((id) =>
        Promise.resolve(id === 'root' ? root : id === 'other' ? other : null),
      );
      categoryRepository.listAll.mockResolvedValue([root, other]);
      categoryRepository.update.mockResolvedValue(
        makeCategory({ id: 'root', parentId: 'other' }),
      );

      const result = await service.update(
        'root',
        { version: 1, parentId: 'other' },
        actor,
      );
      expect(result.parentId).toBe('other');
    });

    it('ném NotFoundException khi category không tồn tại', async () => {
      categoryRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { version: 1, name: 'x' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('Optimistic Lock: dịch CategoryConcurrencyConflictError sang ConflictException (409)', async () => {
      categoryRepository.findById.mockResolvedValue(makeCategory());
      categoryRepository.update.mockRejectedValue(
        new CategoryConcurrencyConflictError('cat-1'),
      );

      await expect(
        service.update('cat-1', { version: 1, name: 'x' }, actor),
      ).rejects.toThrow(ConflictException);
    });

    it('Optimistic Lock: truyền đúng dto.version (không phải existing.version) làm expectedVersion', async () => {
      categoryRepository.findById.mockResolvedValue(
        makeCategory({ version: 5 }),
      );
      categoryRepository.update.mockResolvedValue(makeCategory({ version: 6 }));

      await service.update('cat-1', { version: 5, name: 'x' }, actor);

      expect(categoryRepository.update).toHaveBeenCalledWith(
        'cat-1',
        5,
        expect.anything(),
      );
    });

    it('Parent Archived: ném lỗi 422 khi gán parentId trỏ tới danh mục đã bị xóa mềm/lưu trữ', async () => {
      categoryRepository.findById.mockImplementation((id) =>
        Promise.resolve(id === 'cat-1' ? makeCategory() : null),
      );

      await expect(
        service.update(
          'cat-1',
          { version: 1, parentId: 'archived-parent' },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(categoryRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('chặn xóa khi còn sản phẩm sử dụng danh mục', async () => {
      categoryRepository.findById.mockResolvedValue(makeCategory());
      productDomainService.hasActiveProductsInCategory.mockResolvedValue(true);

      await expect(service.remove('cat-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(categoryRepository.softDelete).not.toHaveBeenCalled();
    });

    it('xóa mềm thành công khi không còn sản phẩm', async () => {
      categoryRepository.findById.mockResolvedValue(makeCategory());
      productDomainService.hasActiveProductsInCategory.mockResolvedValue(false);

      await service.remove('cat-1', actor);

      expect(categoryRepository.softDelete).toHaveBeenCalledWith(
        'cat-1',
        'user-1',
      );
    });

    it('Archive nhiều cấp: chặn Archive khi con TRỰC TIẾP đang ACTIVE', async () => {
      const root = makeCategory({ id: 'root', parentId: null });
      const child = makeCategory({
        id: 'child',
        parentId: 'root',
        status: 'ACTIVE',
      });
      categoryRepository.findById.mockResolvedValue(root);
      categoryRepository.listAll.mockResolvedValue([root, child]);

      await expect(service.remove('root', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(categoryRepository.softDelete).not.toHaveBeenCalled();
    });

    it('Archive nhiều cấp: chặn Archive khi CHÁU (cấp 2, không phải con trực tiếp) đang ACTIVE', async () => {
      const root = makeCategory({ id: 'root', parentId: null });
      const child = makeCategory({
        id: 'child',
        parentId: 'root',
        status: 'INACTIVE',
      });
      const grandchild = makeCategory({
        id: 'grandchild',
        parentId: 'child',
        status: 'ACTIVE',
      });
      categoryRepository.findById.mockResolvedValue(root);
      categoryRepository.listAll.mockResolvedValue([root, child, grandchild]);

      await expect(service.remove('root', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(categoryRepository.softDelete).not.toHaveBeenCalled();
    });

    it('Archive nhiều cấp: cho phép Archive khi TOÀN BỘ cây con đều không ACTIVE', async () => {
      const root = makeCategory({ id: 'root', parentId: null });
      const child = makeCategory({
        id: 'child',
        parentId: 'root',
        status: 'INACTIVE',
      });
      const grandchild = makeCategory({
        id: 'grandchild',
        parentId: 'child',
        status: 'ARCHIVED',
      });
      categoryRepository.findById.mockResolvedValue(root);
      categoryRepository.listAll.mockResolvedValue([root, child, grandchild]);

      await service.remove('root', actor);

      expect(categoryRepository.softDelete).toHaveBeenCalledWith(
        'root',
        'user-1',
      );
    });

    it('Circular Detection (defensive, Decision IP03): dừng và ném lỗi nghiệp vụ thay vì lặp vô hạn khi dữ liệu cây con có vòng lặp bất thường', async () => {
      // Du lieu bat thuong gia dinh: a->b->c->a (khong the xay ra qua flow ghi binh thuong vi
      // assertNoCircularReference da chan, nhung day la bao ve phong thu cho du lieu hong).
      const a = makeCategory({ id: 'a', parentId: 'c' });
      const b = makeCategory({ id: 'b', parentId: 'a' });
      const c = makeCategory({ id: 'c', parentId: 'b' });
      categoryRepository.findById.mockResolvedValue(a);
      categoryRepository.listAll.mockResolvedValue([a, b, c]);

      await expect(service.remove('a', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(categoryRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('ném lỗi khi danh mục chưa bị xóa', async () => {
      categoryRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeCategory(),
      );
      await expect(service.restore('cat-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('khôi phục thành công', async () => {
      categoryRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeCategory({ deletedAt: new Date() }),
      );
      categoryRepository.findById.mockResolvedValue(makeCategory());

      const result = await service.restore('cat-1', actor);
      expect(result.deletedAt).toBeNull();
    });

    it('Restore nhiều cấp: chặn Restore khi cha TRỰC TIẾP đang ARCHIVED', async () => {
      categoryRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeCategory({ id: 'child', deletedAt: new Date() }),
      );
      categoryRepository.findAncestorChainIncludingArchived.mockResolvedValue([
        makeCategory({ id: 'parent', status: 'ARCHIVED' }),
      ]);

      await expect(service.restore('child', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(categoryRepository.restore).not.toHaveBeenCalled();
    });

    it('Restore nhiều cấp: chặn Restore khi TỔ TIÊN cấp 2 (ông, không phải cha trực tiếp) đang ARCHIVED', async () => {
      categoryRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeCategory({ id: 'grandchild', deletedAt: new Date() }),
      );
      // findAncestorChainIncludingArchived trả về đúng thứ tự cha -> ông (Step 5).
      categoryRepository.findAncestorChainIncludingArchived.mockResolvedValue([
        makeCategory({ id: 'child', status: 'INACTIVE' }),
        makeCategory({ id: 'root', status: 'ARCHIVED' }),
      ]);

      await expect(service.restore('grandchild', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(categoryRepository.restore).not.toHaveBeenCalled();
    });

    it('Restore nhiều cấp: cho phép Restore khi TOÀN BỘ chuỗi tổ tiên không có ai ARCHIVED', async () => {
      categoryRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeCategory({ id: 'grandchild', deletedAt: new Date() }),
      );
      categoryRepository.findAncestorChainIncludingArchived.mockResolvedValue([
        makeCategory({ id: 'child', status: 'INACTIVE' }),
        makeCategory({ id: 'root', status: 'ACTIVE' }),
      ]);
      categoryRepository.findById.mockResolvedValue(
        makeCategory({ id: 'grandchild' }),
      );

      await service.restore('grandchild', actor);

      expect(categoryRepository.restore).toHaveBeenCalledWith(
        'grandchild',
        'user-1',
      );
    });

    it('Restore nhiều cấp: cho phép Restore khi không có tổ tiên nào (danh mục gốc)', async () => {
      categoryRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeCategory({ deletedAt: new Date() }),
      );
      categoryRepository.findAncestorChainIncludingArchived.mockResolvedValue(
        [],
      );
      categoryRepository.findById.mockResolvedValue(makeCategory());

      await service.restore('cat-1', actor);

      expect(categoryRepository.restore).toHaveBeenCalledWith(
        'cat-1',
        'user-1',
      );
    });
  });
});
