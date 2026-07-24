import { apiFetch } from '../../shared/api/client';
import type { BudgetFormInput, BudgetPublic } from './schemas';

interface DataWrap<T> {
  data: T;
}

export async function listBudgets(month: string): Promise<BudgetPublic[]> {
  const res = await apiFetch<DataWrap<BudgetPublic[]>>(
    `/api/v1/budgets?month=${encodeURIComponent(month)}`,
  );
  return res.data;
}

/**
 * PUT /budgets is naturally idempotent by (userId, categoryId, month) unique
 * constraint (TRD §7.3), so no Idempotency-Key header is required.
 */
export async function upsertBudget(input: {
  month: string;
  categoryId: string;
  amountLimit: BudgetFormInput['amountLimit'];
}): Promise<BudgetPublic> {
  const res = await apiFetch<DataWrap<BudgetPublic>>('/api/v1/budgets', {
    method: 'PUT',
    json: input,
  });
  return res.data;
}

export async function deleteBudget(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/budgets/${id}`, { method: 'DELETE' });
}
