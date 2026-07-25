import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './rulesApi';
import type { RulePublic, RuleWireInput } from './schemas';

const KEY = ['rules'] as const;

export function useRules() {
  return useQuery({
    queryKey: KEY,
    queryFn: api.listRules,
    staleTime: 30_000,
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: RuleWireInput;
      idempotencyKey: string;
    }) => api.createRule(input, idempotencyKey),
    onSuccess: (created: RulePublic) => {
      qc.setQueryData<RulePublic[]>(KEY, (prev) =>
        prev ? [...prev, created] : [created],
      );
    },
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RuleWireInput> }) =>
      api.updateRule(id, patch),
    onSuccess: (updated: RulePublic) => {
      qc.setQueryData<RulePublic[]>(KEY, (prev) =>
        prev?.map((r) => (r.id === updated.id ? updated : r)),
      );
    },
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRule(id),
    onSuccess: (_v, id) => {
      qc.setQueryData<RulePublic[]>(KEY, (prev) => prev?.filter((r) => r.id !== id));
    },
  });
}
