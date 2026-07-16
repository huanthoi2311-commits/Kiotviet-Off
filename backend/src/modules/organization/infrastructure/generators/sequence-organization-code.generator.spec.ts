import { PrismaService } from '../../../../prisma/prisma.service';
import { SequenceOrganizationCodeGenerator } from './sequence-organization-code.generator';

describe('SequenceOrganizationCodeGenerator', () => {
  let generator: SequenceOrganizationCodeGenerator;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    generator = new SequenceOrganizationCodeGenerator(
      prisma as unknown as PrismaService,
    );
  });

  it('sinh mã với prefix ORG và đệm 6 chữ số', async () => {
    prisma.$queryRaw.mockResolvedValue([{ nextval: BigInt(1) }]);
    await expect(generator.generate()).resolves.toBe('ORG000001');
  });

  it('tăng dần theo giá trị nextval trả về', async () => {
    prisma.$queryRaw.mockResolvedValue([{ nextval: BigInt(42) }]);
    await expect(generator.generate()).resolves.toBe('ORG000042');
  });

  it('gọi $queryRaw để lấy nextval từ organization_code_seq', async () => {
    prisma.$queryRaw.mockResolvedValue([{ nextval: BigInt(1) }]);
    await generator.generate();
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});
