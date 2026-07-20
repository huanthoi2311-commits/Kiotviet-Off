import { Module } from '@nestjs/common';
import { BranchModule } from '../branch/branch.module';
import { RbacModule } from '../rbac/rbac.module';
import { InvoiceService } from './application/invoice.service';
import { INVOICE_REPOSITORY } from './domain/repositories/invoice.repository.interface';
import { INVOICE_CODE_GENERATOR } from './domain/services/invoice-code-generator.interface';
import { SequenceInvoiceCodeGenerator } from './infrastructure/generators/sequence-invoice-code.generator';
import { PrismaInvoiceRepository } from './infrastructure/persistence/prisma-invoice.repository';
import { InvoiceController } from './presentation/invoice.controller';

/**
 * T013 Phase 2 (SPEC-T013-SALES-FOUNDATION-001 §9.3, ADR-0010 — Repository Boundary) —
 * `INVOICE_REPOSITORY` KHÔNG còn export. `InvoiceService` là public application port duy nhất
 * (đã đóng vai trò Domain Service từ trước — chỉ có `getById`/`search`/`createInvoice` nội bộ,
 * không có CRUD riêng cần tách thêm 1 class khác).
 *
 * T013 Phase 4 — import `BranchModule` để `SequenceInvoiceCodeGenerator` đọc
 * `Branch.invoicePrefix` qua `BRANCH_REPOSITORY` (export sẵn có của BranchModule, chưa qua
 * Repository Boundary Cleanup — ngoài phạm vi AD10/Phase 4, không tự dọn ở đây).
 */
@Module({
  imports: [RbacModule, BranchModule],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    { provide: INVOICE_REPOSITORY, useClass: PrismaInvoiceRepository },
    {
      provide: INVOICE_CODE_GENERATOR,
      useClass: SequenceInvoiceCodeGenerator,
    },
  ],
  exports: [InvoiceService],
})
export class InvoiceModule {}
