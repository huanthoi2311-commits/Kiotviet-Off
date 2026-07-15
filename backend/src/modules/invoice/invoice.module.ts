import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { InvoiceService } from './application/invoice.service';
import { INVOICE_REPOSITORY } from './domain/repositories/invoice.repository.interface';
import { INVOICE_CODE_GENERATOR } from './domain/services/invoice-code-generator.interface';
import { SequenceInvoiceCodeGenerator } from './infrastructure/generators/sequence-invoice-code.generator';
import { PrismaInvoiceRepository } from './infrastructure/persistence/prisma-invoice.repository';
import { InvoiceController } from './presentation/invoice.controller';

@Module({
  imports: [RbacModule],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    { provide: INVOICE_REPOSITORY, useClass: PrismaInvoiceRepository },
    {
      provide: INVOICE_CODE_GENERATOR,
      useClass: SequenceInvoiceCodeGenerator,
    },
  ],
  exports: [InvoiceService, INVOICE_REPOSITORY],
})
export class InvoiceModule {}
