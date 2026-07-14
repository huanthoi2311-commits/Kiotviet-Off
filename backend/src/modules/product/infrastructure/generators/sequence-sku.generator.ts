import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ISkuGenerator } from '../../domain/services/sku-generator.interface';

const SKU_SEQUENCE_NAME = 'product_sku';
const SKU_PREFIX = 'SP';
const SKU_PAD_LENGTH = 6;

/**
 * Sinh SKU nguyên tử qua bảng Sequence (Prisma upsert = 1 câu UPDATE/INSERT duy nhất,
 * Postgres tự khóa row — không cần SQL raw, không race-condition khi 2 request tạo
 * Product cùng lúc trong cùng Organization).
 */
@Injectable()
export class SequenceSkuGenerator implements ISkuGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(organizationId: string): Promise<string> {
    const sequence = await this.prisma.sequence.upsert({
      where: {
        organizationId_name: { organizationId, name: SKU_SEQUENCE_NAME },
      },
      create: { organizationId, name: SKU_SEQUENCE_NAME, value: 1 },
      update: { value: { increment: 1 } },
    });

    return `${SKU_PREFIX}${sequence.value.toString().padStart(SKU_PAD_LENGTH, '0')}`;
  }
}
