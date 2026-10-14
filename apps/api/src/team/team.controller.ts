import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Member,
  type Paginated,
  PaginationQuerySchema,
  type PaginationQuery,
  Permission,
  UpdateMemberSchema,
  type UpdateMemberInput,
} from '@pointshub/shared';
import { ReqMeta, type RequestMeta } from '../auth/decorators';
import { ResourceIdPipe } from '../common/http/resource-id.pipe';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { CurrentTenant, RequirePermission } from '../tenancy/decorators';
import type { TenantContext } from '../tenancy/tenant-context';
import { TeamService } from './team.service';

@ApiTags('team')
@Controller('tenants/:tenantId/members')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  @ApiOperation({ summary: 'People with access to this business' })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<Member>> {
    return this.team.list(tenant, query);
  }

  @Patch(':userId')
  @RequirePermission(Permission.ManageTeam)
  @ApiOperation({ summary: "Change a member's role" })
  changeRole(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId', new ResourceIdPipe('Member')) userId: string,
    @Body(new ZodValidationPipe(UpdateMemberSchema)) body: UpdateMemberInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Member> {
    return this.team.changeRole(tenant, userId, body.role, meta);
  }

  /** No permission decorator: any member may leave; removing others is checked in the service. */
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member, or leave the business yourself' })
  remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId', new ResourceIdPipe('Member')) userId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.team.remove(tenant, userId, meta);
  }
}
