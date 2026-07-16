import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CategoryConcurrencyConflictError } from '../../domain/errors/category.errors';
import { PrismaCategoryRepository } from './prisma-category.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

describe('PrismaCategoryRepository', () => {
  let repository: PrismaCategoryRepository;
  let prisma: {
    category: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
  };

  const rawCategory = {
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
  };

  beforeEach(() => {
    prisma = {
      category: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };
    repository = new PrismaCategoryRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('create', () => {
    const input = {
      organizationId: 'org-1',
      code: 'ROOT',
      slug: 'danh-muc-goc',
      name: 'Danh mục gốc',
      createdBy: 'user-1',
    };

    it('tạo thành công', async () => {
      prisma.category.create.mockResolvedValue(rawCategory);
      const result = await repository.create(input);
      expect(result.code).toBe('ROOT');
    });

    it('tạo với status mặc định ACTIVE khi không truyền', async () => {
      prisma.category.create.mockResolvedValue(rawCategory);
      await repository.create(input);
      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('dịch lỗi P2002 sang ConflictException', async () => {
      prisma.category.create.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.category.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });
  });

  describe('findById / findByIdIncludingDeleted', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map đúng entity khi tìm thấy', async () => {
      prisma.category.findFirst.mockResolvedValue(rawCategory);
      const result = await repository.findById('cat-1', 'org-1');
      expect(result?.slug).toBe('danh-muc-goc');
      expect(result?.status).toBe('ACTIVE');
      expect(result?.version).toBe(1);
    });

    it('findByIdIncludingDeleted không lọc deletedAt', async () => {
      prisma.category.findFirst.mockResolvedValue({
        ...rawCategory,
        deletedAt: new Date(),
      });
      const result = await repository.findByIdIncludingDeleted(
        'cat-1',
        'org-1',
      );
      expect(result?.deletedAt).not.toBeNull();
      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: 'cat-1', organizationId: 'org-1' },
      });
    });
  });

  describe('softDelete / restore', () => {
    it('softDelete set deletedAt + status=ARCHIVED, tăng version', async () => {
      prisma.category.update.mockResolvedValue(rawCategory);
      await repository.softDelete('cat-1', 'user-1');
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: {
          deletedAt: expect.any(Date),
          status: 'ARCHIVED',
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });

    it('restore clear deletedAt + status=INACTIVE, tăng version', async () => {
      prisma.category.update.mockResolvedValue(rawCategory);
      await repository.restore('cat-1', 'user-1');
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: {
          deletedAt: null,
          status: 'INACTIVE',
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });
  });

  describe('update', () => {
    it('cập nhật thành công (version khớp) - updateMany rồi findUniqueOrThrow', async () => {
      prisma.category.updateMany.mockResolvedValue({ count: 1 });
      prisma.category.findUniqueOrThrow.mockResolvedValue(rawCategory);

      const result = await repository.update('cat-1', 1, {
        name: 'x',
        updatedBy: 'user-1',
      });

      expect(prisma.category.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-1', version: 1 },
          data: expect.objectContaining({
            name: 'x',
            version: { increment: 1 },
          }),
        }),
      );
      expect(result.id).toBe('cat-1');
    });

    it('ném CategoryConcurrencyConflictError khi version không khớp', async () => {
      prisma.category.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.update('cat-1', 1, { name: 'x', updatedBy: 'user-1' }),
      ).rejects.toThrow(CategoryConcurrencyConflictError);
      expect(prisma.category.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('dịch lỗi P2002 khi trùng slug/code (throw ngay từ updateMany)', async () => {
      prisma.category.updateMany.mockRejectedValue(
        knownError('P2002', { target: ['slug'] }),
      );
      await expect(
        repository.update('cat-1', 1, { name: 'x', updatedBy: 'user-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.category.updateMany.mockRejectedValue(new Error('db down'));
      await expect(
        repository.update('cat-1', 1, { name: 'x', updatedBy: 'user-1' }),
      ).rejects.toThrow('db down');
    });
  });

  describe('listAll', () => {
    it('chỉ lấy category chưa xóa mềm, sắp theo sortOrder rồi name', async () => {
      prisma.category.findMany.mockResolvedValue([rawCategory]);
      const result = await repository.listAll('org-1');
      expect(result).toHaveLength(1);
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', deletedAt: null },
        }),
      );
    });
  });

  describe('existsByCode / existsBySlug', () => {
    it('existsByCode true khi tìm thấy', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'cat-1' });
      await expect(repository.existsByCode('org-1', 'ROOT')).resolves.toBe(
        true,
      );
    });

    it('existsBySlug false khi không tìm thấy', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      await expect(
        repository.existsBySlug('org-1', 'danh-muc-goc'),
      ).resolves.toBe(false);
    });
  });

  describe('findAncestorChainIncludingArchived', () => {
    it('trả về mảng rỗng khi category không có cha', async () => {
      prisma.category.findMany.mockResolvedValue([rawCategory]);
      const result = await repository.findAncestorChainIncludingArchived(
        'cat-1',
        'org-1',
      );
      expect(result).toEqual([]);
    });

    it('trả về chuỗi tổ tiên từ cha trực tiếp tới gốc, BAO GỒM tổ tiên đã xóa mềm', async () => {
      const child = { ...rawCategory, id: 'child', parentId: 'parent' };
      const parent = {
        ...rawCategory,
        id: 'parent',
        parentId: 'root',
        status: 'ARCHIVED',
        deletedAt: new Date('2026-01-02'),
      };
      const root = { ...rawCategory, id: 'root', parentId: null };
      prisma.category.findMany.mockResolvedValue([child, parent, root]);

      const result = await repository.findAncestorChainIncludingArchived(
        'child',
        'org-1',
      );

      expect(result.map((c) => c.id)).toEqual(['parent', 'root']);
      expect(result[0].status).toBe('ARCHIVED');
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
      });
    });

    it('ném UnprocessableEntityException khi phát hiện vòng lặp bất thường trong dữ liệu (defensive, Decision IP03)', async () => {
      const a = { ...rawCategory, id: 'a', parentId: 'c' };
      const b = { ...rawCategory, id: 'b', parentId: 'a' };
      const c = { ...rawCategory, id: 'c', parentId: 'b' };
      prisma.category.findMany.mockResolvedValue([a, b, c]);

      await expect(
        repository.findAncestorChainIncludingArchived('a', 'org-1'),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
