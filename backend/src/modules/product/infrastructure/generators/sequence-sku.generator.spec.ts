import { PrismaService } from '../../../../prisma/prisma.service';
import { SequenceSkuGenerator } from './sequence-sku.generator';

describe('SequenceSkuGenerator', () => {
  let generator: SequenceSkuGenerator;
  let prisma: { sequence: { upsert: jest.Mock } };

  beforeEach(() => {
    prisma = { sequence: { upsert: jest.fn() } };
    generator = new SequenceSkuGenerator(prisma as unknown as PrismaService);
  });

  it('sinh SKU với prefix SP và đệm 6 chữ số', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 1 });
    await expect(generator.generate('org-1')).resolves.toBe('SP000001');
  });

  it('tăng dần theo lần gọi tiếp theo (dựa vào giá trị Sequence trả về)', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 42 });
    await expect(generator.generate('org-1')).resolves.toBe('SP000042');
  });

  it('gọi upsert đúng theo organizationId + tên sequence cố định', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 1 });
    await generator.generate('org-42');

    expect(prisma.sequence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_name: {
            organizationId: 'org-42',
            name: 'product_sku',
          },
        },
      }),
    );
  });
});
