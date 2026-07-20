import { Inject, Injectable } from '@nestjs/common';
import { BRANCH_REPOSITORY } from '../../../branch/domain/repositories/branch.repository.interface';
import type { IBranchRepository } from '../../../branch/domain/repositories/branch.repository.interface';
import { SequenceCodeGeneratorService } from '../../../../prisma/sequence-code-generator.service';
import { IInvoiceCodeGenerator } from '../../domain/services/invoice-code-generator.interface';

const INVOICE_CODE_SEQUENCE_PREFIX = 'invoice_code_';
const INVOICE_CODE_FALLBACK_PREFIX = 'HD';
const INVOICE_CODE_PAD_LENGTH = 6;

/**
 * T013 Phase 4 (SPEC-T013-SALES-FOUNDATION-001 §0.9-0.10) — mã hóa đơn dùng
 * `Branch.invoicePrefix` (rơi về "HD" nếu Branch chưa cấu hình), sequence tách riêng theo
 * từng Branch (`invoice_code_<branchId>`) để 2 Branch khác prefix trong cùng Organization
 * không dùng chung 1 dải số. Dùng lại `SequenceCodeGeneratorService` (T012) — không viết lại
 * `prisma.sequence.upsert()`. Mã hóa đơn cũ (sinh trước Phase 4, sequence tên `invoice_code`)
 * giữ nguyên — không migrate/backfill.
 */
@Injectable()
export class SequenceInvoiceCodeGenerator implements IInvoiceCodeGenerator {
  constructor(
    private readonly generator: SequenceCodeGeneratorService,
    @Inject(BRANCH_REPOSITORY)
    private readonly branchRepository: IBranchRepository,
  ) {}

  async generate(organizationId: string, branchId: string): Promise<string> {
    const branch = await this.branchRepository.findById(
      branchId,
      organizationId,
    );
    const prefix = branch?.invoicePrefix ?? INVOICE_CODE_FALLBACK_PREFIX;

    return this.generator.generate(
      organizationId,
      `${INVOICE_CODE_SEQUENCE_PREFIX}${branchId}`,
      prefix,
      INVOICE_CODE_PAD_LENGTH,
    );
  }
}
