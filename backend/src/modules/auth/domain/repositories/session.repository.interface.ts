import { Prisma } from '@prisma/client';
import { SessionEntity } from '../entities/session.entity';
import { DeviceContext } from '../value-objects/device-context';

export interface CreateSessionInput extends DeviceContext {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
}

export interface ISessionRepository {
  create(input: CreateSessionInput): Promise<SessionEntity>;
  findByTokenHash(refreshTokenHash: string): Promise<SessionEntity | null>;
  findById(id: string): Promise<SessionEntity | null>;
  listActiveForUser(userId: string): Promise<SessionEntity[]>;
  revokeById(id: string): Promise<void>;
  /** T053.06B-2 (D5) — `tx?` optional, xem chú thích ở `IAuthUserRepository.updatePasswordHash()`. */
  revokeAllForUser(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
  touchActivity(id: string): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
