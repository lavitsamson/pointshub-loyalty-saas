import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ProblemException } from './problem.exception';

/**
 * Validates and parses a request part against a zod schema from @pointshub/shared.
 * Usage: `@Body(new ZodValidationPipe(CreateCustomerSchema)) body: CreateCustomer`.
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw ProblemException.validation(
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }
}
