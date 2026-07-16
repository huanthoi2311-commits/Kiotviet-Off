import { PrismaService } from '../../../../prisma/prisma.service';
import { SequenceBranchCodeGenerator } from './sequence-branch-code.generator';

describe('SequenceBranchCodeGenerator', () => {
  let generator: SequenceBranchCodeGenerator;
  let prisma: { sequence: { upsert: jest.Mock } };

  beforeEach(() => {
    prisma = { sequence: { upsert: jest.fn() } };
    generator = new SequenceBranchCodeGenerator(
      prisma as unknown as PrismaService,
    );
  });

  it('sinh mã với prefix BR và đệm 6 chữ số', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 1 });
    await expect(generator.generate('org-1')).resolves.toBe('BR000001');
  });

  it('tăng dần theo lần gọi tiếp theo', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 42 });
    await expect(generator.generate('org-1')).resolves.toBe('BR000042');
  });

  it('gọi upsert đúng theo organizationId + tên sequence cố định', async () => {
    prisma.sequence.upsert.mockResolvedValue({ value: 1 });
    await generator.generate('org-42');
    expect(prisma.sequence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_name: {
            organizationId: 'org-42',
            name: 'branch_code',
          },
        },
      }),
    );
  });
});
