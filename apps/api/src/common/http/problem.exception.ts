import { HttpException } from '@nestjs/common';
import type { ProblemDetails } from '@pointshub/shared';

type ProblemInit = Omit<ProblemDetails, 'instance'>;

/**
 * An HttpException that carries a full RFC 9457 body. Throw it when the generic
 * status-derived problem is not specific enough (validation errors, plan limits, ...).
 */
export class ProblemException extends HttpException {
  constructor(readonly problem: ProblemInit) {
    super(problem, problem.status);
  }

  static validation(errors: NonNullable<ProblemDetails['errors']>): ProblemException {
    return new ProblemException({
      type: '/problems/validation-error',
      title: 'Validation failed',
      status: 400,
      detail: 'One or more fields are invalid.',
      errors,
    });
  }
}
