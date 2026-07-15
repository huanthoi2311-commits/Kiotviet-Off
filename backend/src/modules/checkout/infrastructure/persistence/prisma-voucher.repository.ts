import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { VoucherEntity } from '../../domain/entities/voucher.entity';
import {
  IVoucherRepository,
  VoucherConcurrencyConflictError,
} from '../../domain/repositories/voucher.repository.interface';

type RawVoucher = Prisma.VoucherGetPayload<Record<string, never>>;

@Injectable()
export class PrismaVoucherRepository implements IVoucherRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByCode(
    organizationId: string,
    code: string,
  ): Promise<VoucherEntity | null> {
    const voucher = await this.prisma.voucher.findFirst({
      where: { organizationId, code },
    });
    return voucher ? this.toEntity(voucher) : null;
  }

  async incrementUsage(
    id: string,
    previousUsedCount: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const result = await client.voucher.updateMany({
      where: { id, usedCount: previousUsedCount },
      data: { usedCount: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new VoucherConcurrencyConflictError(id);
    }
  }

  private toEntity(voucher: RawVoucher): VoucherEntity {
    return {
      id: voucher.id,
      code: voucher.code,
      type: voucher.type,
      value: voucher.value.toString(),
      minOrderAmount: voucher.minOrderAmount?.toString() ?? null,
      maxDiscount: voucher.maxDiscount?.toString() ?? null,
      usageLimit: voucher.usageLimit,
      usedCount: voucher.usedCount,
      startDate: voucher.startDate,
      endDate: voucher.endDate,
      status: voucher.status,
    };
  }
}
