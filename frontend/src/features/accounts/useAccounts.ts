import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './accountsApi';
import type { AccountFormInput, AccountPublic } from './schemas';

const KEY = ['accounts'] as const;

export function useAccounts() {
  return useQuery({
    queryKey: KEY,
    queryFn: api.listAccounts,
    staleTime: 30_000,
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: AccountFormInput;
      idempotencyKey: string;
    }) => api.createAccount(input, idempotencyKey),
    onSuccess: (created: AccountPublic) => {
      qc.setQueryData<AccountPublic[]>(KEY, (prev) =>
        prev ? [...prev, created] : [created],
      );
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AccountFormInput> }) =>
      api.updateAccount(id, patch),
    onSuccess: (updated: AccountPublic) => {
      qc.setQueryData<AccountPublic[]>(KEY, (prev) =>
        prev?.map((a) => (a.id === updated.id ? updated : a)),
      );
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: (_v, id) => {
      qc.setQueryData<AccountPublic[]>(KEY, (prev) => prev?.filter((a) => a.id !== id));
      // Balances + transaction lists depend on account existence.
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
