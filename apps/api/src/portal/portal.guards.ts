import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { InvalidTokenError, TokenService } from '../auth/token.service';
import { PrismaService } from '../infra/prisma.service';
import { PORTAL_ACCESS_COOKIE } from './portal-cookies';

const SLUG = /^[a-z0-9-]{1,64}$/;

/**
 * Resolves /portal/:tenantSlug to its business. Slugs are public (they are in the portal's
 * URL), so an unknown one is simply 404. Every portal query then runs in that tenant's scope.
 */
@Injectable()
export class PortalTenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const slug = req.params.tenantSlug;
    const tenant =
      typeof slug === 'string' && SLUG.test(slug)
        ? await this.prisma.unscoped.tenant.findUnique({
            where: { slug },
            select: { id: true, name: true, slug: true },
          })
        : null;
    if (!tenant) throw new NotFoundException('Business not found');

    req.portal = { tenantId: tenant.id, tenantSlug: tenant.slug, tenantName: tenant.name };
    return true;
  }
}

/**
 * Requires a customer session for the business in the URL. Runs after PortalTenantGuard.
 *
 * The access token's `tid` claim must name this business: a customer of one business is a
 * stranger to every other, even though their token is validly signed.
 */
@Injectable()
export class CustomerSessionGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const portal = req.portal;
    const token = (req.cookies as Record<string, string | undefined>)[PORTAL_ACCESS_COOKIE];
    if (!portal || !token) throw new UnauthorizedException('Not signed in');

    try {
      const { subject, claims } = await this.tokens.verify('customer', token);
      if (claims.tid !== portal.tenantId) throw new UnauthorizedException('Not signed in');
      portal.customerId = subject;
      return true;
    } catch (error) {
      if (error instanceof InvalidTokenError) throw new UnauthorizedException('Session expired');
      throw error;
    }
  }
}
