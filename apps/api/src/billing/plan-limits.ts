import { NotFoundException } from '@nestjs/common';
import type { Plan } from '@pointshub/db';
import { PLAN_LIMIT_PROBLEM, PLAN_LIMITS } from '@pointshub/shared';
import { ProblemException } from '../common/http/problem.exception';
import type { ScopedTransaction } from '../tenancy/tenant-scope';

export function customerLimitReached(limit: number): ProblemException {
  return new ProblemException({
    type: PLAN_LIMIT_PROBLEM,
    title: 'Plan limit reached',
    status: 402,
    detail: `The Free plan includes up to ${limit} customers. Upgrade to Pro to add more.`,
  });
}

/**
 * Refuses a new customer once the business's plan is full. Call inside the transaction that
 * creates the customer: the tenant row stays locked until it commits, so concurrent
 * enrolments are counted one after another and cannot overshoot the limit together.
 */
export async function assertRoomForCustomer(
  tx: ScopedTransaction,
  tenantId: string,
): Promise<void> {
  const [tenant] = await tx.$queryRaw<Array<{ plan: Plan }>>`
    SELECT plan FROM "Tenant" WHERE id = ${tenantId}::uuid FOR UPDATE`;
  if (!tenant) throw new NotFoundException('Tenant not found');

  const limit = PLAN_LIMITS[tenant.plan].maxCustomers;
  if (limit === null) return;
  if ((await tx.customer.count()) >= limit) throw customerLimitReached(limit);
}
