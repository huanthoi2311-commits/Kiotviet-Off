import { PrismaService } from './prisma.service';
import { SequenceCodeGeneratorService } from './sequence-code-generator.service';

describe('SequenceCodeGeneratorService (T012 Decision SP05 — abstraction dùng chung)', () => {
  let service: SequenceCodeGeneratorService;
  let prisma: { sequence: { upsert: jest.Mock } };

  beforeEach(() => {
    prisma = { sequence: { upsert: jest.fn() } };
    service = new SequenceCodeGeneratorService(
      prisma as unknown as PrismaService,
    );
  });

  it('sinh mã với prefix và độ dài đệm tùy tham số', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 1 });
    await expect(
      service.generate('org-1', 'customer_code', 'CUS', 6),
    ).resolves.toBe('CUS000001');
  });

  it('tăng dần theo giá trị Sequence trả về', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 42 });
    await expect(
      service.generate('org-1', 'supplier_code', 'NCC', 6),
    ).resolves.toBe('NCC000042');
  });

  it('gọi upsert đúng theo organizationId + tên sequence truyền vào', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 1 });
    await service.generate('org-42', 'supplier_code', 'NCC', 6);

    expect(prisma.sequence.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_name: {
          organizationId: 'org-42',
          name: 'supplier_code',
        },
      },
      create: { organizationId: 'org-42', name: 'supplier_code', value: 1 },
      update: { value: { increment: 1 } },
    });
  });

  it('[SP11 điểm 6] cách ly sequence: customer_code và supplier_code trên cùng organizationId dùng khóa khác nhau, không trộn số', async () => {
    prisma.sequence.upsert.mockImplementation(
      ({ where }: { where: { organizationId_name: { name: string } } }) =>
        Promise.resolve({
          value: where.organizationId_name.name === 'customer_code' ? 5 : 1,
        }),
    );

    const customerCode = await service.generate(
      'org-1',
      'customer_code',
      'CUS',
      6,
    );
    const supplierCode = await service.generate(
      'org-1',
      'supplier_code',
      'NCC',
      6,
    );

    expect(customerCode).toBe('CUS000005');
    expect(supplierCode).toBe('NCC000001');
    expect(prisma.sequence.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          organizationId_name: {
            organizationId: 'org-1',
            name: 'customer_code',
          },
        },
      }),
    );
    expect(prisma.sequence.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          organizationId_name: {
            organizationId: 'org-1',
            name: 'supplier_code',
          },
        },
      }),
    );
  });
});
