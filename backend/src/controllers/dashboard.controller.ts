import type { DashboardService } from '../services/dashboard.service';
import {
  ByCategoryQuery,
  SummaryQuery,
  TrendQuery,
} from '../schemas/dashboard';
import type { AuthedRequest } from '../lib/handler';

export interface DashboardController {
  summary(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  byCategory(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  trend(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
}

export function createDashboardController(
  service: DashboardService,
): DashboardController {
  return {
    async summary(req) {
      const { month } = SummaryQuery.parse(req.query);
      const data = await service.summary(req.user.id, month);
      return { status: 200, body: { data } };
    },

    async byCategory(req) {
      const { month } = ByCategoryQuery.parse(req.query);
      const data = await service.byCategory(req.user.id, month);
      return { status: 200, body: { data } };
    },

    async trend(req) {
      const { months, endMonth } = TrendQuery.parse(req.query);
      const data = await service.trend(req.user.id, months, endMonth);
      return { status: 200, body: { data } };
    },
  };
}
