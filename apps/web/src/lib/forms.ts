import type {
  FieldError,
  FieldErrors,
  FieldValues,
  Path,
  Resolver,
  UseFormSetError,
} from 'react-hook-form';
import type { z } from 'zod';
import { ApiError } from './api/client';

/**
 * Validates a react-hook-form form with a zod schema from @pointshub/shared, so the browser
 * applies exactly the rules the API will. The form holds the schema's input type and the
 * submit handler receives its parsed output.
 */
export function zodResolver<Input extends FieldValues, Output extends FieldValues>(
  schema: z.ZodType<Output, Input>,
): Resolver<Input, unknown, Output> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) return { values: result.data, errors: {} };

    const errors: Record<string, unknown> = {};
    for (const issue of result.error.issues) {
      // Nest by path ("params.tag" -> { params: { tag } }), keeping the first message per field.
      let node = errors;
      issue.path.forEach((key, i) => {
        const k = String(key);
        if (i === issue.path.length - 1) {
          node[k] ??= { type: issue.code, message: issue.message } satisfies FieldError;
        } else {
          node = (node[k] ??= {}) as Record<string, unknown>;
        }
      });
    }
    return { values: {}, errors: errors as FieldErrors<Input> };
  };
}

/**
 * Shows field-level validation errors from a 400 Problem Details response on the matching
 * inputs. Returns false when the error was not of that kind, so the caller can show it
 * elsewhere.
 */
export function applyServerErrors<T extends FieldValues>(
  form: { setError: UseFormSetError<T> },
  error: unknown,
): boolean {
  if (!(error instanceof ApiError) || !error.problem.errors?.length) return false;
  for (const { path, message } of error.problem.errors) {
    form.setError(path as Path<T>, { type: 'server', message });
  }
  return true;
}
