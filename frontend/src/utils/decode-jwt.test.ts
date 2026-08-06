import { describe, expect, it } from 'vitest';
import { decodeJwt } from './decode-jwt';

function base64UrlEncode(value: unknown): string {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildJwt(payload: Record<string, unknown>): string {
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlEncode(payload);
  return `${header}.${body}.signature-not-verified`;
}

describe('decodeJwt', () => {
  it('decodes a well-formed JWT payload without verifying the signature', () => {
    const token = buildJwt({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['product:read'],
    });

    const claims = decodeJwt(token);

    expect(claims).toMatchObject({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['product:read'],
    });
  });

  it('returns null for a token with the wrong number of segments', () => {
    expect(decodeJwt('not-a-jwt')).toBeNull();
  });

  it('returns null for a token whose payload segment is not valid JSON', () => {
    expect(decodeJwt('aGVhZGVy.bm90LWpzb24.sig')).toBeNull();
  });
});
