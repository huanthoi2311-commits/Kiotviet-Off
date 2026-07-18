import { Injectable } from '@nestjs/common';
import { SequenceCodeGeneratorService } from '../../../../prisma/sequence-code-generator.service';
import { ICustomerCodeGenerator } from '../../domain/services/customer-code-generator.interface';

const CUSTOMER_CODE_SEQUENCE_NAME = 'customer_code';
const CUSTOMER_CODE_PREFIX = 'CUS';
const CUSTOMER_CODE_PAD_LENGTH = 6;

/**
 * Sinh mã khách hàng (CUS000001) — adapter mỏng trên `SequenceCodeGeneratorService` dùng chung
 * (T012 SPEC-T012-SUPPLIER-001 §9.3b, Decision SP05). Refactor từ T011 chỉ đổi CÁCH sinh code
 * (gọi qua service dùng chung), KHÔNG đổi giá trị sinh ra (cùng sequence name/prefix/pad length).
 */
@Injectable()
export class SequenceCustomerCodeGenerator implements ICustomerCodeGenerator {
  constructor(private readonly generator: SequenceCodeGeneratorService) {}

  generate(organizationId: string): Promise<string> {
    return this.generator.generate(
      organizationId,
      CUSTOMER_CODE_SEQUENCE_NAME,
      CUSTOMER_CODE_PREFIX,
      CUSTOMER_CODE_PAD_LENGTH,
    );
  }
}
