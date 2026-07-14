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
  revokeAllForUser(userId: string): Promise<void>;
  touchActivity(id: string): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
