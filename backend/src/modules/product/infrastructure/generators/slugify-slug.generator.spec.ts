import { PrismaService } from '../../../../prisma/prisma.service';
import { SlugifySlugGenerator } from './slugify-slug.generator';

describe('SlugifySlugGenerator', () => {
  let generator: SlugifySlugGenerator;
  let prisma: { product: { findFirst: jest.Mock } };

  beforeEach(() => {
    prisma = { product: { findFirst: jest.fn() } };
    generator = new SlugifySlugGenerator(prisma as unknown as PrismaService);
  });

  it('trả về slug cơ bản khi chưa tồn tại', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(
      generator.generateUnique('org-1', 'Áo thun nam'),
    ).resolves.toBe('ao-thun-nam');
  });

  it('thêm hậu tố -2 khi slug cơ bản đã tồn tại', async () => {
    prisma.product.findFirst
      .mockResolvedValueOnce({ id: 'existing-1' })
      .mockResolvedValueOnce(null);

    const result = await generator.generateUnique('org-1', 'Áo thun nam');

    expect(result).toBe('ao-thun-nam-2');
    expect(prisma.product.findFirst).toHaveBeenCalledTimes(2);
  });

  it('loại trừ chính sản phẩm đang sửa khi kiểm tra trùng (excludeId)', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await generator.generateUnique('org-1', 'Áo thun nam', 'product-1');

    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'product-1' } }),
      }),
    );
  });
});
