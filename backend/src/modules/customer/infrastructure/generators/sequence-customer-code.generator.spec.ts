import { SequenceCodeGeneratorService } from '../../../../prisma/sequence-code-generator.service';
import { SequenceCustomerCodeGenerator } from './sequence-customer-code.generator';

/**
 * T012 (Decision SP05/SP11 điểm 7) — Regression Test: sau khi refactor thành adapter mỏng trên
 * `SequenceCodeGeneratorService` dùng chung, kết quả sinh mã Customer (CUS000001, prefix/pad
 * length) phải giữ nguyên hành vi như trước T012 — không đổi giá trị sinh ra.
 */
describe('SequenceCustomerCodeGenerator (adapter mỏng — T012 SP05)', () => {
  let generator: SequenceCustomerCodeGenerator;
  let sharedGenerator: jest.Mocked<
    Pick<SequenceCodeGeneratorService, 'generate'>
  >;

  beforeEach(() => {
    sharedGenerator = { generate: jest.fn() };
    generator = new SequenceCustomerCodeGenerator(
      sharedGenerator as unknown as SequenceCodeGeneratorService,
    );
  });

  it('ủy quyền cho SequenceCodeGeneratorService với đúng sequenceName/prefix/padLength cố định', async () => {
    sharedGenerator.generate.mockResolvedValue('CUS000001');
    const result = await generator.generate('org-1');

    expect(result).toBe('CUS000001');
    expect(sharedGenerator.generate).toHaveBeenCalledWith(
      'org-1',
      'customer_code',
      'CUS',
      6,
    );
  });
});
