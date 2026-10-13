import { ProblemException } from '../http/problem.exception';
import {
  afterCursor,
  decodeCursor,
  encodeCursor,
  type Keyset,
  NEWEST_FIRST,
  orderBy,
  toPage,
} from './cursor';

const row = (n: number) => ({
  id: `id-${n}`,
  name: `name-${n}`,
  points: n * 10,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)),
});
type Row = ReturnType<typeof row>;

const BY_NAME: Keyset<Row> = {
  name: 'name',
  field: 'name',
  direction: 'asc',
  valueOf: (r) => r.name,
};
const BY_POINTS: Keyset<Row> = {
  name: 'points',
  field: 'points',
  direction: 'desc',
  valueOf: (r) => r.points,
};

describe('cursor encoding', () => {
  it('round-trips dates', () => {
    const cursor = encodeCursor(NEWEST_FIRST, row(5));
    expect(decodeCursor(NEWEST_FIRST, cursor)).toEqual({ value: row(5).createdAt, id: 'id-5' });
  });

  it('round-trips strings and numbers', () => {
    expect(decodeCursor(BY_NAME, encodeCursor(BY_NAME, row(3)))).toEqual({
      value: 'name-3',
      id: 'id-3',
    });
    expect(decodeCursor(BY_POINTS, encodeCursor(BY_POINTS, row(3)))).toEqual({
      value: 30,
      id: 'id-3',
    });
  });

  it('produces URL-safe output', () => {
    expect(encodeCursor(BY_NAME, row(5))).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects a cursor issued for a different ordering', () => {
    const cursor = encodeCursor(BY_NAME, row(1));
    expect(() => decodeCursor(BY_POINTS, cursor)).toThrow(ProblemException);
  });

  it.each([
    ['not base64 json', '%%%'],
    ['wrong shape', Buffer.from('{"foo":1}').toString('base64url')],
    ['bad date', Buffer.from('{"s":"newest","v":"x","d":true,"id":"a"}').toString('base64url')],
  ])('rejects a tampered cursor (%s) with a 400 problem', (_label, raw) => {
    expect(() => decodeCursor(NEWEST_FIRST, raw)).toThrow(ProblemException);
  });
});

describe('afterCursor', () => {
  it('is empty for the first page', () => {
    expect(afterCursor(NEWEST_FIRST, undefined)).toEqual({});
  });

  it('continues after the cursor, breaking ties by id, in descending order', () => {
    const at = row(5).createdAt;
    expect(afterCursor(NEWEST_FIRST, encodeCursor(NEWEST_FIRST, row(5)))).toEqual({
      OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: 'id-5' } }],
    });
  });

  it('uses greater-than for ascending orderings', () => {
    expect(afterCursor(BY_NAME, encodeCursor(BY_NAME, row(2)))).toEqual({
      OR: [{ name: { gt: 'name-2' } }, { name: 'name-2', id: { gt: 'id-2' } }],
    });
  });
});

describe('orderBy', () => {
  it('orders by the field, then id, in the same direction', () => {
    expect(orderBy(BY_POINTS)).toEqual([{ points: 'desc' }, { id: 'desc' }]);
  });
});

describe('toPage', () => {
  it('drops the look-ahead row and points the cursor at the last returned row', () => {
    const page = toPage([row(3), row(2), row(1)], 2, NEWEST_FIRST, (r) => r.id);
    expect(page.data).toEqual(['id-3', 'id-2']);
    expect(page.pageInfo.hasNextPage).toBe(true);
    expect(decodeCursor(NEWEST_FIRST, page.pageInfo.nextCursor!).id).toBe('id-2');
  });

  it('has no next cursor on the last page', () => {
    expect(toPage([row(1)], 2, NEWEST_FIRST, (r) => r.id).pageInfo).toEqual({
      hasNextPage: false,
      nextCursor: null,
    });
  });
});
