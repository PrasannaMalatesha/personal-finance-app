import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './recurringApi';
import type { RecurringGroupPublic } from './schemas';

const KEY = ['recurring'] as const;

export function useRecurring() {
  return useQuery({
    queryKey: KEY,
    queryFn: api.listRecurring,
    staleTime: 30_000,
  });
}

export function useRunDetection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.runDetection(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDismissRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.dismissRecurring(id),
    onSuccess: (updated: RecurringGroupPublic) => {
      qc.setQueryData<RecurringGroupPublic[]>(KEY, (prev) =>
        prev?.map((g) => (g.id === updated.id ? updated : g)),
      );
    },
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRecurring(id),
    onSuccess: (_v, id) => {
      qc.setQueryData<RecurringGroupPublic[]>(KEY, (prev) =>
        prev?.filter((g) => g.id !== id),
      );
    },
  });
}
