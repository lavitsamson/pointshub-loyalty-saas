import { SignJWT } from 'jose';
import type { Env } from '../config/env';
import { InvalidTokenError, TokenService } from './token.service';

const env = { JWT_SECRET: 's'.repeat(48), ACCESS_TOKEN_TTL_SECONDS: 900 } as Env;
const tokens = new TokenService(env);

describe('TokenService', () => {
  it('round-trips an access token', async () => {
    const token = await tokens.signAccessToken('user-1', 'merchant');
    await expect(tokens.verify('merchant', token)).resolves.toMatchObject({ subject: 'user-1' });
  });

  it('carries extra claims', async () => {
    const token = await tokens.sign('invitation', 'inv-1', { tenantId: 't-1' }, 60);
    const { claims } = await tokens.verify('invitation', token);
    expect(claims.tenantId).toBe('t-1');
  });

  it('rejects a token minted for a different purpose', async () => {
    const reset = await tokens.sign('password-reset', 'user-1', {}, 60);
    await expect(tokens.verify('merchant', reset)).rejects.toThrow(InvalidTokenError);
  });

  it('rejects a customer token on merchant routes', async () => {
    const token = await tokens.signCustomerAccessToken('customer-1', 't-1');
    await expect(tokens.verify('merchant', token)).rejects.toThrow(InvalidTokenError);
  });

  it('names the business in a customer token', async () => {
    const token = await tokens.signCustomerAccessToken('customer-1', 't-1');
    const { subject, claims } = await tokens.verify('customer', token);
    expect(subject).toBe('customer-1');
    expect(claims.tid).toBe('t-1');
  });

  it('rejects a token signed with another key', async () => {
    const other = new TokenService({ ...env, JWT_SECRET: 'o'.repeat(48) });
    const token = await other.signAccessToken('user-1', 'merchant');
    await expect(tokens.verify('merchant', token)).rejects.toThrow(InvalidTokenError);
  });

  it('rejects an expired token', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('pointshub')
      .setAudience('merchant')
      .setSubject('user-1')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(env.JWT_SECRET));
    await expect(tokens.verify('merchant', token)).rejects.toThrow(InvalidTokenError);
  });

  it('rejects garbage', async () => {
    await expect(tokens.verify('merchant', 'not.a.jwt')).rejects.toThrow(InvalidTokenError);
  });
});
