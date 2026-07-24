import { apiFetch } from '../../shared/api/client';
import type {
  DashboardCategorySlice,
  DashboardSummary,
  DashboardTrendPoint,
} from './schemas';

interface DataWrap<T> {
  data: T;
}

export async function getSummary(month: string): Promise<DashboardSummary> {
  const res = await apiFetch<DataWrap<DashboardSummary>>(
    `/api/v1/dashboard/summary?month=${encodeURIComponent(month)}`,
  );
  return res.data;
}

export async function getByCategory(month: string): Promise<DashboardCategorySlice[]> {
  const res = await apiFetch<DataWrap<DashboardCategorySlice[]>>(
    `/api/v1/dashboard/by-category?month=${encodeURIComponent(month)}`,
  );
  return res.data;
}

export async function getTrend(months: number): Promise<DashboardTrendPoint[]> {
  const res = await apiFetch<DataWrap<DashboardTrendPoint[]>>(
    `/api/v1/dashboard/trend?months=${months}`,
  );
  return res.data;
}
