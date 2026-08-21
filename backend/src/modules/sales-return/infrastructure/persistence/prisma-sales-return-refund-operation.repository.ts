import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SalesReturnRefundOperationEntity } from '../../domain/entities/sales-return-refund-operation.entity';
import { SalesReturnRefundOperationConflictError } from '../../domain/errors/sales-return-refund-operation.errors';
import {
  CreateSalesReturnRefundOperationInput,
  ISalesReturnRefundOperationRepository,
} from '../../domain/repositories/sales-return-refund-operation.repository.interface';

type RawSalesReturnRefundOperation =
  Prisma.SalesReturnRefundOperationGetPayload<Record<string, never>>;

@Injectable()
export class PrismaSalesReturnRefundOperationRepository implements ISalesReturnRefundOperationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<SalesReturnRefundOperationEntity | null> {
    const found = await this.prisma.salesReturnRefundOperation.findUnique({
      where: {
        organizationId_idempotencyKey: { organizationId, idempotencyKey },
      },
    });
    return found ? this.toEntity(found) : null;
  }

  async create(
    input: CreateSalesReturnRefundOperationInput,
  ): Promise<SalesReturnRefundOperationEntity> {
    try {
      const created = await this.prisma.salesReturnRefundOperation.create({
        data: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: input.requestFingerprint,
          status: 'PROCESSING',
        },
      });
      return this.toEntity(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new SalesReturnRefundOperationConflictError(input.idempotencyKey);
      }
      throw error;
    }
  }

  async tryReclaim(
    id: string,
    requestFingerprint: string,
    stuckThresholdMs: number,
  ): Promise<SalesReturnRefundOperationEntity | null> {
    const stuckBefore = new Date(Date.now() - stuckThresholdMs);
    // requestFingerprint KHÔNG xuất hiện trong `data` — cột bất biến sau khi tạo. Có mặt trong
    // `where` chỉ như lớp phòng thủ DB-level thứ hai (xem docstring interface).
    const result = await this.prisma.salesReturnRefundOperation.updateMany({
      where: {
        id,
        requestFingerprint,
        OR: [
          { status: 'FAILED' },
          { status: 'PROCESSING', createdAt: { lt: stuckBefore } },
        ],
      },
      data: {
        status: 'PROCESSING',
        createdAt: new Date(),
        completedAt: null,
        refundId: null,
      },
    });
    if (result.count === 0) return null;
    const reclaimed =
      await this.prisma.salesReturnRefundOperation.findUniqueOrThrow({
        where: { id },
      });
    return this.toEntity(reclaimed);
  }

  async markCompleted(
    id: string,
    refundId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.salesReturnRefundOperation.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        refundId,
        completedAt: new Date(),
      },
    });
  }

  async markFailed(id: string): Promise<void> {
    await this.prisma.salesReturnRefundOperation.update({
      where: { id },
      data: { status: 'FAILED', completedAt: new Date() },
    });
  }

  private toEntity(
    row: RawSalesReturnRefundOperation,
  ): SalesReturnRefundOperationEntity {
    return {
      id: row.id,
      organizationId: row.organizationId,
      idempotencyKey: row.idempotencyKey,
      requestFingerprint: row.requestFingerprint,
      status: row.status,
      refundId: row.refundId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
    };
  }
}
