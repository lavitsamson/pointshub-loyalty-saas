import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  type LoginInput,
  PLAN_LIMIT_PROBLEM,
  type PortalRegisterInput,
  type PortalSetPasswordInput,
} from '@pointshub/shared';
import type { RequestMeta } from '../auth/decorators';
import { passwordFingerprint, PasswordService } from '../auth/password.service';
import { RefreshTokenRejectedError, RefreshTokenService } from '../auth/refresh-token.service';
import type { Session } from '../auth/session-cookies';
import { InvalidTokenError, TokenService } from '../auth/token.service';
import { INVALID_CREDENTIALS } from '../auth/auth.service';
import { ProblemException } from '../common/http/problem.exception';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { CustomersService, DUPLICATE_CUSTOMER } from '../customers/customers.service';
import { PrismaService } from '../infra/prisma.service';
import { MailService } from '../mail/mail.service';
import type { PortalContext } from './portal-context';

const LOGIN_ATTEMPTS_PER_MINUTE = 5;
/**
 * Join and reset requests email an address, so they are limited per address
 * rather than per IP: customers often sign up on the shop's shared wifi.
 */
const PASSWORD_EMAILS_PER_15_MIN = 5;
const PASSWORD_LINK_TTL_SECONDS = 60 * 60;

/**
 * Customer accounts for a business's portal. Every query runs in the business's tenant scope
 * (set from the URL's slug), so a customer record of another business is never even found.
 */
@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger(PortalAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly rateLimiter: RateLimiterService,
    private readonly mail: MailService,
    private readonly customers: CustomersService,
  ) {}

  /**
   * Answers every request the same way, so it cannot be used to discover who is a customer:
   * the address is emailed a link to choose a password. A new address becomes a customer only
   * when that link is used. An address the business already has is never signed in from here
   * either; that would hand an in-store customer's points to whoever typed their address.
   */
  async register(portal: PortalContext, input: PortalRegisterInput): Promise<void> {
    await this.limitPasswordEmails(portal, input.email);

    const existing = await this.prisma.scoped.customer.findUnique({
      where: { tenantId_email: { tenantId: portal.tenantId, email: input.email } },
    });
    if (existing) {
      await this.emailPasswordLink(portal, existing, 'claim');
    } else {
      await this.emailJoinLink(portal, input);
    }
  }
  async login(
    portal: PortalContext,
    input: LoginInput,
    meta: RequestMeta,
  ): Promise<{ customerId: string }> {
    await this.rateLimiter.enforce(
      `portal-login:${portal.tenantId}:${meta.ip ?? 'unknown'}:${input.email}`,
      LOGIN_ATTEMPTS_PER_MINUTE,
      60,
    );

    const customer = await this.prisma.scoped.customer.findUnique({
      where: { tenantId_email: { tenantId: portal.tenantId, email: input.email } },
    });
    // Customers enrolled at the counter have no password until they claim their account.
    const valid = customer?.passwordHash
      ? await this.passwords.verify(customer.passwordHash, input.password)
      : await this.passwords.verifyAgainstDummy(input.password);

    if (!customer || !valid) throw new UnauthorizedException(INVALID_CREDENTIALS);
    return { customerId: customer.id };
  }

  async startSession(portal: PortalContext, customerId: string): Promise<Session> {
    const [accessToken, refresh] = await Promise.all([
      this.tokens.signCustomerAccessToken(customerId, portal.tenantId),
      this.refreshTokens.issue({ customerId }),
    ]);
    return { accessToken, refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt };
  }

  async refresh(portal: PortalContext, refreshToken: string | undefined): Promise<Session> {
    if (!refreshToken) throw new UnauthorizedException('Not signed in');
    try {
      const rotated = await this.refreshTokens.rotate(refreshToken);
      const customerId = 'customerId' in rotated.owner ? rotated.owner.customerId : null;
      const belongsHere =
        customerId !== null &&
        (await this.prisma.scoped.customer.count({ where: { id: customerId } })) === 1;
      if (!customerId || !belongsHere) {
        throw new RefreshTokenRejectedError('Not a customer of this business');
      }
      return {
        accessToken: await this.tokens.signCustomerAccessToken(customerId, portal.tenantId),
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

  /** Always succeeds for the caller, so it cannot be used to discover who is a customer. */
  async forgotPassword(portal: PortalContext, email: string): Promise<void> {
    await this.limitPasswordEmails(portal, email);
    const customer = await this.prisma.scoped.customer.findUnique({
      where: { tenantId_email: { tenantId: portal.tenantId, email } },
    });
    if (customer) await this.emailPasswordLink(portal, customer, 'reset');
  }

  /**
   * Completes an emailed link and signs the customer in: following the link proves they own
   * the address. Links name the business, so they only work in its portal, and work once:
   * - a join link creates the customer, so it fails once the address is a customer;
   * - a password link carries a fingerprint of the password it was issued against, so it
   *   fails once the password changes.
   */
  async setPassword(
    portal: PortalContext,
    input: PortalSetPasswordInput,
  ): Promise<{ customerId: string }> {
    let subject: string;
    let claims: Record<string, unknown>;
    try {
      ({ subject, claims } = await this.tokens.verify('customer-password', input.token));
    } catch (error) {
      if (error instanceof InvalidTokenError) throw invalidLink();
      throw error;
    }
    if (claims.tid !== portal.tenantId) throw invalidLink();

    const passwordHash = await this.passwords.hash(input.password);
    return claims.act === 'join'
      ? this.completeJoin(portal, subject, claims, passwordHash)
      : this.completePasswordChange(subject, claims, passwordHash);
  }

  private async completeJoin(
    portal: PortalContext,
    email: string,
    claims: Record<string, unknown>,
    passwordHash: string,
  ): Promise<{ customerId: string }> {
    if (typeof claims.name !== 'string') throw invalidLink();
    try {
      const customer = await this.customers.create(
        portal,
        { name: claims.name, email, tags: [] },
        passwordHash,
      );
      return { customerId: customer.id };
    } catch (error) {
      // The address became a customer since the link was sent: used twice, or enrolled in store.
      if (error instanceof ProblemException && error.problem.type === DUPLICATE_CUSTOMER) {
        throw invalidLink();
      }
      // The business's plan is full. The link stays valid, so it works once there is room.
      if (error instanceof ProblemException && error.problem.type === PLAN_LIMIT_PROBLEM) {
        throw new ProblemException({
          ...error.problem,
          title: 'Not taking new members online',
          detail:
            'This rewards programme is not taking new members online right now. Please ask in store.',
        });
      }
      throw error;
    }
  }

  private async completePasswordChange(
    customerId: string,
    claims: Record<string, unknown>,
    passwordHash: string,
  ): Promise<{ customerId: string }> {
    const customer = await this.prisma.scoped.customer.findUnique({ where: { id: customerId } });
    if (!customer || passwordFingerprint(customer.passwordHash) !== claims.pwd) {
      throw invalidLink();
    }

    // Conditional on the old hash, so two uses of one link cannot both win.
    const updated = await this.prisma.scoped.customer.updateMany({
      where: { id: customer.id, passwordHash: customer.passwordHash },
      data: { passwordHash },
    });
    if (updated.count === 0) throw invalidLink();

    await this.refreshTokens.revokeAll({ customerId: customer.id });
    return { customerId: customer.id };
  }
  private limitPasswordEmails(portal: PortalContext, email: string): Promise<void> {
    return this.rateLimiter.enforce(
      `portal-password-email:${portal.tenantId}:${email}`,
      PASSWORD_EMAILS_PER_15_MIN,
      15 * 60,
    );
  }

  /** For an address the business already has: sets that customer's password. */
  private async emailPasswordLink(
    portal: PortalContext,
    customer: { id: string; email: string; passwordHash: string | null },
    reason: 'claim' | 'reset',
  ): Promise<void> {
    const token = await this.tokens.sign(
      'customer-password',
      customer.id,
      { tid: portal.tenantId, act: 'set', pwd: passwordFingerprint(customer.passwordHash) },
      PASSWORD_LINK_TTL_SECONDS,
    );
    await this.sendLink(portal, customer.email, token, reason);
  }

  /** For a new address: the customer is created when the link is used, not before. */
  private async emailJoinLink(portal: PortalContext, input: PortalRegisterInput): Promise<void> {
    const token = await this.tokens.sign(
      'customer-password',
      input.email,
      { tid: portal.tenantId, act: 'join', name: input.name },
      PASSWORD_LINK_TTL_SECONDS,
    );
    await this.sendLink(portal, input.email, token, 'join');
  }

  private async sendLink(
    portal: PortalContext,
    to: string,
    token: string,
    reason: 'join' | 'claim' | 'reset',
  ): Promise<void> {
    try {
      await this.mail.sendPortalPasswordLink(to, {
        businessName: portal.tenantName,
        slug: portal.tenantSlug,
        token,
        reason,
      });
    } catch (error) {
      // Not surfaced to the caller; that would reveal whether the address is a customer.
      this.logger.error(`Portal password email failed: ${(error as Error).message}`);
    }
  }
}

function invalidLink(): ProblemException {
  return new ProblemException({
    type: '/problems/invalid-password-link',
    title: 'Invalid or expired link',
    status: 400,
    detail: 'Request a new link from the sign-in page.',
  });
}
