import { describe, expect, it } from 'vitest';
import { buildAccessToken } from '@/test/build-access-token';
import { decodeJwt } from './decode-jwt';

describe('decodeJwt', () => {
  it('decodes a well-formed JWT payload without verifying the signature', () => {
    const token = buildAccessToken({
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
