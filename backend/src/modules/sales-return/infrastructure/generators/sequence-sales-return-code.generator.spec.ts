import { SequenceCodeGeneratorService } from '../../../../prisma/sequence-code-generator.service';
import { SequenceSalesReturnCodeGenerator } from './sequence-sales-return-code.generator';

describe('SequenceSalesReturnCodeGenerator', () => {
  let generator: SequenceSalesReturnCodeGenerator;
  let sequenceService: jest.Mocked<
    Pick<SequenceCodeGeneratorService, 'generate'>
  >;

  beforeEach(() => {
    sequenceService = { generate: jest.fn().mockResolvedValue('SR000001') };
    generator = new SequenceSalesReturnCodeGenerator(
      sequenceService as unknown as SequenceCodeGeneratorService,
    );
  });

  it('ủy quyền cho SequenceCodeGeneratorService dùng chung (Decision AD12, SPEC §0 OQ5) — KHÔNG tự gọi prisma.sequence.upsert()', async () => {
    const result = await generator.generate('org-1');
    expect(sequenceService.generate).toHaveBeenCalledWith(
      'org-1',
      'sales_return_code',
      'SR',
      6,
    );
    expect(result).toBe('SR000001');
  });
});
