import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ForgotPasswordSchema,
  type ForgotPasswordInput,
  LoginSchema,
  type LoginInput,
  type MeResponse,
  RegisterSchema,
  type RegisterInput,
  ResetPasswordSchema,
  type ResetPasswordInput,
} from '@pointshub/shared';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { ENV, type Env } from '../config/env';
import { AuthService } from './auth.service';
import { CurrentUserId, Public, ReqMeta, type RequestMeta } from './decorators';
import { clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from './session-cookies';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create an owner account, their business and a default programme' })
  async register(
    @Body(new ZodValidationPipe(RegisterSchema)) body: RegisterInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { userId } = await this.auth.register(body, meta);
    setSessionCookies(res, await this.auth.startSession(userId), this.env);
    return this.auth.me(userId);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in; sets the session cookies' })
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { userId } = await this.auth.login(body, meta);
    setSessionCookies(res, await this.auth.startSession(userId), this.env);
    return this.auth.me(userId);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    try {
      setSessionCookies(res, await this.auth.refresh(refreshCookie(req)), this.env);
    } catch (error) {
      clearSessionCookies(res, this.env);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the session and clear the cookies' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(refreshCookie(req));
    clearSessionCookies(res, this.env);
  }

  @Get('me')
  @ApiOperation({ summary: 'The signed-in user and the businesses they belong to' })
  me(@CurrentUserId() userId: string): Promise<MeResponse> {
    return this.auth.me(userId);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Email a password reset link if the account exists' })
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordSchema)) body: ForgotPasswordInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.auth.forgotPassword(body.email, meta);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password using the emailed token; signs out all sessions' })
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<void> {
    await this.auth.resetPassword(body);
  }
}

function refreshCookie(req: Request): string | undefined {
  return (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
}
