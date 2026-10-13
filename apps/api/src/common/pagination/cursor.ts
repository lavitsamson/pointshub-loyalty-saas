import type { Paginated } from '@pointshub/shared';
import { z } from 'zod';
import { ProblemException } from '../http/problem.exception';

/**
 * Keyset cursor over (createdAt, id). Ids are UUID v7 so they already sort by time, but
 * pairing them with createdAt keeps the cursor stable for rows that share a timestamp and
 * lets list queries use the (tenantId, createdAt) indexes.
 */
const CursorSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.string().min(1),
});
export type Cursor = z.infer<typeof CursorSchema>;

export function encodeCursor(cursor: { createdAt: Date; id: string }): string {
  const payload = JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  try {
    const json: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return CursorSchema.parse(json);
  } catch {
    throw ProblemException.validation([{ path: 'cursor', message: 'Invalid cursor' }]);
  }
}

/**
 * Prisma `where` fragment for "rows after this cursor" in newest-first order.
 * Combine with `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`.
 */
export function afterCursor(raw: string | undefined) {
  if (!raw) return {};
  const { createdAt, id } = decodeCursor(raw);
  const at = new Date(createdAt);
  return {
    OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }],
  };
}

export const NEWEST_FIRST = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

/**
 * Builds the list envelope from a query that fetched `limit + 1` rows: the extra row only
 * tells us whether another page exists and is not returned.
 */
export function toPage<Row extends { createdAt: Date; id: string }, Item>(
  rows: Row[],
  limit: number,
  map: (row: Row) => Item,
): Paginated<Item> {
  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);
  return {
    data: pageRows.map(map),
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage && last ? encodeCursor(last) : null,
    },
  };
}
