import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IInventoryAdjustmentCodeGenerator } from '../../domain/services/inventory-adjustment-code-generator.interface';

const ADJUSTMENT_CODE_SEQUENCE_NAME = 'inventory_adjustment_code';
const ADJUSTMENT_CODE_PREFIX = 'PDCK';
const ADJUSTMENT_CODE_PAD_LENGTH = 6;

/** Sinh mã phiếu điều chỉnh nguyên tử qua bảng Sequence — cùng cơ chế SequenceSkuGenerator (Prompt 016). */
@Injectable()
export class SequenceInventoryAdjustmentCodeGenerator implements IInventoryAdjustmentCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(organizationId: string): Promise<string> {
    const sequence = await this.prisma.sequence.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name: ADJUSTMENT_CODE_SEQUENCE_NAME,
        },
      },
      create: { organizationId, name: ADJUSTMENT_CODE_SEQUENCE_NAME, value: 1 },
      update: { value: { increment: 1 } },
    });

    return `${ADJUSTMENT_CODE_PREFIX}${sequence.value.toString().padStart(ADJUSTMENT_CODE_PAD_LENGTH, '0')}`;
  }
}
