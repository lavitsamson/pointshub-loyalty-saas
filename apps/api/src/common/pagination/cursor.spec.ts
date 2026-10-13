import { ProblemException } from '../http/problem.exception';
import { afterCursor, decodeCursor, encodeCursor, toPage } from './cursor';

const row = (n: number) => ({
  id: `id-${n}`,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)),
});

describe('cursor encoding', () => {
  it('round-trips createdAt and id', () => {
    const cursor = encodeCursor(row(5));
    expect(decodeCursor(cursor)).toEqual({ createdAt: '2026-01-01T00:00:05.000Z', id: 'id-5' });
  });

  it('produces URL-safe output', () => {
    expect(encodeCursor(row(5))).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['not base64 json', '%%%'],
    ['valid json, wrong shape', Buffer.from('{"foo":1}').toString('base64url')],
    ['bad date', Buffer.from('{"createdAt":"yesterday","id":"x"}').toString('base64url')],
  ])('rejects a tampered cursor (%s) with a 400 problem', (_label, raw) => {
    expect(() => decodeCursor(raw)).toThrow(ProblemException);
  });
});

describe('afterCursor', () => {
  it('is empty for the first page', () => {
    expect(afterCursor(undefined)).toEqual({});
  });

  it('selects older rows, breaking timestamp ties by id', () => {
    const at = row(5).createdAt;
    expect(afterCursor(encodeCursor(row(5)))).toEqual({
      OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: 'id-5' } }],
    });
  });
});

describe('toPage', () => {
  it('drops the look-ahead row and points the cursor at the last returned row', () => {
    const page = toPage([row(3), row(2), row(1)], 2, (r) => r.id);
    expect(page.data).toEqual(['id-3', 'id-2']);
    expect(page.pageInfo.hasNextPage).toBe(true);
    expect(decodeCursor(page.pageInfo.nextCursor!).id).toBe('id-2');
  });

  it('has no next cursor on the last page', () => {
    expect(toPage([row(1)], 2, (r) => r.id).pageInfo).toEqual({
      hasNextPage: false,
      nextCursor: null,
    });
  });
});
