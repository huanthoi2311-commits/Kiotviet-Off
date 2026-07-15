import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CustomerPointLedgerEntity } from '../../domain/entities/customer-point-ledger.entity';
import {
  AddPointInput,
  CustomerPointHistoryParams,
  CustomerPointHistoryResult,
  CustomerPointInsufficientBalanceError,
  ICustomerPointRepository,
  UsePointInput,
} from '../../domain/repositories/customer-point.repository.interface';

type RawLedgerEntry = Prisma.CustomerPointLedgerGetPayload<
  Record<string, never>
>;

@Injectable()
export class PrismaCustomerPointRepository implements ICustomerPointRepository {
  constructor(private readonly prisma: PrismaService) {}

  async addPoint(input: AddPointInput): Promise<CustomerPointLedgerEntity> {
    return this.prisma.$transaction(async (tx) => {
      const currentBalance = await this.lockAndGetBalance(tx, input.customerId);
      const balance = currentBalance + input.point;

      const created = await tx.customerPointLedger.create({
        data: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          point: input.point,
          balance,
          expiredAt: input.expiredAt ?? null,
          createdBy: input.createdBy,
        },
      });
      return this.toEntity(created);
    });
  }

  async usePoint(
    input: UsePointInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CustomerPointLedgerEntity> {
    const run = async (
      client: Prisma.TransactionClient,
    ): Promise<CustomerPointLedgerEntity> => {
      const currentBalance = await this.lockAndGetBalance(
        client,
        input.customerId,
      );
      if (input.point > currentBalance) {
        throw new CustomerPointInsufficientBalanceError(
          input.customerId,
          currentBalance,
        );
      }
      const balance = currentBalance - input.point;

      const created = await client.customerPointLedger.create({
        data: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          point: -input.point,
          balance,
          createdBy: input.createdBy,
        },
      });
      return this.toEntity(created);
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  async getHistory(
    params: CustomerPointHistoryParams,
  ): Promise<CustomerPointHistoryResult> {
    const where: Prisma.CustomerPointLedgerWhereInput = {
      organizationId: params.organizationId,
      customerId: params.customerId,
    };
    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customerPointLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.customerPointLedger.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getBalance(
    organizationId: string,
    customerId: string,
  ): Promise<number> {
    const lastEntry = await this.prisma.customerPointLedger.findFirst({
      where: { organizationId, customerId },
      orderBy: { createdAt: 'desc' },
    });
    return lastEntry?.balance ?? 0;
  }

  /**
   * Khóa dòng Customer (SELECT ... FOR UPDATE) trước khi đọc dòng ledger gần nhất — chặn
   * race condition khi 2 request cộng/trừ điểm cho CÙNG khách hàng chạy đồng thời (2
   * transaction đều đọc cùng 1 balance cũ rồi cùng ghi đè). Chỉ khóa theo customerId nên
   * các khách hàng khác không bị ảnh hưởng.
   */
  private async lockAndGetBalance(
    tx: Prisma.TransactionClient,
    customerId: string,
  ): Promise<number> {
    await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`;
    const lastEntry = await tx.customerPointLedger.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    return lastEntry?.balance ?? 0;
  }

  private toEntity(entry: RawLedgerEntry): CustomerPointLedgerEntity {
    return {
      id: entry.id,
      organizationId: entry.organizationId,
      customerId: entry.customerId,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      point: entry.point,
      balance: entry.balance,
      expiredAt: entry.expiredAt,
      createdAt: entry.createdAt,
    };
  }
}
