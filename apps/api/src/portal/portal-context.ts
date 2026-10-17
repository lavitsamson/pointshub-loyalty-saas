import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

/** The business whose portal is being used, and the signed-in customer if there is one. */
export interface PortalContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  /** Set by CustomerSessionGuard. */
  customerId?: string;
}

/** The business named by the route's :tenantSlug. */
export const Portal = createParamDecorator((_: unknown, ctx: ExecutionContext): PortalContext => {
  const portal = ctx.switchToHttp().getRequest<Request>().portal;
  // Only reachable on a route without PortalTenantGuard — a programming error.
  if (!portal) throw new InternalServerErrorException('No portal context on this route');
  return portal;
});

/** The signed-in customer's id. */
export const CurrentCustomerId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const customerId = ctx.switchToHttp().getRequest<Request>().portal?.customerId;
    if (!customerId) throw new UnauthorizedException('Not signed in');
    return customerId;
  },
);
