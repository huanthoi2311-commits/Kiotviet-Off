import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IInvoiceCodeGenerator } from '../../domain/services/invoice-code-generator.interface';

const INVOICE_CODE_SEQUENCE_NAME = 'invoice_code';
const INVOICE_CODE_PREFIX = 'HD';
const INVOICE_CODE_PAD_LENGTH = 6;

/** Sinh mã hóa đơn (HD000001) nguyên tử qua bảng Sequence — cùng cơ chế SequenceSkuGenerator (Prompt 016). */
@Injectable()
export class SequenceInvoiceCodeGenerator implements IInvoiceCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(organizationId: string): Promise<string> {
    const sequence = await this.prisma.sequence.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name: INVOICE_CODE_SEQUENCE_NAME,
        },
      },
      create: { organizationId, name: INVOICE_CODE_SEQUENCE_NAME, value: 1 },
      update: { value: { increment: 1 } },
    });

    return `${INVOICE_CODE_PREFIX}${sequence.value.toString().padStart(INVOICE_CODE_PAD_LENGTH, '0')}`;
  }
}
