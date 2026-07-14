import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IStockCountCodeGenerator } from '../../domain/services/stock-count-code-generator.interface';

const STOCK_COUNT_CODE_SEQUENCE_NAME = 'stock_count_code';
const STOCK_COUNT_CODE_PREFIX = 'PKK';
const STOCK_COUNT_CODE_PAD_LENGTH = 6;

/** Sinh mã phiếu kiểm kê nguyên tử qua bảng Sequence — cùng cơ chế SequenceSkuGenerator (Prompt 016). */
@Injectable()
export class SequenceStockCountCodeGenerator implements IStockCountCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(organizationId: string): Promise<string> {
    const sequence = await this.prisma.sequence.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name: STOCK_COUNT_CODE_SEQUENCE_NAME,
        },
      },
      create: {
        organizationId,
        name: STOCK_COUNT_CODE_SEQUENCE_NAME,
        value: 1,
      },
      update: { value: { increment: 1 } },
    });

    return `${STOCK_COUNT_CODE_PREFIX}${sequence.value.toString().padStart(STOCK_COUNT_CODE_PAD_LENGTH, '0')}`;
  }
}
