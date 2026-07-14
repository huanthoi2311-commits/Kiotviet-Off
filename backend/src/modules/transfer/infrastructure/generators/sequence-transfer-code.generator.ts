import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ITransferCodeGenerator } from '../../domain/services/transfer-code-generator.interface';

const TRANSFER_CODE_SEQUENCE_NAME = 'transfer_code';
const TRANSFER_CODE_PREFIX = 'PDC';
const TRANSFER_CODE_PAD_LENGTH = 6;

/** Sinh mã phiếu điều chuyển nguyên tử qua bảng Sequence — cùng cơ chế SequenceSkuGenerator (Prompt 016). */
@Injectable()
export class SequenceTransferCodeGenerator implements ITransferCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(organizationId: string): Promise<string> {
    const sequence = await this.prisma.sequence.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name: TRANSFER_CODE_SEQUENCE_NAME,
        },
      },
      create: { organizationId, name: TRANSFER_CODE_SEQUENCE_NAME, value: 1 },
      update: { value: { increment: 1 } },
    });

    return `${TRANSFER_CODE_PREFIX}${sequence.value.toString().padStart(TRANSFER_CODE_PAD_LENGTH, '0')}`;
  }
}
