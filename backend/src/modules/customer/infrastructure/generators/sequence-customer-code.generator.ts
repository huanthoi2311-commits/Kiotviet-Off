import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ICustomerCodeGenerator } from '../../domain/services/customer-code-generator.interface';

const CUSTOMER_CODE_SEQUENCE_NAME = 'customer_code';
const CUSTOMER_CODE_PREFIX = 'CUS';
const CUSTOMER_CODE_PAD_LENGTH = 6;

/** Sinh mã khách hàng (CUS000001) nguyên tử qua bảng Sequence — cùng cơ chế SequenceSkuGenerator (Prompt 016). */
@Injectable()
export class SequenceCustomerCodeGenerator implements ICustomerCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(organizationId: string): Promise<string> {
    const sequence = await this.prisma.sequence.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name: CUSTOMER_CODE_SEQUENCE_NAME,
        },
      },
      create: { organizationId, name: CUSTOMER_CODE_SEQUENCE_NAME, value: 1 },
      update: { value: { increment: 1 } },
    });

    return `${CUSTOMER_CODE_PREFIX}${sequence.value.toString().padStart(CUSTOMER_CODE_PAD_LENGTH, '0')}`;
  }
}
