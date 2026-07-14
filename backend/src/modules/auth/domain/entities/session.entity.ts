export type SessionClientType = 'WEB' | 'MOBILE';

export interface SessionEntity {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceName: string | null;
  browser: string | null;
  os: string | null;
  clientType: SessionClientType;
  ip: string | null;
  country: string | null;
  city: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  lastActivityAt: Date | null;
  createdAt: Date;
}
