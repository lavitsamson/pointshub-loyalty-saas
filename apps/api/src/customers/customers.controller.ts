import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  BulkActionSchema,
  type BulkActionInput,
  type BulkActionResult,
  CreateCustomerSchema,
  type CreateCustomerInput,
  type Customer,
  CustomerFilterSchema,
  type CustomerFilter,
  CustomerListQuerySchema,
  type CustomerListQuery,
  type LedgerEntry,
  type Paginated,
  PaginationQuerySchema,
  type PaginationQuery,
  Permission,
  UpdateCustomerSchema,
  type UpdateCustomerInput,
} from '@pointshub/shared';
import type { Response } from 'express';
import { ReqMeta, type RequestMeta } from '../auth/decorators';
import { ResourceIdPipe } from '../common/http/resource-id.pipe';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { CurrentTenant, RequirePermission } from '../tenancy/decorators';
import type { TenantContext } from '../tenancy/tenant-context';
import { CustomersService } from './customers.service';

const CustomerId = new ResourceIdPipe('Customer');

@ApiTags('customers')
@Controller('tenants/:tenantId/customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermission(Permission.ViewCustomers)
  @ApiOperation({ summary: 'Search, filter and sort customers' })
  list(
    @Query(new ZodValidationPipe(CustomerListQuerySchema)) query: CustomerListQuery,
  ): Promise<Paginated<Customer>> {
    return this.customers.list(query);
  }

  // Declared before ':customerId' so "export" is not taken for an id.
  @Get('export')
  @RequirePermission(Permission.ExportData)
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Download matching customers as CSV' })
  async export(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(CustomerFilterSchema)) filter: CustomerFilter,
    @ReqMeta() meta: RequestMeta,
    @Res() res: Response,
  ): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="customers-${date}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    for await (const chunk of this.customers.exportCsv(tenant, filter, meta)) {
      if (!res.write(chunk)) await new Promise((resolve) => res.once('drain', resolve));
    }
    res.end();
  }

  @Post('bulk')
  @RequirePermission(Permission.BulkActions)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Adjust points or tags for up to 500 customers at once (all or nothing)',
  })
  bulk(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(BulkActionSchema)) body: BulkActionInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<BulkActionResult> {
    return this.customers.bulk(tenant, body, meta);
  }

  @Post()
  @RequirePermission(Permission.RecordPurchase)
  @ApiOperation({ summary: 'Enrol a customer' })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(CreateCustomerSchema)) body: CreateCustomerInput,
  ): Promise<Customer> {
    return this.customers.create(tenant, body);
  }

  @Get(':customerId')
  @RequirePermission(Permission.ViewCustomers)
  @ApiOperation({ summary: 'A customer with balance and tier' })
  get(@Param('customerId', CustomerId) customerId: string): Promise<Customer> {
    return this.customers.get(customerId);
  }

  @Patch(':customerId')
  @RequirePermission(Permission.RecordPurchase)
  @ApiOperation({ summary: 'Edit contact details or tags' })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('customerId', CustomerId) customerId: string,
    @Body(new ZodValidationPipe(UpdateCustomerSchema)) body: UpdateCustomerInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Customer> {
    return this.customers.update(tenant, customerId, body, meta);
  }

  @Get(':customerId/ledger')
  @RequirePermission(Permission.ViewCustomers)
  @ApiOperation({ summary: 'Points history, newest first' })
  ledger(
    @Param('customerId', CustomerId) customerId: string,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<LedgerEntry>> {
    return this.customers.ledger(customerId, query);
  }
}
