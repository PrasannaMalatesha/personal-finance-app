import { useQuery } from '@tanstack/react-query';
import * as api from './dashboardApi';

const summaryKey = (month: string) => ['dashboard', 'summary', month] as const;
const byCategoryKey = (month: string) => ['dashboard', 'by-category', month] as const;
const trendKey = (months: number) => ['dashboard', 'trend', months] as const;
const netWorthKey = (months: number) => ['dashboard', 'net-worth', months] as const;

export function useSummary(month: string) {
  return useQuery({
    queryKey: summaryKey(month),
    queryFn: () => api.getSummary(month),
    staleTime: 15_000,
  });
}

export function useByCategory(month: string) {
  return useQuery({
    queryKey: byCategoryKey(month),
    queryFn: () => api.getByCategory(month),
    staleTime: 15_000,
  });
}

export function useTrend(months: number) {
  return useQuery({
    queryKey: trendKey(months),
    queryFn: () => api.getTrend(months),
    staleTime: 15_000,
  });
}

/**
 * Only wired when FLAG_NET_WORTH is on — pass `enabled: false` from the
 * caller when the flag is off so no request goes out. TanStack Query
 * treats disabled queries as inert placeholders.
 */
export function useNetWorth(months: number, enabled: boolean) {
  return useQuery({
    queryKey: netWorthKey(months),
    queryFn: () => api.getNetWorth(months),
    staleTime: 15_000,
    enabled,
  });
}
