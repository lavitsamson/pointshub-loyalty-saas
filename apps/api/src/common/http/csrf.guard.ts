import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

const SKIP_CSRF = 'csrf:skip';

/** For endpoints called by servers rather than browsers, e.g. signed webhooks. */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defence in depth on top of SameSite=Lax cookies: state-changing requests must carry a
 * custom header. A cross-site form post cannot set one, and a cross-site fetch that does
 * triggers a CORS preflight, which only the web origin passes.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    if (!req.get('x-requested-with')) {
      throw new ForbiddenException('Missing X-Requested-With header');
    }
    return true;
  }
}
