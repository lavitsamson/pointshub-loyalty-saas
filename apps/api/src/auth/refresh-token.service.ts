import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { randomToken, sha256 } from '../common/crypto';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../infra/prisma.service';

export type TokenOwner = { userId: string } | { customerId: string };

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export class RefreshTokenRejectedError extends Error {
  override readonly name = 'RefreshTokenRejectedError';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Opaque refresh tokens with rotation and reuse detection.
 *
 * Every refresh consumes the presented token and issues a successor in the same family.
 * A consumed token presented again means it was copied — by an attacker or a replaying
 * client — so the whole family is revoked and both parties must log in again.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async issue(owner: TokenOwner, familyId: string = randomUUID()): Promise<IssuedRefreshToken> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    await this.prisma.unscoped.refreshToken.create({
      data: { ...owner, tokenHash: sha256(token), familyId, expiresAt },
    });
    return { token, expiresAt };
  }

  async rotate(token: string): Promise<{ owner: TokenOwner } & IssuedRefreshToken> {
    const db = this.prisma.unscoped;
    const existing = await db.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!existing) throw new RefreshTokenRejectedError('Unknown refresh token');

    // Claim the token atomically: of two concurrent uses, exactly one wins.
    const now = new Date();
    const claimed = await db.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });

    if (claimed.count === 0) {
      if (existing.expiresAt > now) {
        this.logger.warn(`Refresh token reuse detected; revoking family ${existing.familyId}`);
        await this.revokeFamily(existing.familyId);
      }
      throw new RefreshTokenRejectedError('Refresh token is no longer valid');
    }

    const owner: TokenOwner = existing.userId
      ? { userId: existing.userId }
      : { customerId: existing.customerId! };
    return { owner, ...(await this.issue(owner, existing.familyId)) };
  }

  /** Logout: revokes the presented token's family. Unknown tokens are ignored. */
  async revoke(token: string): Promise<void> {
    const existing = await this.prisma.unscoped.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (existing) await this.revokeFamily(existing.familyId);
  }

  /** Signs a user out everywhere, e.g. after a password reset. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.unscoped.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.unscoped.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
