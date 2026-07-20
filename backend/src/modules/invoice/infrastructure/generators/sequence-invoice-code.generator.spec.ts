import { IBranchRepository } from '../../../branch/domain/repositories/branch.repository.interface';
import { SequenceCodeGeneratorService } from '../../../../prisma/sequence-code-generator.service';
import { SequenceInvoiceCodeGenerator } from './sequence-invoice-code.generator';

describe('SequenceInvoiceCodeGenerator', () => {
  let generator: SequenceInvoiceCodeGenerator;
  let sequenceGenerator: jest.Mocked<
    Pick<SequenceCodeGeneratorService, 'generate'>
  >;
  let branchRepository: jest.Mocked<Pick<IBranchRepository, 'findById'>>;

  beforeEach(() => {
    sequenceGenerator = { generate: jest.fn() };
    branchRepository = { findById: jest.fn() };
    generator = new SequenceInvoiceCodeGenerator(
      sequenceGenerator as unknown as SequenceCodeGeneratorService,
      branchRepository as unknown as IBranchRepository,
    );
  });

  it('dùng Branch.invoicePrefix khi Branch có cấu hình', async () => {
    branchRepository.findById.mockResolvedValue({
      invoicePrefix: 'HN',
    } as never);
    sequenceGenerator.generate.mockResolvedValue('HN000001');

    await expect(generator.generate('org-1', 'branch-1')).resolves.toBe(
      'HN000001',
    );
    expect(branchRepository.findById).toHaveBeenCalledWith('branch-1', 'org-1');
    expect(sequenceGenerator.generate).toHaveBeenCalledWith(
      'org-1',
      'invoice_code_branch-1',
      'HN',
      6,
    );
  });

  it('rơi về prefix "HD" khi Branch.invoicePrefix là null', async () => {
    branchRepository.findById.mockResolvedValue({
      invoicePrefix: null,
    } as never);
    sequenceGenerator.generate.mockResolvedValue('HD000001');

    await generator.generate('org-1', 'branch-1');

    expect(sequenceGenerator.generate).toHaveBeenCalledWith(
      'org-1',
      'invoice_code_branch-1',
      'HD',
      6,
    );
  });

  it('rơi về prefix "HD" khi không tìm thấy Branch', async () => {
    branchRepository.findById.mockResolvedValue(null);
    sequenceGenerator.generate.mockResolvedValue('HD000001');

    await generator.generate('org-1', 'branch-1');

    expect(sequenceGenerator.generate).toHaveBeenCalledWith(
      'org-1',
      'invoice_code_branch-1',
      'HD',
      6,
    );
  });

  it('mỗi Branch dùng 1 sequence riêng (tên sequence gắn theo branchId)', async () => {
    branchRepository.findById.mockResolvedValue({
      invoicePrefix: 'SG',
    } as never);
    sequenceGenerator.generate.mockResolvedValue('SG000001');

    await generator.generate('org-1', 'branch-2');

    expect(sequenceGenerator.generate).toHaveBeenCalledWith(
      'org-1',
      'invoice_code_branch-2',
      'SG',
      6,
    );
  });
});
