import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IBranchCodeGenerator } from '../../domain/services/branch-code-generator.interface';

const BRANCH_CODE_SEQUENCE_NAME = 'branch_code';
const BRANCH_CODE_PREFIX = 'BR';
const BRANCH_CODE_PAD_LENGTH = 6;

/** Sinh mã chi nhánh (BR000001) nguyên tử qua bảng Sequence — cùng cơ chế SequenceSkuGenerator (Prompt 016). */
@Injectable()
export class SequenceBranchCodeGenerator implements IBranchCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(organizationId: string): Promise<string> {
    const sequence = await this.prisma.sequence.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name: BRANCH_CODE_SEQUENCE_NAME,
        },
      },
      create: { organizationId, name: BRANCH_CODE_SEQUENCE_NAME, value: 1 },
      update: { value: { increment: 1 } },
    });

    return `${BRANCH_CODE_PREFIX}${sequence.value.toString().padStart(BRANCH_CODE_PAD_LENGTH, '0')}`;
  }
}
