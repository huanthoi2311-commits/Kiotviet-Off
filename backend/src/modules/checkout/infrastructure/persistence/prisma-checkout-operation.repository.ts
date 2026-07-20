import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CheckoutOperationEntity } from '../../domain/entities/checkout-operation.entity';
import { CheckoutOperationConflictError } from '../../domain/errors/checkout-operation.errors';
import {
  CreateCheckoutOperationInput,
  ICheckoutOperationRepository,
} from '../../domain/repositories/checkout-operation.repository.interface';

type RawCheckoutOperation = Prisma.CheckoutOperationGetPayload<
  Record<string, never>
>;

const RETENTION_MS = 48 * 60 * 60 * 1000; // 48h — SPEC §3.3 Retention Policy

@Injectable()
export class PrismaCheckoutOperationRepository implements ICheckoutOperationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<CheckoutOperationEntity | null> {
    const found = await this.prisma.checkoutOperation.findUnique({
      where: {
        organizationId_idempotencyKey: { organizationId, idempotencyKey },
      },
    });
    return found ? this.toEntity(found) : null;
  }

  async create(
    input: CreateCheckoutOperationInput,
  ): Promise<CheckoutOperationEntity> {
    try {
      const created = await this.prisma.checkoutOperation.create({
        data: {
          organizationId: input.organizationId,
          branchId: input.branchId,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          status: 'PROCESSING',
          createdBy: input.createdBy,
          expiresAt: new Date(Date.now() + RETENTION_MS),
        },
      });
      return this.toEntity(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new CheckoutOperationConflictError(input.idempotencyKey);
      }
      throw error;
    }
  }

  async tryReclaim(
    id: string,
    requestHash: string,
    stuckThresholdMs: number,
    expiresAt: Date,
  ): Promise<CheckoutOperationEntity | null> {
    const stuckBefore = new Date(Date.now() - stuckThresholdMs);
    const result = await this.prisma.checkoutOperation.updateMany({
      where: {
        id,
        OR: [
          { status: 'FAILED' },
          { status: 'PROCESSING', createdAt: { lt: stuckBefore } },
        ],
      },
      data: {
        status: 'PROCESSING',
        requestHash,
        createdAt: new Date(),
        completedAt: null,
        invoiceId: null,
        paymentId: null,
        expiresAt,
      },
    });
    if (result.count === 0) return null;
    const reclaimed = await this.prisma.checkoutOperation.findUniqueOrThrow({
      where: { id },
    });
    return this.toEntity(reclaimed);
  }

  async markCompleted(
    id: string,
    invoiceId: string,
    paymentId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.checkoutOperation.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        invoiceId,
        paymentId,
        completedAt: new Date(),
      },
    });
  }

  async markFailed(id: string): Promise<void> {
    await this.prisma.checkoutOperation.update({
      where: { id },
      data: { status: 'FAILED', completedAt: new Date() },
    });
  }

  async findStuckProcessing(
    olderThanMs: number,
  ): Promise<CheckoutOperationEntity[]> {
    const threshold = new Date(Date.now() - olderThanMs);
    const rows = await this.prisma.checkoutOperation.findMany({
      where: { status: 'PROCESSING', createdAt: { lt: threshold } },
    });
    return rows.map((row) => this.toEntity(row));
  }

  async deleteExpired(): Promise<number> {
    const result = await this.prisma.checkoutOperation.deleteMany({
      where: {
        status: { in: ['COMPLETED', 'FAILED'] },
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  }

  private toEntity(row: RawCheckoutOperation): CheckoutOperationEntity {
    return {
      id: row.id,
      organizationId: row.organizationId,
      branchId: row.branchId,
      idempotencyKey: row.idempotencyKey,
      requestHash: row.requestHash,
      status: row.status,
      invoiceId: row.invoiceId,
      paymentId: row.paymentId,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
    };
  }
}
