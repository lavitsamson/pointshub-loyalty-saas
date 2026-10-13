import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from './decorators';
import { ACCESS_COOKIE } from './session-cookies';
import { InvalidTokenError, TokenService } from './token.service';

/** Global guard: every route needs a valid merchant access token unless marked @Public(). */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = (req.cookies as Record<string, string | undefined>)[ACCESS_COOKIE];
    if (!token) throw new UnauthorizedException('Not signed in');

    try {
      const { subject } = await this.tokens.verify('merchant', token);
      req.principal = { userId: subject };
      return true;
    } catch (error) {
      if (error instanceof InvalidTokenError) throw new UnauthorizedException('Session expired');
      throw error;
    }
  }
}
