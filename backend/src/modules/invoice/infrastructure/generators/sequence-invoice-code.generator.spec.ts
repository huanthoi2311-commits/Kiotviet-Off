import { PrismaService } from '../../../../prisma/prisma.service';
import { SequenceInvoiceCodeGenerator } from './sequence-invoice-code.generator';

describe('SequenceInvoiceCodeGenerator', () => {
  let generator: SequenceInvoiceCodeGenerator;
  let prisma: { sequence: { upsert: jest.Mock } };

  beforeEach(() => {
    prisma = { sequence: { upsert: jest.fn() } };
    generator = new SequenceInvoiceCodeGenerator(
      prisma as unknown as PrismaService,
    );
  });

  it('sinh mã với prefix HD và đệm 6 chữ số', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 1 });
    await expect(generator.generate('org-1')).resolves.toBe('HD000001');
  });

  it('tăng dần theo lần gọi tiếp theo (dựa vào giá trị Sequence trả về)', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 42 });
    await expect(generator.generate('org-1')).resolves.toBe('HD000042');
  });

  it('gọi upsert đúng theo organizationId + tên sequence cố định', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 1 });
    await generator.generate('org-42');

    expect(prisma.sequence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_name: {
            organizationId: 'org-42',
            name: 'invoice_code',
          },
        },
      }),
    );
  });
});
