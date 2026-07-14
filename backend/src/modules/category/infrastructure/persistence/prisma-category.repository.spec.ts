import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
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
    it('softDelete set deletedAt và updatedBy', async () => {
      prisma.category.update.mockResolvedValue(rawCategory);
      await repository.softDelete('cat-1', 'user-1');
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-1' },
          data: expect.objectContaining({ updatedBy: 'user-1' }),
        }),
      );
    });

    it('restore clear deletedAt', async () => {
      prisma.category.update.mockResolvedValue(rawCategory);
      await repository.restore('cat-1', 'user-1');
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { deletedAt: null, updatedBy: 'user-1' },
      });
    });
  });

  describe('update', () => {
    it('dịch lỗi P2002 khi trùng slug/code', async () => {
      prisma.category.update.mockRejectedValue(
        knownError('P2002', { target: ['slug'] }),
      );
      await expect(
        repository.update('cat-1', { name: 'x', updatedBy: 'user-1' }),
      ).rejects.toThrow(ConflictException);
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
});
