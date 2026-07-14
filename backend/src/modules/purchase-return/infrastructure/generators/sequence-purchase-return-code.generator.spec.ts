import { PrismaService } from '../../../../prisma/prisma.service';
import { SequencePurchaseReturnCodeGenerator } from './sequence-purchase-return-code.generator';

describe('SequencePurchaseReturnCodeGenerator', () => {
  let generator: SequencePurchaseReturnCodeGenerator;
  let prisma: { sequence: { upsert: jest.Mock } };

  beforeEach(() => {
    prisma = { sequence: { upsert: jest.fn() } };
    generator = new SequencePurchaseReturnCodeGenerator(
      prisma as unknown as PrismaService,
    );
  });

  it('sinh mã với prefix PTH và đệm 6 chữ số', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 1 });
    await expect(generator.generate('org-1')).resolves.toBe('PTH000001');
  });

  it('tăng dần theo lần gọi tiếp theo (dựa vào giá trị Sequence trả về)', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 42 });
    await expect(generator.generate('org-1')).resolves.toBe('PTH000042');
  });

  it('gọi upsert đúng theo organizationId + tên sequence cố định', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 1 });
    await generator.generate('org-42');

    expect(prisma.sequence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_name: {
            organizationId: 'org-42',
            name: 'purchase_return_code',
          },
        },
      }),
    );
  });
});
