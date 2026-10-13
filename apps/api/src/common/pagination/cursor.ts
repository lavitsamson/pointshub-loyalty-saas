import type { Paginated } from '@pointshub/shared';
import { z } from 'zod';
import { ProblemException } from '../http/problem.exception';

/**
 * Keyset pagination. A cursor records the sort value and id of the last row returned;
 * the next page continues strictly after that pair. The id breaks ties between rows with
 * equal sort values, so pages never skip or repeat rows, and queries stay index-friendly
 * (no OFFSET scans).
 *
 * Cursors are opaque base64url JSON and also record which sort they belong to, so a cursor
 * from one ordering cannot be replayed against another.
 */

type SortValue = string | number;
type Direction = 'asc' | 'desc';

export interface Keyset<Row> {
  /** Name of the ordering, e.g. "newest"; stored in the cursor. */
  name: string;
  field: string;
  direction: Direction;
  valueOf(row: Row): SortValue | Date;
}

const CursorSchema = z.object({
  s: z.string(),
  v: z.union([z.string(), z.number()]),
  d: z.boolean().optional(),
  id: z.string().min(1),
});

export function encodeCursor<Row extends { id: string }>(keyset: Keyset<Row>, row: Row): string {
  const value = keyset.valueOf(row);
  const payload =
    value instanceof Date
      ? { s: keyset.name, v: value.toISOString(), d: true, id: row.id }
      : { s: keyset.name, v: value, id: row.id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(
  keyset: Pick<Keyset<never>, 'name'>,
  raw: string,
): { value: SortValue | Date; id: string } {
  const invalid = () =>
    ProblemException.validation([{ path: 'cursor', message: 'Invalid cursor' }]);
  let parsed: z.infer<typeof CursorSchema>;
  try {
    parsed = CursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
  } catch {
    throw invalid();
  }
  if (parsed.s !== keyset.name) throw invalid();
  if (!parsed.d) return { value: parsed.v, id: parsed.id };

  const date = new Date(String(parsed.v));
  if (Number.isNaN(date.getTime())) throw invalid();
  return { value: date, id: parsed.id };
}

/** Prisma `where` fragment for rows after the cursor in the keyset's order. */
export function afterCursor(
  keyset: Pick<Keyset<never>, 'name' | 'field' | 'direction'>,
  raw?: string,
) {
  if (!raw) return {};
  const { value, id } = decodeCursor(keyset, raw);
  const op = keyset.direction === 'desc' ? 'lt' : 'gt';
  return {
    OR: [{ [keyset.field]: { [op]: value } }, { [keyset.field]: value, id: { [op]: id } }],
  };
}

/** Prisma `orderBy` matching the keyset. */
export function orderBy(keyset: Pick<Keyset<never>, 'field' | 'direction'>) {
  return [{ [keyset.field]: keyset.direction }, { id: keyset.direction }];
}

/**
 * Builds the list envelope from a query that fetched `limit + 1` rows: the extra row only
 * tells us whether another page exists and is not returned.
 */
export function toPage<Row extends { id: string }, Item>(
  rows: Row[],
  limit: number,
  keyset: Keyset<NoInfer<Row>>,
  map: (row: Row) => Item,
): Paginated<Item> {
  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);
  return {
    data: pageRows.map(map),
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage && last ? encodeCursor(keyset, last) : null,
    },
  };
}

/** The default ordering for most lists: newest first. */
export const NEWEST_FIRST: Keyset<{ id: string; createdAt: Date }> = {
  name: 'newest',
  field: 'createdAt',
  direction: 'desc',
  valueOf: (row) => row.createdAt,
};
