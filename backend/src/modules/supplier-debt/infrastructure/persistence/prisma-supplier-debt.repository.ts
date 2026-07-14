import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  SupplierDebtEntity,
  SupplierPaymentEntity,
} from '../../domain/entities/supplier-debt.entity';
import {
  CreateSupplierPaymentInput,
  ISupplierDebtRepository,
  SupplierDebtSearchParams,
  SupplierDebtSearchResult,
  SupplierPaymentExceedsBalanceError,
} from '../../domain/repositories/supplier-debt.repository.interface';

@Injectable()
export class PrismaSupplierDebtRepository implements ISupplierDebtRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    params: SupplierDebtSearchParams,
  ): Promise<SupplierDebtSearchResult> {
    const where: Prisma.SupplierWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      id: params.supplierId,
      ...(params.search
        ? {
            OR: [
              { code: { contains: params.search, mode: 'insensitive' } },
              {
                companyName: {
                  contains: params.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [suppliers, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: { code: 'asc' },
        skip,
        take: params.limit,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    const supplierIds = suppliers.map((s) => s.id);
    const { debtMap, paymentMap } = await this.sumDebtAndPayment(
      params.organizationId,
      supplierIds,
    );

    const items: SupplierDebtEntity[] = suppliers.map((supplier) => {
      const totalDebt = debtMap.get(supplier.id) ?? new Prisma.Decimal(0);
      const totalPaid = paymentMap.get(supplier.id) ?? new Prisma.Decimal(0);
      return {
        supplierId: supplier.id,
        supplierCode: supplier.code,
        supplierName: supplier.companyName,
        totalDebt: totalDebt.toString(),
        totalPaid: totalPaid.toString(),
        balance: totalDebt.minus(totalPaid).toString(),
      };
    });

    return { items, total, page: params.page, limit: params.limit };
  }

  async getBalance(
    organizationId: string,
    supplierId: string,
  ): Promise<string> {
    const balance = await this.computeBalance(
      this.prisma,
      organizationId,
      supplierId,
    );
    return balance.toString();
  }

  async createPayment(
    input: CreateSupplierPaymentInput,
  ): Promise<SupplierPaymentEntity> {
    return this.prisma.$transaction(async (tx) => {
      const balance = await this.computeBalance(
        tx,
        input.organizationId,
        input.supplierId,
      );

      if (new Prisma.Decimal(input.amount).greaterThan(balance)) {
        throw new SupplierPaymentExceedsBalanceError(
          input.supplierId,
          balance.toString(),
        );
      }

      const payment = await tx.payment.create({
        data: {
          organizationId: input.organizationId,
          branchId: input.branchId,
          supplierId: input.supplierId,
          purchaseOrderId: input.purchaseOrderId ?? null,
          method: input.method,
          direction: 'OUT',
          amount: input.amount,
          paidAt: input.paidAt,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
      });

      return this.toPaymentEntity(payment);
    });
  }

  /** Dùng chung cho getBalance() (đọc ngoài transaction) và createPayment() (đọc trong transaction). */
  private async computeBalance(
    client: Prisma.TransactionClient,
    organizationId: string,
    supplierId: string,
  ): Promise<Prisma.Decimal> {
    const [debtSum, paymentSum] = await Promise.all([
      client.debt.aggregate({
        where: { organizationId, supplierId, type: 'PAYABLE' },
        _sum: { amount: true },
      }),
      client.payment.aggregate({
        where: { organizationId, supplierId, direction: 'OUT' },
        _sum: { amount: true },
      }),
    ]);

    const totalDebt = debtSum._sum.amount ?? new Prisma.Decimal(0);
    const totalPaid = paymentSum._sum.amount ?? new Prisma.Decimal(0);
    return totalDebt.minus(totalPaid);
  }

  private async sumDebtAndPayment(
    organizationId: string,
    supplierIds: string[],
  ): Promise<{
    debtMap: Map<string, Prisma.Decimal>;
    paymentMap: Map<string, Prisma.Decimal>;
  }> {
    if (supplierIds.length === 0) {
      return { debtMap: new Map(), paymentMap: new Map() };
    }

    const [debtSums, paymentSums] = await Promise.all([
      this.prisma.debt.groupBy({
        by: ['supplierId'],
        where: {
          organizationId,
          supplierId: { in: supplierIds },
          type: 'PAYABLE',
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['supplierId'],
        where: {
          organizationId,
          supplierId: { in: supplierIds },
          direction: 'OUT',
        },
        _sum: { amount: true },
      }),
    ]);

    const debtMap = new Map(
      debtSums
        .filter((d): d is typeof d & { supplierId: string } => !!d.supplierId)
        .map((d) => [d.supplierId, d._sum.amount ?? new Prisma.Decimal(0)]),
    );
    const paymentMap = new Map(
      paymentSums
        .filter((p): p is typeof p & { supplierId: string } => !!p.supplierId)
        .map((p) => [p.supplierId, p._sum.amount ?? new Prisma.Decimal(0)]),
    );

    return { debtMap, paymentMap };
  }

  private toPaymentEntity(
    payment: Prisma.PaymentGetPayload<Record<string, never>>,
  ): SupplierPaymentEntity {
    return {
      id: payment.id,
      organizationId: payment.organizationId,
      branchId: payment.branchId,
      supplierId: payment.supplierId as string,
      purchaseOrderId: payment.purchaseOrderId,
      method: payment.method,
      amount: payment.amount.toString(),
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
    };
  }
}
