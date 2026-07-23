import type { BudgetsService } from '../services/budgets.service';
import {
  ListBudgetsQuery,
  UpsertBudgetInput,
} from '../schemas/budgets';
import type { AuthedRequest } from '../lib/handler';

export interface BudgetsController {
  list(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  upsert(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  remove(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
}

export function createBudgetsController(
  service: BudgetsService,
): BudgetsController {
  return {
    async list(req) {
      const { month } = ListBudgetsQuery.parse(req.query);
      const items = await service.list(req.user.id, month);
      return { status: 200, body: { data: items } };
    },

    async upsert(req) {
      const input = UpsertBudgetInput.parse(req.body);
      const budget = await service.upsert(req.user.id, input);
      return { status: 200, body: { data: budget } };
    },

    async remove(req) {
      await service.remove(req.user.id, req.params.id!);
      return { status: 204, body: undefined };
    },
  };
}
