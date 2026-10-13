import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { z } from 'zod';
import { PrismaService } from '../infra/prisma.service';
import { REQUIRED_PERMISSION } from './decorators';
import { can, type Permission } from './permissions';

const UuidSchema = z.uuid();

/**
 * Global guard for /tenants/:tenantId routes. Runs after AccessTokenGuard.
 *
 * - No membership in the tenant → 404, exactly as if the tenant did not exist, so the API
 *   never confirms that another tenant's id is real.
 * - Membership but insufficient role → 403 (the caller already knows the tenant exists).
 *
 * The membership is read on every request rather than embedded in the access token, so
 * role changes and removals take effect immediately.
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const tenantId = req.params.tenantId;
    if (tenantId === undefined) return true;

    const userId = req.principal?.userId;
    if (!userId || typeof tenantId !== 'string' || !UuidSchema.safeParse(tenantId).success) {
      throw new NotFoundException('Tenant not found');
    }

    const membership = await this.prisma.unscoped.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundException('Tenant not found');

    const required = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !can(membership.role, required)) {
      throw new ForbiddenException('Your role does not allow this action');
    }

    req.tenantContext = { tenantId, userId, role: membership.role };
    return true;
  }
}
