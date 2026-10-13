import { z } from 'zod';

/** RFC 9457 Problem Details, returned by the API for every error response. */
export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  /** Field-level validation errors, present on 400 responses. */
  errors: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
  /** Present on 429 responses; mirrors the Retry-After header. */
  retryAfterSeconds: z.number().int().optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export const PROBLEM_JSON_CONTENT_TYPE = 'application/problem+json';
