'use client';

import type { Paginated } from '@pointshub/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, query } from './client';
import { type Area, keys } from './keys';

/** Base path for a business's resources. */
export const tenantPath = (tenantId: string) => `/tenants/${tenantId}`;

/** Refetches everything cached for the given areas of a business. */
export function useInvalidate(tenantId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (...areas: Area[]) =>
      Promise.all(
        areas.map((area) => queryClient.invalidateQueries({ queryKey: keys.area(tenantId, area) })),
      ),
    [queryClient, tenantId],
  );
}

/**
 * A cursor-paginated list rendered with a "Load more" button. `params` become both the query
 * key and the query string, so changing a filter starts again from the first page.
 */
export function usePaginatedList<T>(
  tenantId: string,
  area: Area,
  path: string,
  params: Record<string, string | number | undefined> = {},
) {
  const result = useInfiniteQuery({
    queryKey: [...keys.list(tenantId, area, params), path],
    queryFn: ({ pageParam, signal }) =>
      api.get<Paginated<T>>(`${path}${query({ ...params, cursor: pageParam })}`, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.pageInfo.nextCursor ?? undefined,
  });
  const items = result.data?.pages.flatMap((page) => page.data) ?? [];
  return { ...result, items };
}

/** A complete list that is small by nature (tiers, campaigns): one page of up to 100. */
export const ALL = { limit: 100 } as const;
