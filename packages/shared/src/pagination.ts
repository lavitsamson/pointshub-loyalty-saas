import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/** Query string accepted by every list endpoint: `?limit=&cursor=`. */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
  hasNextPage: z.boolean(),
});
export type PageInfo = z.infer<typeof PageInfoSchema>;

/** Wraps an item schema in the standard `{ data, pageInfo }` list envelope. */
export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    pageInfo: PageInfoSchema,
  });
}

export type Paginated<T> = {
  data: T[];
  pageInfo: PageInfo;
};
