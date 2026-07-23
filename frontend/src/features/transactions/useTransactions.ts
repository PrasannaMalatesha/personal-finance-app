import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import * as api from './transactionsApi';
import type {
  TransactionFormInput,
  TransactionsFilters,
} from './schemas';

const KEY_ROOT = ['transactions'] as const;
const listKey = (filters: TransactionsFilters) => [...KEY_ROOT, 'list', filters] as const;

/**
 * Cursor pagination via TanStack Query's useInfiniteQuery. Each page has
 * `data` (transactions) + `nextCursor`. When `nextCursor` is null, there
 * are no more pages.
 */
export function useTransactions(filters: TransactionsFilters) {
  return useInfiniteQuery({
    queryKey: listKey(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.listTransactions(filters, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 15_000,
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: TransactionFormInput;
      idempotencyKey: string;
    }) => api.createTransaction(input, idempotencyKey),
    onSuccess: () => {
      // Full invalidation is simplest — filters may change what's visible.
      qc.invalidateQueries({ queryKey: KEY_ROOT });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TransactionFormInput }) =>
      api.updateTransaction(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_ROOT });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTransaction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_ROOT });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
