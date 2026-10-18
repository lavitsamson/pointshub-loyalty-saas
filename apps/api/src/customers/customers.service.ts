import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@pointshub/db';
import {
  type BulkActionInput,
  type BulkActionResult,
  type CreateCustomerInput,
  type Customer,
  type CustomerFilter,
  type CustomerListQuery,
  type LedgerEntry,
  type Paginated,
  type PaginationQuery,
  tierFor,
  type UpdateCustomerInput,
} from '@pointshub/shared';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../auth/decorators';
import { assertRoomForCustomer } from '../billing/plan-limits';
import { csvRow } from '../common/csv';
import { ProblemException } from '../common/http/problem.exception';
import { afterCursor, NEWEST_FIRST, orderBy, toPage } from '../common/pagination/cursor';
import { isUniqueViolation } from '../common/prisma-errors';
import { PrismaService } from '../infra/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AdjustmentsService } from '../points/adjustments.service';
import { toLedgerEntry } from '../points/ledger.mapper';
import type { TenantContext, TenantScope } from '../tenancy/tenant-context';
import { CUSTOMER_KEYSETS, customerInclude, customerWhere, toCustomer } from './customer-query';

const EXPORT_BATCH_SIZE = 1000;
/** A bulk adjustment of 500 customers takes a few seconds; the default 5 s limit is too tight. */
const BULK_TRANSACTION_TIMEOUT_MS = 60_000;

export const DUPLICATE_CUSTOMER = '/problems/duplicate-customer';

const duplicateEmail = () =>
  new ProblemException({
    type: DUPLICATE_CUSTOMER,
    title: 'Customer already exists',
    status: 409,
    detail: 'A customer with this email is already in your programme.',
  });

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly adjustments: AdjustmentsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: CustomerListQuery): Promise<Paginated<Customer>> {
    const keyset = CUSTOMER_KEYSETS[query.sort];
    const rows = await this.prisma.scoped.customer.findMany({
      where: { AND: [customerWhere(query), afterCursor(keyset, query.cursor)] },
      orderBy: orderBy(keyset),
      take: query.limit + 1,
      include: customerInclude,
    });
    return toPage(rows, query.limit, keyset, toCustomer);
  }

  async get(customerId: string): Promise<Customer> {
    const row = await this.prisma.scoped.customer.findUnique({
      where: { id: customerId },
      include: customerInclude,
    });
    if (!row) throw new NotFoundException('Customer not found');
    return toCustomer(row);
  }

  /**
   * Enrols a customer: from the dashboard, or self-service from the portal (with a password).
   * Both paths are subject to the plan's customer limit (402).
   */
  async create(
    scope: TenantScope,
    input: CreateCustomerInput,
    passwordHash: string | null = null,
  ): Promise<Customer> {
    try {
      return await this.prisma.scoped.$transaction(async (tx) => {
        await assertRoomForCustomer(tx, scope.tenantId);
        const tiers = await tx.tier.findMany();
        const row = await tx.customer.create({
          data: {
            tenantId: scope.tenantId,
            email: input.email,
            name: input.name,
            phone: input.phone ?? null,
            tags: [...new Set(input.tags)],
            passwordHash,
            currentTierId: tierFor(tiers, 0)?.id ?? null,
          },
          include: customerInclude,
        });
        await this.outbox.add(tx, scope.tenantId, 'customer.created', { customerId: row.id });
        return toCustomer(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateEmail();
      throw error;
    }
  }

  async update(
    ctx: TenantContext,
    customerId: string,
    input: UpdateCustomerInput,
    meta: RequestMeta,
  ): Promise<Customer> {
    try {
      return await this.prisma.scoped.$transaction(async (tx) => {
        const before = await tx.customer.findUnique({
          where: { id: customerId },
          include: customerInclude,
        });
        if (!before) throw new NotFoundException('Customer not found');
        const after = await tx.customer.update({
          where: { id: customerId },
          data: { ...input, tags: input.tags && [...new Set(input.tags)] },
          include: customerInclude,
        });
        await this.audit.record(tx, {
          tenantId: ctx.tenantId,
          actorUserId: ctx.userId,
          action: 'customer.updated',
          entityType: 'Customer',
          entityId: customerId,
          before: pick(toCustomer(before), Object.keys(input)),
          after: pick(toCustomer(after), Object.keys(input)),
          meta,
        });
        return toCustomer(after);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateEmail();
      throw error;
    }
  }

  async ledger(customerId: string, query: PaginationQuery): Promise<Paginated<LedgerEntry>> {
    const exists = await this.prisma.scoped.customer.count({ where: { id: customerId } });
    if (!exists) throw new NotFoundException('Customer not found');

    const rows = await this.prisma.scoped.pointsLedgerEntry.findMany({
      where: { customerId, ...afterCursor(NEWEST_FIRST, query.cursor) },
      orderBy: orderBy(NEWEST_FIRST),
      take: query.limit + 1,
    });
    return toPage(rows, query.limit, NEWEST_FIRST, toLedgerEntry);
  }

  /**
   * All-or-nothing: every customer must belong to this business, and for point
   * adjustments every resulting balance must stay non-negative, or nothing changes.
   */
  async bulk(
    ctx: TenantContext,
    input: BulkActionInput,
    meta: RequestMeta,
  ): Promise<BulkActionResult> {
    // Sorted so concurrent bulk actions lock rows in the same order and cannot deadlock.
    const ids = [...new Set(input.customerIds)].sort();

    return this.prisma.scoped.$transaction(
      async (tx) => {
        const found = await tx.customer.count({ where: { id: { in: ids } } });
        if (found !== ids.length) throw new NotFoundException('One or more customers not found');

        let affected = ids.length;
        switch (input.action) {
          case 'ADJUST_POINTS':
            for (const id of ids) {
              await this.adjustments.adjustInTransaction(tx, ctx, id, input.params);
            }
            break;
          case 'ADD_TAG':
            affected = (
              await tx.customer.updateMany({
                where: { id: { in: ids }, NOT: { tags: { has: input.params.tag } } },
                data: { tags: { push: input.params.tag } },
              })
            ).count;
            break;
          case 'REMOVE_TAG':
            // Prisma has no "pull" for scalar lists; raw SQL takes the tenant id explicitly.
            affected = await tx.$executeRaw`
              UPDATE "Customer"
              SET tags = array_remove(tags, ${input.params.tag}), "updatedAt" = now()
              WHERE "tenantId" = ${ctx.tenantId}::uuid
                AND id = ANY(${ids}::uuid[])
                AND ${input.params.tag} = ANY(tags)`;
            break;
        }

        await this.audit.record(tx, {
          tenantId: ctx.tenantId,
          actorUserId: ctx.userId,
          action: 'customers.bulk_action',
          entityType: 'Customer',
          entityId: 'bulk',
          after: { action: input.action, params: input.params, customerIds: ids, affected },
          meta,
        });
        return { affected };
      },
      { timeout: BULK_TRANSACTION_TIMEOUT_MS },
    );
  }

  /**
   * Streams every matching customer as CSV in batches, so memory stays flat however large
   * the programme is.
   */
  async *exportCsv(
    ctx: TenantContext,
    filter: CustomerFilter,
    meta: RequestMeta,
  ): AsyncGenerator<string> {
    await this.audit.record(this.prisma.scoped, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: 'customers.exported',
      entityType: 'Customer',
      entityId: 'export',
      after: { filter },
      meta,
    });

    yield csvRow([
      'id',
      'name',
      'email',
      'phone',
      'tier',
      'points_balance',
      'lifetime_points',
      'tags',
      'joined_at',
    ]);

    let cursor: string | undefined;
    for (;;) {
      const page = await this.list({ ...filter, limit: EXPORT_BATCH_SIZE, cursor });
      for (const c of page.data) {
        yield csvRow([
          c.id,
          c.name,
          c.email,
          c.phone,
          c.tier?.name,
          c.pointsBalance,
          c.lifetimePoints,
          c.tags.join(';'),
          c.createdAt,
        ]);
      }
      if (!page.pageInfo.nextCursor) break;
      cursor = page.pageInfo.nextCursor;
    }
  }
}

/** The changed fields only, for the audit log. Customer DTOs are plain JSON. */
function pick(customer: Customer, keys: string[]): Prisma.InputJsonObject {
  return Object.fromEntries(keys.map((k) => [k, customer[k as keyof Customer]]));
}
