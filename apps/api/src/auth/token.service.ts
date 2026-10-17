import { Inject, Injectable } from '@nestjs/common';
import { errors, jwtVerify, SignJWT } from 'jose';
import { ENV, type Env } from '../config/env';

const ISSUER = 'pointshub';
const ALGORITHM = 'HS256';

/**
 * Every signed token names its purpose in the `aud` claim, so a token minted for one use
 * (e.g. a password reset) is rejected everywhere else (e.g. as an access token).
 */
export type TokenAudience =
  'merchant' | 'customer' | 'password-reset' | 'invitation' | 'customer-password';

export class InvalidTokenError extends Error {
  override readonly name = 'InvalidTokenError';
}

@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.key = new TextEncoder().encode(env.JWT_SECRET);
  }

  signAccessToken(subject: string, audience: 'merchant'): Promise<string> {
    return this.sign(audience, subject, {}, this.env.ACCESS_TOKEN_TTL_SECONDS);
  }

  /** Customers belong to one business; the token names it so no other portal accepts it. */
  signCustomerAccessToken(customerId: string, tenantId: string): Promise<string> {
    return this.sign('customer', customerId, { tid: tenantId }, this.env.ACCESS_TOKEN_TTL_SECONDS);
  }

  sign(
    audience: TokenAudience,
    subject: string,
    claims: Record<string, string>,
    ttlSeconds: number,
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: ALGORITHM })
      .setIssuer(ISSUER)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.key);
  }

  /** Returns the subject and string claims, or throws InvalidTokenError. */
  async verify(
    audience: TokenAudience,
    token: string,
  ): Promise<{ subject: string; claims: Record<string, unknown> }> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience,
        algorithms: [ALGORITHM],
      });
      if (!payload.sub) throw new InvalidTokenError('Token has no subject');
      return { subject: payload.sub, claims: payload };
    } catch (error) {
      if (error instanceof InvalidTokenError) throw error;
      if (error instanceof errors.JOSEError) throw new InvalidTokenError(error.code);
      throw error;
    }
  }
}
