import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

export const IS_PUBLIC = 'auth:isPublic';

/** Opts a route out of the global access-token guard. Every other route requires a session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The authenticated merchant user's id. */
export const CurrentUserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const principal = ctx.switchToHttp().getRequest<Request>().principal;
  if (!principal) throw new UnauthorizedException();
  return principal.userId;
});

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** Client details recorded in the audit log. */
export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
});
