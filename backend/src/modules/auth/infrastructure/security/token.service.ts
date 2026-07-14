import { createHash, createHmac, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import ms from 'ms';
import { JwtAccessPayload } from '../../../../common/types/jwt-payload.type';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  signAccessToken(payload: JwtAccessPayload): string {
    return this.jwtService.sign(payload);
  }

  generateRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
    const raw = randomBytes(64).toString('hex');
    const hash = this.hashRefreshToken(raw);
    const expiresIn = this.config.get<string>('jwt.refreshExpiresIn')!;
    const expiresAt = new Date(Date.now() + ms(expiresIn as ms.StringValue));
    return { raw, hash, expiresAt };
  }

  hashRefreshToken(raw: string): string {
    const secret = this.config.get<string>('jwt.refreshSecret')!;
    return createHmac('sha256', secret).update(raw).digest('hex');
  }

  hashOtp(otp: string): string {
    return createHash('sha256').update(otp).digest('hex');
  }
}
