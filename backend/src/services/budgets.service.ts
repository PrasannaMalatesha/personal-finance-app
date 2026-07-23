import type {
  BudgetsRepo,
  BudgetWithSpendRow,
} from '../repositories/budgets.repo';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type {
  BudgetPublic,
  UpsertBudgetInput,
} from '../schemas/budgets';
import { monthToDate } from '../schemas/budgets';
import { NotFoundError } from '../errors/AppError';

function toPublic(row: BudgetWithSpendRow): BudgetPublic {
  return {
    budgetId: row.budget_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    color: row.color,
    month: row.month,
    amountLimit: row.amount_limit,
    amountSpent: row.amount_spent,
    amountRemaining: row.amount_remaining,
    percentUsed: row.percent_used,
    isOverBudget: row.is_over_budget,
  };
}

export interface BudgetsServiceDeps {
  budgetsRepo: BudgetsRepo;
  categoriesRepo: CategoriesRepo;
}

export function createBudgetsService(deps: BudgetsServiceDeps) {
  const { budgetsRepo, categoriesRepo } = deps;

  async function list(userId: string, month: string): Promise<BudgetPublic[]> {
    const rows = await budgetsRepo.listWithSpendForMonth(
      userId,
      monthToDate(month),
    );
    return rows.map(toPublic);
  }

  async function upsert(
    userId: string,
    input: UpsertBudgetInput,
  ): Promise<BudgetPublic> {
    const category = await categoriesRepo.findByIdForUser(input.categoryId, userId);
    if (!category) throw new NotFoundError('Category');

    await budgetsRepo.upsert({
      userId,
      categoryId: input.categoryId,
      month: monthToDate(input.month),
      amountLimit: input.amountLimit,
    });

    // Reload with spend so the client sees consistent joined data (matches
    // the shape of GET /budgets).
    const list = await budgetsRepo.listWithSpendForMonth(
      userId,
      monthToDate(input.month),
    );
    const row = list.find((r) => r.category_id === input.categoryId);
    if (!row) throw new Error('budgets.upsert: freshly upserted row not found');
    return toPublic(row);
  }

  async function remove(userId: string, id: string): Promise<void> {
    const ok = await budgetsRepo.deleteForUser(id, userId);
    if (!ok) throw new NotFoundError('Budget');
  }

  return { list, upsert, remove };
}

export type BudgetsService = ReturnType<typeof createBudgetsService>;
