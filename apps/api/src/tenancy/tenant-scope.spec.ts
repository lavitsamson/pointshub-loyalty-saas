import { scopeArgs, TenantScopeError } from './tenant-scope';

const T = 'tenant-a';

describe('scopeArgs', () => {
  it.each(['findMany', 'findFirst', 'findUnique', 'count', 'updateMany', 'delete', 'groupBy'])(
    'adds tenantId to the filter of %s',
    (operation) => {
      expect(scopeArgs(operation, { where: { id: 'x' } }, T)).toEqual({
        where: { id: 'x', tenantId: T },
      });
    },
  );

  it('adds a filter when the query has none', () => {
    expect(scopeArgs('findMany', { take: 10 }, T)).toEqual({ take: 10, where: { tenantId: T } });
  });

  it('stamps tenantId on created rows', () => {
    expect(scopeArgs('create', { data: { name: 'Gold' } }, T)).toEqual({
      data: { name: 'Gold', tenantId: T },
    });
  });

  it('stamps every row of createMany', () => {
    expect(scopeArgs('createMany', { data: [{ name: 'a' }, { name: 'b' }] }, T)).toEqual({
      data: [
        { name: 'a', tenantId: T },
        { name: 'b', tenantId: T },
      ],
    });
  });

  it('scopes both the lookup and the insert of an upsert', () => {
    expect(
      scopeArgs('upsert', { where: { id: 'x' }, create: { name: 'a' }, update: { name: 'b' } }, T),
    ).toEqual({
      where: { id: 'x', tenantId: T },
      create: { name: 'a', tenantId: T },
      update: { name: 'b' },
    });
  });

  it('accepts an explicit tenantId that matches the context', () => {
    expect(scopeArgs('findMany', { where: { tenantId: T } }, T)).toEqual({
      where: { tenantId: T },
    });
  });

  it('refuses a query that names another tenant', () => {
    expect(() => scopeArgs('findMany', { where: { tenantId: 'tenant-b' } }, T)).toThrow(
      TenantScopeError,
    );
    expect(() => scopeArgs('create', { data: { tenantId: 'tenant-b' } }, T)).toThrow(
      TenantScopeError,
    );
  });

  it('refuses relation-style tenant connects, which would bypass the stamp', () => {
    expect(() =>
      scopeArgs('create', { data: { tenant: { connect: { id: 'tenant-b' } } } }, T),
    ).toThrow(TenantScopeError);
  });

  it('refuses operations it does not know how to scope', () => {
    expect(() => scopeArgs('somethingNew', {}, T)).toThrow(TenantScopeError);
  });
});
