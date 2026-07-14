import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SessionEntity } from '../../domain/entities/session.entity';
import {
  CreateSessionInput,
  ISessionRepository,
} from '../../domain/repositories/session.repository.interface';

@Injectable()
export class PrismaSessionRepository implements ISessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateSessionInput): Promise<SessionEntity> {
    const session = await this.prisma.session.create({
      data: {
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        deviceName: input.deviceName ?? null,
        browser: input.browser,
        os: input.os,
        clientType: input.clientType,
        ip: input.ip,
        country: input.country,
        city: input.city,
        expiresAt: input.expiresAt,
      },
    });
    return this.toEntity(session);
  }

  async findByTokenHash(
    refreshTokenHash: string,
  ): Promise<SessionEntity | null> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash },
    });
    return session ? this.toEntity(session) : null;
  }

  async findById(id: string): Promise<SessionEntity | null> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    return session ? this.toEntity(session) : null;
  }

  async listActiveForUser(userId: string): Promise<SessionEntity[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastActivityAt: 'desc' },
    });
    return sessions.map((s) => this.toEntity(s));
  }

  async revokeById(id: string): Promise<void> {
    await this.prisma.session.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async touchActivity(id: string): Promise<void> {
    await this.prisma.session.update({
      where: { id },
      data: { lastActivityAt: new Date() },
    });
  }

  private toEntity(session: {
    id: string;
    userId: string;
    refreshTokenHash: string;
    deviceName: string | null;
    browser: string | null;
    os: string | null;
    clientType: string;
    ip: string | null;
    country: string | null;
    city: string | null;
    expiresAt: Date;
    revokedAt: Date | null;
    lastActivityAt: Date | null;
    createdAt: Date;
  }): SessionEntity {
    return {
      ...session,
      clientType: session.clientType as SessionEntity['clientType'],
    };
  }
}
