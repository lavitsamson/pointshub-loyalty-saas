import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type {
  CompleteRegistrationInput,
  LoginInput,
  MeResponse,
  RegisterInput,
  ResetPasswordInput,
} from '@pointshub/shared';
import { randomBytes } from 'node:crypto';
import { ProblemException } from '../common/http/problem.exception';
import { isUniqueViolation } from '../common/prisma-errors';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../infra/prisma.service';
import { MailService } from '../mail/mail.service';
import type { RequestMeta } from './decorators';
import { passwordFingerprint, PasswordService } from './password.service';
import { RefreshTokenRejectedError, RefreshTokenService } from './refresh-token.service';
import type { Session } from './session-cookies';
import { InvalidTokenError, TokenService } from './token.service';

const FORGOT_PASSWORD_REQUESTS_PER_15_MIN = 5;
const PASSWORD_RESET_TTL_SECONDS = 30 * 60;
const SIGNUPS_PER_IP_PER_HOUR = 20;
const SIGNUP_EMAILS_PER_15_MIN = 5;
const SIGNUP_LINK_TTL_SECONDS = 60 * 60;

const LOGIN_ATTEMPTS_PER_MINUTE = 5;
/** Across all emails: stops one client trying a common password against many accounts. */
const LOGIN_ATTEMPTS_PER_IP_PER_MINUTE = 30;

/**
 * Login throttling, shared by the merchant and portal sign-in: 5 a minute per IP and email
 * (guessing one account's password), and 30 a minute per IP whatever the email (spraying).
 */
export async function enforceLoginLimits(
  rateLimiter: RateLimiterService,
  scope: string,
  meta: RequestMeta,
  email: string,
): Promise<void> {
  const ip = meta.ip ?? 'unknown';
  await rateLimiter.enforce(`${scope}-ip:${ip}`, LOGIN_ATTEMPTS_PER_IP_PER_MINUTE, 60);
  await rateLimiter.enforce(`${scope}:${ip}:${email}`, LOGIN_ATTEMPTS_PER_MINUTE, 60);
}

const invalidSignupLink = () =>
  new ProblemException({
    type: '/problems/invalid-signup-link',
    title: 'Invalid or expired link',
    status: 400,
    detail: 'Sign up again to get a new link, or sign in if you already finished.',
  });

/** Tiers every new programme starts with; merchants can edit them afterwards. */
const DEFAULT_TIERS = [
  { name: 'Bronze', minLifetimePoints: 0, multiplier: '1.00', sortOrder: 1 },
  { name: 'Silver', minLifetimePoints: 500, multiplier: '1.25', sortOrder: 2 },
  { name: 'Gold', minLifetimePoints: 1500, multiplier: '1.50', sortOrder: 3 },
];

export const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly rateLimiter: RateLimiterService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Answers every request the same way, so sign-up cannot be used to discover who has an
   * account: the address is emailed either a link to finish signing up or, if it already has
   * an account, a reminder to sign in. Nothing is created until the link is followed.
   */
  async register(input: RegisterInput, meta: RequestMeta): Promise<void> {
    // Per IP so one client cannot email arbitrary addresses; per address so no one is flooded.
    await this.rateLimiter.enforce(
      `signup-ip:${meta.ip ?? 'unknown'}`,
      SIGNUPS_PER_IP_PER_HOUR,
      60 * 60,
    );
    await this.rateLimiter.enforce(
      `signup-email:${input.email}`,
      SIGNUP_EMAILS_PER_15_MIN,
      15 * 60,
    );

    const taken = await this.emailTaken(input.email);
    try {
      if (taken) {
        await this.mail.sendSignupExistingAccount(input.email);
      } else {
        const token = await this.tokens.sign(
          'signup',
          input.email,
          { name: input.name, biz: input.businessName, cur: input.currency },
          SIGNUP_LINK_TTL_SECONDS,
        );
        await this.mail.sendSignupLink(input.email, { businessName: input.businessName, token });
      }
    } catch (error) {
      // Not surfaced to the caller; that would reveal whether the address has an account.
      this.logger.error(`Sign-up email failed: ${(error as Error).message}`);
    }
  }

  /**
   * Follows the emailed link: creates the owner, their business (tenant) and a default
   * programme in one transaction. Following the link proves the address, and the link works
   * once, because the address has an account from then on.
   */
  async completeRegistration(
    input: CompleteRegistrationInput,
    meta: RequestMeta,
  ): Promise<{ userId: string }> {
    let details: { email: string; name: string; businessName: string; currency: string };
    try {
      const { subject, claims } = await this.tokens.verify('signup', input.token);
      const { name, biz, cur } = claims;
      if (typeof name !== 'string' || typeof biz !== 'string' || typeof cur !== 'string') {
        throw invalidSignupLink();
      }
      details = { email: subject, name, businessName: biz, currency: cur };
    } catch (error) {
      if (error instanceof InvalidTokenError) throw invalidSignupLink();
      throw error;
    }

    if (await this.emailTaken(details.email)) throw invalidSignupLink();
    const passwordHash = await this.passwords.hash(input.password);
    const slug = await this.availableSlug(details.businessName);

    try {
      return await this.createOwnerAndBusiness(details, passwordHash, slug, meta);
    } catch (error) {
      // The same link used twice at once: the unique email lets only one through.
      if (isUniqueViolation(error) && (await this.emailTaken(details.email))) {
        throw invalidSignupLink();
      }
      throw error;
    }
  }

  private async emailTaken(email: string): Promise<boolean> {
    const user = await this.prisma.unscoped.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return user !== null;
  }

  private async createOwnerAndBusiness(
    input: { email: string; name: string; businessName: string; currency: string },
    passwordHash: string,
    slug: string,
    meta: RequestMeta,
  ): Promise<{ userId: string }> {
    const user = await this.prisma.unscoped.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          emailVerifiedAt: new Date(),
        },
      });
      const tenant = await tx.tenant.create({ data: { name: input.businessName, slug } });
      await tx.membership.create({
        data: { userId: user.id, tenantId: tenant.id, role: 'OWNER' },
      });
      await tx.loyaltyProgram.create({
        data: { tenantId: tenant.id, pointsPerCurrencyUnit: '1', currency: input.currency },
      });
      await tx.tier.createMany({
        data: DEFAULT_TIERS.map((tier) => ({ ...tier, tenantId: tenant.id })),
      });
      await this.audit.record(tx, {
        tenantId: tenant.id,
        actorUserId: user.id,
        action: 'tenant.created',
        entityType: 'Tenant',
        entityId: tenant.id,
        after: { name: tenant.name, slug: tenant.slug },
        meta,
      });
      return user;
    });

    return { userId: user.id };
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<{ userId: string }> {
    await enforceLoginLimits(this.rateLimiter, 'login', meta, input.email);

    const user = await this.prisma.unscoped.user.findUnique({ where: { email: input.email } });
    const valid = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyAgainstDummy(input.password);

    if (!user || !valid) throw new UnauthorizedException(INVALID_CREDENTIALS);
    return { userId: user.id };
  }

  async startSession(userId: string): Promise<Session> {
    const [accessToken, refresh] = await Promise.all([
      this.tokens.signAccessToken(userId, 'merchant'),
      this.refreshTokens.issue({ userId }),
    ]);
    return { accessToken, refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt };
  }

  async refresh(refreshToken: string | undefined): Promise<Session> {
    if (!refreshToken) throw new UnauthorizedException('Not signed in');
    try {
      const rotated = await this.refreshTokens.rotate(refreshToken);
      if (!('userId' in rotated.owner)) throw new RefreshTokenRejectedError('Not a merchant token');
      return {
        accessToken: await this.tokens.signAccessToken(rotated.owner.userId, 'merchant'),
        refreshToken: rotated.token,
        refreshExpiresAt: rotated.expiresAt,
      };
    } catch (error) {
      if (error instanceof RefreshTokenRejectedError) {
        throw new UnauthorizedException('Session expired, please sign in again');
      }
      throw error;
    }
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.refreshTokens.revoke(refreshToken);
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.unscoped.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        memberships: {
          select: { role: true, tenant: { select: { id: true, name: true, slug: true } } },
          orderBy: { tenant: { name: 'asc' } },
        },
      },
    });
    if (!user) throw new UnauthorizedException('Not signed in');

    return {
      user: { id: user.id, email: user.email, name: user.name },
      memberships: user.memberships.map((m) => ({
        tenantId: m.tenant.id,
        tenantName: m.tenant.name,
        tenantSlug: m.tenant.slug,
        role: m.role,
      })),
    };
  }

  /**
   * Always succeeds from the caller's point of view, so the endpoint cannot be used to
   * discover which emails have accounts.
   */
  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    await this.rateLimiter.enforce(
      `forgot-password:${meta.ip ?? 'unknown'}`,
      FORGOT_PASSWORD_REQUESTS_PER_15_MIN,
      15 * 60,
    );
    await this.rateLimiter.enforce(
      `forgot-password-email:${email}`,
      FORGOT_PASSWORD_REQUESTS_PER_15_MIN,
      15 * 60,
    );

    const user = await this.prisma.unscoped.user.findUnique({ where: { email } });
    if (!user) return;

    const token = await this.tokens.sign(
      'password-reset',
      user.id,
      { pwd: passwordFingerprint(user.passwordHash) },
      PASSWORD_RESET_TTL_SECONDS,
    );
    try {
      await this.mail.sendPasswordReset(user.email, token);
    } catch (error) {
      // Do not surface delivery problems to the caller; that would reveal the account exists.
      this.logger.error(`Password reset email failed: ${(error as Error).message}`);
    }
  }

  /**
   * The reset token embeds a fingerprint of the password hash it was issued against, so it
   * stops working as soon as the password changes: single-use without storing the token.
   */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const invalid = () =>
      new ProblemException({
        type: '/problems/invalid-reset-token',
        title: 'Invalid or expired link',
        status: 400,
        detail: 'Request a new password reset email.',
      });

    let userId: string;
    let fingerprint: unknown;
    try {
      const { subject, claims } = await this.tokens.verify('password-reset', input.token);
      userId = subject;
      fingerprint = claims.pwd;
    } catch (error) {
      if (error instanceof InvalidTokenError) throw invalid();
      throw error;
    }

    const user = await this.prisma.unscoped.user.findUnique({ where: { id: userId } });
    if (!user || passwordFingerprint(user.passwordHash) !== fingerprint) throw invalid();

    await this.prisma.unscoped.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.passwords.hash(input.password) },
    });
    await this.refreshTokens.revokeAll({ userId: user.id });
  }

  private async availableSlug(businessName: string): Promise<string> {
    const base = slugify(businessName);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;
      const taken = await this.prisma.unscoped.tenant.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    return `${base}-${randomBytes(4).toString('hex')}`;
  }
}

export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return slug || 'business';
}
