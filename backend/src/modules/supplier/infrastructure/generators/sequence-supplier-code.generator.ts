import { Injectable } from '@nestjs/common';
import { SequenceCodeGeneratorService } from '../../../../prisma/sequence-code-generator.service';
import { ISupplierCodeGenerator } from '../../domain/services/supplier-code-generator.interface';

const SUPPLIER_CODE_SEQUENCE_NAME = 'supplier_code';
const SUPPLIER_CODE_PREFIX = 'NCC';
const SUPPLIER_CODE_PAD_LENGTH = 6;

/**
 * Sinh mã nhà cung cấp (NCC000001) — adapter mỏng trên `SequenceCodeGeneratorService` dùng chung
 * (T012 SPEC-T012-SUPPLIER-001 §9.3b, Decision SP05) — không sao chép logic của
 * `SequenceCustomerCodeGenerator`. Tên sequence khác nhau (`supplier_code` vs `customer_code`)
 * nên độc lập hoàn toàn dù dùng chung 1 service (khóa `organizationId_name`).
 */
@Injectable()
export class SequenceSupplierCodeGenerator implements ISupplierCodeGenerator {
  constructor(private readonly generator: SequenceCodeGeneratorService) {}

  generate(organizationId: string): Promise<string> {
    return this.generator.generate(
      organizationId,
      SUPPLIER_CODE_SEQUENCE_NAME,
      SUPPLIER_CODE_PREFIX,
      SUPPLIER_CODE_PAD_LENGTH,
    );
  }
}
