import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IOrganizationCodeGenerator } from '../../domain/services/organization-code-generator.interface';

const CODE_PREFIX = 'ORG';
const CODE_PAD_LENGTH = 6;

/**
 * Sinh mã Organization (ORG000001) qua Postgres SEQUENCE nguyên sinh `organization_code_seq`
 * (không phải bảng `sequences` dùng chung — Organization là gốc, chưa có organizationId nào
 * để scope theo cơ chế đó lúc sinh mã). `nextval()` atomic sẵn, an toàn concurrent.
 */
@Injectable()
export class SequenceOrganizationCodeGenerator implements IOrganizationCodeGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(): Promise<string> {
    const [{ nextval }] = await this.prisma.$queryRaw<[{ nextval: bigint }]>`
      SELECT nextval('organization_code_seq') AS nextval
    `;
    return `${CODE_PREFIX}${nextval.toString().padStart(CODE_PAD_LENGTH, '0')}`;
  }
}
