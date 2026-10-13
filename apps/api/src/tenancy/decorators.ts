import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Permission } from './permissions';
import type { TenantContext } from './tenant-context';

export const REQUIRED_PERMISSION = 'tenancy:requiredPermission';

/** Restricts a /tenants/:tenantId route to members whose role grants the permission. */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION, permission);

/** The caller's membership in the tenant named by the route. */
export const CurrentTenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantContext => {
    const tenant = ctx.switchToHttp().getRequest<Request>().tenantContext;
    // Only reachable if used on a route without :tenantId — a programming error.
    if (!tenant) throw new InternalServerErrorException('No tenant context on this route');
    return tenant;
  },
);
