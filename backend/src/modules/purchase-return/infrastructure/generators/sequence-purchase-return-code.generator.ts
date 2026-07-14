import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IPurchaseReturnCodeGenerator } from '../../domain/services/purchase-return-code-generator.interface';

const PURCHASE_RETURN_CODE_SEQUENCE_NAME = 'purchase_return_code';
const PURCHASE_RETURN_CODE_PREFIX = 'PTH';
const PURCHASE_RETURN_CODE_PAD_LENGTH = 6;

/** Sinh mã phiếu trả hàng ("Phiếu Trả Hàng") nguyên tử qua bảng Sequence — cùng cơ chế SequenceSkuGenerator (Prompt 016). */
@Injectable()
export class SequencePurchaseReturnCodeGenerator implements IPurchaseReturnCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(organizationId: string): Promise<string> {
    const sequence = await this.prisma.sequence.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name: PURCHASE_RETURN_CODE_SEQUENCE_NAME,
        },
      },
      create: {
        organizationId,
        name: PURCHASE_RETURN_CODE_SEQUENCE_NAME,
        value: 1,
      },
      update: { value: { increment: 1 } },
    });

    return `${PURCHASE_RETURN_CODE_PREFIX}${sequence.value.toString().padStart(PURCHASE_RETURN_CODE_PAD_LENGTH, '0')}`;
  }
}
