'use client';

import type {
  AnalyticsSummary,
  DailyStatsResponse,
  DateRangeQuery,
  TopRewardsResponse,
} from '@pointshub/shared';
import { useQuery } from '@tanstack/react-query';
import { api, query } from './client';
import { keys } from './keys';
import { tenantPath } from './shared';

const path = (
  tenantId: string,
  report: string,
  params: Record<string, string | number | undefined>,
) => `${tenantPath(tenantId)}/analytics/${report}${query(params)}`;

export function useSummary(tenantId: string, range: DateRangeQuery = {}) {
  return useQuery({
    queryKey: keys.list(tenantId, 'analytics', { report: 'summary', ...range }),
    queryFn: ({ signal }) => api.get<AnalyticsSummary>(path(tenantId, 'summary', range), signal),
  });
}

export function useDailyStats(tenantId: string, range: DateRangeQuery = {}) {
  return useQuery({
    queryKey: keys.list(tenantId, 'analytics', { report: 'daily', ...range }),
    queryFn: ({ signal }) => api.get<DailyStatsResponse>(path(tenantId, 'daily', range), signal),
  });
}

export function useTopRewards(tenantId: string, range: DateRangeQuery & { limit?: number } = {}) {
  return useQuery({
    queryKey: keys.list(tenantId, 'analytics', { report: 'top-rewards', ...range }),
    queryFn: ({ signal }) =>
      api.get<TopRewardsResponse>(path(tenantId, 'top-rewards', range), signal),
  });
}
