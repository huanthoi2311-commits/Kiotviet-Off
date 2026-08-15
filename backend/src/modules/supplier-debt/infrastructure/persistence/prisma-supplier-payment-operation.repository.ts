import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SupplierPaymentOperationEntity } from '../../domain/entities/supplier-payment-operation.entity';
import { SupplierPaymentOperationConflictError } from '../../domain/errors/supplier-payment-operation.errors';
import {
  CreateSupplierPaymentOperationInput,
  ISupplierPaymentOperationRepository,
} from '../../domain/repositories/supplier-payment-operation.repository.interface';

type RawSupplierPaymentOperation = Prisma.SupplierPaymentOperationGetPayload<
  Record<string, never>
>;

@Injectable()
export class PrismaSupplierPaymentOperationRepository implements ISupplierPaymentOperationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<SupplierPaymentOperationEntity | null> {
    const found = await this.prisma.supplierPaymentOperation.findUnique({
      where: {
        organizationId_idempotencyKey: { organizationId, idempotencyKey },
      },
    });
    return found ? this.toEntity(found) : null;
  }

  async create(
    input: CreateSupplierPaymentOperationInput,
  ): Promise<SupplierPaymentOperationEntity> {
    try {
      const created = await this.prisma.supplierPaymentOperation.create({
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
        throw new SupplierPaymentOperationConflictError(input.idempotencyKey);
      }
      throw error;
    }
  }

  async tryReclaim(
    id: string,
    requestFingerprint: string,
    stuckThresholdMs: number,
  ): Promise<SupplierPaymentOperationEntity | null> {
    const stuckBefore = new Date(Date.now() - stuckThresholdMs);
    // requestFingerprint KHÔNG xuất hiện trong `data` — cột bất biến sau khi tạo (T052.05A.1
    // §9). Có mặt trong `where` chỉ như lớp phòng thủ DB-level thứ hai (xem docstring interface).
    const result = await this.prisma.supplierPaymentOperation.updateMany({
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
        paymentId: null,
      },
    });
    if (result.count === 0) return null;
    const reclaimed =
      await this.prisma.supplierPaymentOperation.findUniqueOrThrow({
        where: { id },
      });
    return this.toEntity(reclaimed);
  }

  async markCompleted(
    id: string,
    paymentId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.supplierPaymentOperation.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        paymentId,
        completedAt: new Date(),
      },
    });
  }

  async markFailed(id: string): Promise<void> {
    await this.prisma.supplierPaymentOperation.update({
      where: { id },
      data: { status: 'FAILED', completedAt: new Date() },
    });
  }

  private toEntity(
    row: RawSupplierPaymentOperation,
  ): SupplierPaymentOperationEntity {
    return {
      id: row.id,
      organizationId: row.organizationId,
      idempotencyKey: row.idempotencyKey,
      requestFingerprint: row.requestFingerprint,
      status: row.status,
      paymentId: row.paymentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
    };
  }
}
