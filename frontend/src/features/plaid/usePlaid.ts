import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './plaidApi';

const KEY = ['plaid-items'] as const;

export function usePlaidItems() {
  return useQuery({
    queryKey: KEY,
    queryFn: api.listItems,
    staleTime: 30_000,
  });
}

export function useCreateLinkToken() {
  return useMutation({
    mutationFn: api.createLinkToken,
  });
}

export function useExchangePublicToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.exchangePublicToken,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // Fresh accounts + transactions were just imported.
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useSyncItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.syncItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRemoveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.removeItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // Local accounts stay (plaid_item_id gets nulled server-side), but
      // their "connected" status changes; refresh so any dependent UI updates.
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
