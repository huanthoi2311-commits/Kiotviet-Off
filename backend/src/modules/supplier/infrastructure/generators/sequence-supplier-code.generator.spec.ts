import { SequenceCodeGeneratorService } from '../../../../prisma/sequence-code-generator.service';
import { SequenceSupplierCodeGenerator } from './sequence-supplier-code.generator';

describe('SequenceSupplierCodeGenerator (adapter mỏng — T012 SP05)', () => {
  let generator: SequenceSupplierCodeGenerator;
  let sharedGenerator: jest.Mocked<
    Pick<SequenceCodeGeneratorService, 'generate'>
  >;

  beforeEach(() => {
    sharedGenerator = { generate: jest.fn() };
    generator = new SequenceSupplierCodeGenerator(
      sharedGenerator as unknown as SequenceCodeGeneratorService,
    );
  });

  it('ủy quyền cho SequenceCodeGeneratorService với đúng sequenceName/prefix/padLength', async () => {
    sharedGenerator.generate.mockResolvedValue('NCC000001');
    const result = await generator.generate('org-1');

    expect(result).toBe('NCC000001');
    expect(sharedGenerator.generate).toHaveBeenCalledWith(
      'org-1',
      'supplier_code',
      'NCC',
      6,
    );
  });
});
