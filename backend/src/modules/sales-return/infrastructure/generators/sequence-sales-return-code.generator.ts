import { Injectable } from '@nestjs/common';
import { SequenceCodeGeneratorService } from '../../../../prisma/sequence-code-generator.service';
import { ISalesReturnCodeGenerator } from '../../domain/services/sales-return-code-generator.interface';

const SALES_RETURN_CODE_SEQUENCE_NAME = 'sales_return_code';
const SALES_RETURN_CODE_PREFIX = 'SR';
const SALES_RETURN_CODE_PAD_LENGTH = 6;

/**
 * Sinh mã phiếu trả hàng (SR000001) — adapter mỏng trên `SequenceCodeGeneratorService` dùng
 * chung (SPEC-T014-SALES-RETURN-EXCHANGE-001 §0 OQ5, Decision AD12). KHÔNG copy pattern tự gọi
 * `prisma.sequence.upsert()` trực tiếp của `SequencePurchaseReturnCodeGenerator` — module đó
 * viết trước AD12, không phải precedent đúng để theo cho document MỚI.
 */
@Injectable()
export class SequenceSalesReturnCodeGenerator implements ISalesReturnCodeGenerator {
  constructor(private readonly generator: SequenceCodeGeneratorService) {}

  generate(organizationId: string): Promise<string> {
    return this.generator.generate(
      organizationId,
      SALES_RETURN_CODE_SEQUENCE_NAME,
      SALES_RETURN_CODE_PREFIX,
      SALES_RETURN_CODE_PAD_LENGTH,
    );
  }
}
