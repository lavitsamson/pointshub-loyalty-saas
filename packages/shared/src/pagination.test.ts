import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, PaginationQuerySchema, paginated } from './pagination';

describe('PaginationQuerySchema', () => {
  it('applies the default page size', () => {
    expect(PaginationQuerySchema.parse({})).toEqual({ limit: DEFAULT_PAGE_SIZE });
  });

  it('coerces limit from a query string', () => {
    expect(PaginationQuerySchema.parse({ limit: '50', cursor: 'abc' })).toEqual({
      limit: 50,
      cursor: 'abc',
    });
  });

  it.each(['0', '101', '-1', '1.5', 'ten'])('rejects limit=%s', (limit) => {
    expect(PaginationQuerySchema.safeParse({ limit }).success).toBe(false);
  });
});

describe('paginated', () => {
  const schema = paginated(z.object({ id: z.string() }));

  it('accepts the list envelope', () => {
    const page = { data: [{ id: 'a' }], pageInfo: { nextCursor: null, hasNextPage: false } };
    expect(schema.parse(page)).toEqual(page);
  });

  it('rejects items that do not match', () => {
    const page = { data: [{ id: 1 }], pageInfo: { nextCursor: null, hasNextPage: false } };
    expect(schema.safeParse(page).success).toBe(false);
  });
});
