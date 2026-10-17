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
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ForgotPasswordSchema,
  type ForgotPasswordInput,
  LoginSchema,
  type LoginInput,
  type PortalBusiness,
  type PortalMe,
  PortalRegisterSchema,
  type PortalRegisterInput,
  PortalSetPasswordSchema,
  type PortalSetPasswordInput,
} from '@pointshub/shared';
import type { Request, Response } from 'express';
import { Public, ReqMeta, type RequestMeta } from '../auth/decorators';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { ENV, type Env } from '../config/env';
import { PortalAuthService } from './portal-auth.service';
import { Portal, type PortalContext } from './portal-context';
import { clearPortalCookies, PORTAL_REFRESH_COOKIE, setPortalCookies } from './portal-cookies';
import { PortalTenantGuard } from './portal.guards';
import { PortalService } from './portal.service';

/**
 * Customer sign-in for one business's portal. Public as far as merchant sessions go; the
 * customer session is a separate audience with its own cookies.
 */
@ApiTags('portal')
@Public()
@UseGuards(PortalTenantGuard)
@Controller('portal/:tenantSlug')
export class PortalAuthController {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly portalService: PortalService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  @ApiOperation({ summary: "The business's public details, for its portal's sign-in pages" })
  business(@Portal() portal: PortalContext): Promise<PortalBusiness> {
    return this.portalService.business(portal);
  }

  @Post('auth/register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Join the programme: emails a link to choose a password, whether or not the address is already a customer',
  })
  async register(
    @Portal() portal: PortalContext,
    @Body(new ZodValidationPipe(PortalRegisterSchema)) body: PortalRegisterInput,
  ): Promise<void> {
    await this.auth.register(portal, body);
  }
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in to the portal; sets the portal session cookies' })
  async login(
    @Portal() portal: PortalContext,
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PortalMe> {
    const { customerId } = await this.auth.login(portal, body, meta);
    return this.signIn(portal, customerId, res);
  }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rotate the portal refresh token and issue a new access token' })
  async refresh(
    @Portal() portal: PortalContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    try {
      const session = await this.auth.refresh(portal, refreshCookie(req));
      setPortalCookies(res, portal.tenantSlug, session, this.env);
    } catch (error) {
      clearPortalCookies(res, portal.tenantSlug, this.env);
      throw error;
    }
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the portal session and clear its cookies' })
  async logout(
    @Portal() portal: PortalContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(refreshCookie(req));
    clearPortalCookies(res, portal.tenantSlug, this.env);
  }

  @Post('auth/forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Email a set-password link if the address is a customer' })
  async forgotPassword(
    @Portal() portal: PortalContext,
    @Body(new ZodValidationPipe(ForgotPasswordSchema)) body: ForgotPasswordInput,
  ): Promise<void> {
    await this.auth.forgotPassword(portal, body.email);
  }

  @Post('auth/set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Choose a password from an emailed link; signs the customer in' })
  async setPassword(
    @Portal() portal: PortalContext,
    @Body(new ZodValidationPipe(PortalSetPasswordSchema)) body: PortalSetPasswordInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PortalMe> {
    const { customerId } = await this.auth.setPassword(portal, body);
    return this.signIn(portal, customerId, res);
  }

  private async signIn(portal: PortalContext, customerId: string, res: Response) {
    const session = await this.auth.startSession(portal, customerId);
    setPortalCookies(res, portal.tenantSlug, session, this.env);
    return this.portalService.me(portal, customerId);
  }
}

function refreshCookie(req: Request): string | undefined {
  return (req.cookies as Record<string, string | undefined>)[PORTAL_REFRESH_COOKIE];
}
