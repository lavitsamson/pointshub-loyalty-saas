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
 * Runs the handler inside the tenant context set by TenantAccessGuard, which is what the
 * tenant-scoped Prisma client reads. Guards cannot wrap the handler, hence an interceptor.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const tenant = context.switchToHttp().getRequest<Request>().tenantContext;
    if (!tenant) return next.handle();

    // Subscribe inside the context so async work started by the handler inherits it.
    return new Observable((subscriber) =>
      runInTenantContext(tenant, () => next.handle().subscribe(subscriber)),
    );
  }
}
