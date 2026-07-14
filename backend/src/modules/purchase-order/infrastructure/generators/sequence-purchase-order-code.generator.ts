import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IPurchaseOrderCodeGenerator } from '../../domain/services/purchase-order-code-generator.interface';

const PURCHASE_ORDER_CODE_SEQUENCE_NAME = 'purchase_order_code';
const PURCHASE_ORDER_CODE_PREFIX = 'PN';
const PURCHASE_ORDER_CODE_PAD_LENGTH = 6;

/** Sinh mã đơn nhập hàng nguyên tử qua bảng Sequence — cùng cơ chế SequenceSkuGenerator (Prompt 016). */
@Injectable()
export class SequencePurchaseOrderCodeGenerator implements IPurchaseOrderCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(organizationId: string): Promise<string> {
    const sequence = await this.prisma.sequence.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name: PURCHASE_ORDER_CODE_SEQUENCE_NAME,
        },
      },
      create: {
        organizationId,
        name: PURCHASE_ORDER_CODE_SEQUENCE_NAME,
        value: 1,
      },
      update: { value: { increment: 1 } },
    });

    return `${PURCHASE_ORDER_CODE_PREFIX}${sequence.value.toString().padStart(PURCHASE_ORDER_CODE_PAD_LENGTH, '0')}`;
  }
}
