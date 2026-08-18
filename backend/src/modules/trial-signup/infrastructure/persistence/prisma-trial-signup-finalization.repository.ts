import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CreateTrialSignupFinalizationInput,
  ITrialSignupFinalizationRepository,
  TrialSignupFinalizationConflictError,
  TrialSignupFinalizationEntity,
} from '../../domain/repositories/trial-signup-finalization.repository.interface';

type RawFinalization = Prisma.TrialSignupFinalizationGetPayload<
  Record<string, never>
>;

@Injectable()
export class PrismaTrialSignupFinalizationRepository implements ITrialSignupFinalizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByProofTokenHash(
    proofTokenHash: string,
  ): Promise<TrialSignupFinalizationEntity | null> {
    const found = await this.prisma.trialSignupFinalization.findUnique({
      where: { proofTokenHash },
    });
    return found ? this.toEntity(found) : null;
  }

  async create(
    input: CreateTrialSignupFinalizationInput,
  ): Promise<TrialSignupFinalizationEntity> {
    try {
      const created = await this.prisma.trialSignupFinalization.create({
        data: {
          proofTokenHash: input.proofTokenHash,
          normalizedEmail: input.normalizedEmail,
          requestFingerprint: input.requestFingerprint,
          status: 'PROCESSING',
          expiresAt: input.expiresAt,
        },
      });
      return this.toEntity(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new TrialSignupFinalizationConflictError(input.proofTokenHash);
      }
      throw error;
    }
  }

  async tryReclaimFailed(
    id: string,
    requestFingerprint: string,
    expiresAt: Date,
  ): Promise<TrialSignupFinalizationEntity | null> {
    const result = await this.prisma.trialSignupFinalization.updateMany({
      where: { id, status: 'FAILED' },
      data: {
        status: 'PROCESSING',
        requestFingerprint,
        completedAt: null,
        organizationId: null,
        userId: null,
        expiresAt,
      },
    });
    if (result.count === 0) return null;
    const reclaimed =
      await this.prisma.trialSignupFinalization.findUniqueOrThrow({
        where: { id },
      });
    return this.toEntity(reclaimed);
  }

  async markCompleted(
    id: string,
    organizationId: string,
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.trialSignupFinalization.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        organizationId,
        userId,
        completedAt: new Date(),
      },
    });
  }

  async markFailed(id: string): Promise<void> {
    await this.prisma.trialSignupFinalization.update({
      where: { id },
      data: { status: 'FAILED', completedAt: new Date() },
    });
  }

  private toEntity(row: RawFinalization): TrialSignupFinalizationEntity {
    return {
      id: row.id,
      proofTokenHash: row.proofTokenHash,
      normalizedEmail: row.normalizedEmail,
      requestFingerprint: row.requestFingerprint,
      status: row.status,
      organizationId: row.organizationId,
      userId: row.userId,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
    };
  }
}
