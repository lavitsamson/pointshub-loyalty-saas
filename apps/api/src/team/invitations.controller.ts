import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AcceptInvitationSchema,
  type AcceptInvitationInput,
  CreateInvitationSchema,
  type CreateInvitationInput,
  type Invitation,
  type InvitationPreview,
  type MeResponse,
  type Paginated,
  PaginationQuerySchema,
  type PaginationQuery,
  Permission,
} from '@pointshub/shared';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { Public, ReqMeta, type RequestMeta } from '../auth/decorators';
import { setSessionCookies } from '../auth/session-cookies';
import { ResourceIdPipe } from '../common/http/resource-id.pipe';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { ENV, type Env } from '../config/env';
import { CurrentTenant, RequirePermission } from '../tenancy/decorators';
import type { TenantContext } from '../tenancy/tenant-context';
import { InvitationsService } from './invitations.service';

@ApiTags('team')
@Controller()
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('tenants/:tenantId/invitations')
  @RequirePermission(Permission.ManageTeam)
  @ApiOperation({ summary: 'Email an invitation to join this business' })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(CreateInvitationSchema)) body: CreateInvitationInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Invitation> {
    return this.invitations.create(tenant, body, meta);
  }

  @Get('tenants/:tenantId/invitations')
  @RequirePermission(Permission.ManageTeam)
  @ApiOperation({ summary: 'Pending invitations' })
  listPending(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<Invitation>> {
    return this.invitations.listPending(query);
  }

  @Delete('tenants/:tenantId/invitations/:invitationId')
  @RequirePermission(Permission.ManageTeam)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Withdraw a pending invitation' })
  revoke(
    @CurrentTenant() tenant: TenantContext,
    @Param('invitationId', new ResourceIdPipe('Invitation')) invitationId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.invitations.revoke(tenant, invitationId, meta);
  }

  @Public()
  @Get('invitations/:token')
  @ApiOperation({ summary: 'Who the invitation is from and whether the invitee has an account' })
  preview(@Param('token') token: string): Promise<InvitationPreview> {
    return this.invitations.preview(token);
  }

  @Public()
  @Post('invitations/:token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation; creates an account if needed and signs in' })
  async accept(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(AcceptInvitationSchema)) body: AcceptInvitationInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { userId } = await this.invitations.accept(token, body, meta);
    setSessionCookies(res, await this.auth.startSession(userId), this.env);
    return this.auth.me(userId);
  }
}
