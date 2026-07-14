import { PrismaService } from '../../../../prisma/prisma.service';
import { CategorySlugifySlugGenerator } from './category-slugify-slug.generator';

describe('CategorySlugifySlugGenerator', () => {
  let generator: CategorySlugifySlugGenerator;
  let prisma: { category: { findFirst: jest.Mock } };

  beforeEach(() => {
    prisma = { category: { findFirst: jest.fn() } };
    generator = new CategorySlugifySlugGenerator(
      prisma as unknown as PrismaService,
    );
  });

  it('trả về slug cơ bản khi chưa tồn tại', async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    await expect(generator.generateUnique('org-1', 'Thời trang')).resolves.toBe(
      'thoi-trang',
    );
  });

  it('thêm hậu tố -2 khi slug cơ bản đã tồn tại', async () => {
    prisma.category.findFirst
      .mockResolvedValueOnce({ id: 'existing' })
      .mockResolvedValueOnce(null);

    await expect(generator.generateUnique('org-1', 'Thời trang')).resolves.toBe(
      'thoi-trang-2',
    );
  });

  it('loại trừ chính category đang sửa khi kiểm tra trùng', async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    await generator.generateUnique('org-1', 'Thời trang', 'cat-1');
    expect(prisma.category.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'cat-1' } }),
      }),
    );
  });
});
