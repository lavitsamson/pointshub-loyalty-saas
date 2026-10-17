import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { runInTenantContext } from './tenant-context';

/**
 * Runs the handler inside the tenant scope set by a guard (TenantAccessGuard for merchant
 * routes, PortalTenantGuard for the customer portal), which is what the tenant-scoped Prisma
 * client reads. Guards cannot wrap the handler, hence an interceptor.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const scope = req.tenantContext ?? req.portal;
    if (!scope) return next.handle();

    // Subscribe inside the context so async work started by the handler inherits it.
    return new Observable((subscriber) =>
      runInTenantContext({ tenantId: scope.tenantId }, () => next.handle().subscribe(subscriber)),
    );
  }
}
