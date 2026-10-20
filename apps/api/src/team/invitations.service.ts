import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Invitation as InvitationRow } from '@pointshub/db';
import {
  type AcceptInvitationInput,
  canManageMember,
  type CreateInvitationInput,
  type Invitation,
  type InvitationPreview,
  type Paginated,
  type PaginationQuery,
  PasswordSchema,
} from '@pointshub/shared';
import { AuditService } from '../audit/audit.service';
import { enforceLoginLimits, INVALID_CREDENTIALS } from '../auth/auth.service';
import type { RequestMeta } from '../auth/decorators';
import { PasswordService } from '../auth/password.service';
import { InvalidTokenError, TokenService } from '../auth/token.service';
import { ProblemException } from '../common/http/problem.exception';
import { afterCursor, NEWEST_FIRST, orderBy, toPage } from '../common/pagination/cursor';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { PrismaService } from '../infra/prisma.service';
import { MailService } from '../mail/mail.service';
import type { TenantContext } from '../tenancy/tenant-context';

const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

const invitationGone = () =>
  new ProblemException({
    type: '/problems/invitation-unavailable',
    title: 'Invitation no longer valid',
    status: 410,
    detail: 'This invitation has expired, been used or been withdrawn. Ask for a new one.',
  });

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async create(
    ctx: TenantContext,
    input: CreateInvitationInput,
    meta: RequestMeta,
  ): Promise<Invitation> {
    if (!canManageMember(ctx.role, input.role)) {
      throw new ForbiddenException('Your role does not allow inviting this role');
    }

    const existingMember = await this.prisma.unscoped.membership.findFirst({
      where: { tenantId: ctx.tenantId, user: { email: input.email } },
      select: { id: true },
    });
    if (existingMember) {
      throw new ProblemException({
        type: '/problems/already-member',
        title: 'Already a member',
        status: 409,
        detail: `${input.email} is already part of this business.`,
      });
    }

    const db = this.prisma.scoped;
    const invitation = await db.$transaction(async (tx) => {
      // Re-inviting replaces any earlier pending invitation for the same address.
      await tx.invitation.updateMany({
        where: { email: input.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const created = await tx.invitation.create({
        data: {
          tenantId: ctx.tenantId,
          email: input.email,
          role: input.role,
          invitedByUserId: ctx.userId,
          expiresAt: new Date(Date.now() + INVITATION_TTL_SECONDS * 1000),
        },
      });
      await this.audit.record(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'invitation.created',
        entityType: 'Invitation',
        entityId: created.id,
        after: { email: input.email, role: input.role },
        meta,
      });
      return created;
    });

    const [tenant, inviter] = await Promise.all([
      this.prisma.unscoped.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
      this.prisma.unscoped.user.findUniqueOrThrow({ where: { id: ctx.userId } }),
    ]);
    const token = await this.tokens.sign(
      'invitation',
      invitation.id,
      { tenantId: ctx.tenantId },
      INVITATION_TTL_SECONDS,
    );
    await this.mail.sendInvitation(invitation.email, {
      tenantName: tenant.name,
      inviterName: inviter.name,
      role: invitation.role,
      token,
    });

    return toInvitation(invitation);
  }

  async listPending(query: PaginationQuery): Promise<Paginated<Invitation>> {
    const rows = await this.prisma.scoped.invitation.findMany({
      where: {
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...afterCursor(NEWEST_FIRST, query.cursor),
      },
      orderBy: orderBy(NEWEST_FIRST),
      take: query.limit + 1,
    });
    return toPage(rows, query.limit, NEWEST_FIRST, toInvitation);
  }

  async revoke(ctx: TenantContext, invitationId: string, meta: RequestMeta): Promise<void> {
    await this.prisma.scoped.$transaction(async (tx) => {
      const revoked = await tx.invitation.updateMany({
        where: { id: invitationId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count === 0) throw new NotFoundException('Invitation not found');
      await this.audit.record(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'invitation.revoked',
        entityType: 'Invitation',
        entityId: invitationId,
        meta,
      });
    });
  }

  /** Public endpoint: only someone holding the signed link can look the invitation up. */
  async preview(token: string): Promise<InvitationPreview> {
    const invitation = await this.findUsableInvitation(token);
    const [tenant, user] = await Promise.all([
      this.prisma.unscoped.tenant.findUniqueOrThrow({ where: { id: invitation.tenantId } }),
      this.prisma.unscoped.user.findUnique({
        where: { email: invitation.email },
        select: { id: true },
      }),
    ]);
    const { email, role, expiresAt } = toInvitation(invitation);
    return { tenantName: tenant.name, email, role, expiresAt, hasAccount: user !== null };
  }

  /**
   * Public endpoint: the signed token identifies the invitation. A new invitee creates an
   * account; an existing user proves who they are with their password.
   */
  async accept(
    token: string,
    input: AcceptInvitationInput,
    meta: RequestMeta,
  ): Promise<{ userId: string }> {
    const invitation = await this.findUsableInvitation(token);
    const db = this.prisma.unscoped;

    const existingUser = await db.user.findUnique({ where: { email: invitation.email } });
    const newAccount = existingUser ? undefined : await this.newAccountDetails(input);
    if (existingUser) {
      await enforceLoginLimits(this.rateLimiter, 'login', meta, existingUser.email);
      if (!(await this.passwords.verify(existingUser.passwordHash, input.password))) {
        throw new UnauthorizedException(INVALID_CREDENTIALS);
      }
    }

    return db.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) throw invitationGone();

      const userId =
        existingUser?.id ??
        (
          await tx.user.create({
            data: {
              email: invitation.email,
              ...newAccount!,
              // Receiving the invitation email proves ownership of the address.
              emailVerifiedAt: new Date(),
            },
          })
        ).id;

      const existing = await tx.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId: invitation.tenantId } },
      });
      if (existing) {
        throw new ProblemException({
          type: '/problems/already-member',
          title: 'Already a member',
          status: 409,
          detail: 'You are already part of this business.',
        });
      }

      const membership = await tx.membership.create({
        data: { userId, tenantId: invitation.tenantId, role: invitation.role },
      });
      await this.audit.record(tx, {
        tenantId: invitation.tenantId,
        actorUserId: userId,
        action: 'member.joined',
        entityType: 'Membership',
        entityId: membership.id,
        after: { userId, role: invitation.role, invitationId: invitation.id },
        meta,
      });
      return { userId };
    });
  }

  private async newAccountDetails(
    input: AcceptInvitationInput,
  ): Promise<{ name: string; passwordHash: string }> {
    const password = PasswordSchema.safeParse(input.password);
    const errors = [
      ...(input.name ? [] : [{ path: 'name', message: 'Name is required for a new account' }]),
      ...(password.success
        ? []
        : password.error.issues.map((issue) => ({ path: 'password', message: issue.message }))),
    ];
    if (!input.name || !password.success) throw ProblemException.validation(errors);
    return { name: input.name, passwordHash: await this.passwords.hash(password.data) };
  }

  private async findUsableInvitation(token: string): Promise<InvitationRow> {
    let invitationId: string;
    try {
      invitationId = (await this.tokens.verify('invitation', token)).subject;
    } catch (error) {
      if (error instanceof InvalidTokenError) throw invitationGone();
      throw error;
    }

    const invitation = await this.prisma.unscoped.invitation.findUnique({
      where: { id: invitationId },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date()
    ) {
      throw invitationGone();
    }
    return invitation;
  }
}

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    email: row.email,
    // Owners are never invited, so stored roles are always ADMIN or STAFF.
    role: row.role as Invitation['role'],
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
