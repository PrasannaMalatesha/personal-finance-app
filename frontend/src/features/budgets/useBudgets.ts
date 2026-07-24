import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './budgetsApi';
import type { BudgetPublic } from './schemas';

const listKey = (month: string) => ['budgets', month] as const;

export function useBudgets(month: string) {
  return useQuery({
    queryKey: listKey(month),
    queryFn: () => api.listBudgets(month),
    staleTime: 15_000,
  });
}

export function useUpsertBudget(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { categoryId: string; amountLimit: string }) =>
      api.upsertBudget({ month, ...input }),
    onSuccess: (saved: BudgetPublic) => {
      qc.setQueryData<BudgetPublic[]>(listKey(month), (prev) => {
        if (!prev) return [saved];
        const idx = prev.findIndex((b) => b.categoryId === saved.categoryId);
        if (idx === -1) return [...prev, saved];
        const copy = prev.slice();
        copy[idx] = saved;
        return copy;
      });
    },
  });
}

export function useDeleteBudget(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteBudget(id),
    onSuccess: (_v, id) => {
      qc.setQueryData<BudgetPublic[]>(listKey(month), (prev) =>
        prev?.filter((b) => b.budgetId !== id),
      );
    },
  });
}
