import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './importsApi';
import type { CommitRowEdit } from './schemas';

const LIST_KEY = ['imports'] as const;

export function useImports() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () => api.listImports(),
    staleTime: 15_000,
  });
}

export function usePreviewImport() {
  return useMutation({
    mutationFn: ({ accountId, file }: { accountId: string; file: File }) =>
      api.previewImport(accountId, file),
  });
}

export function useCommitImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: { previewToken: string; filename: string; rows: CommitRowEdit[] };
      idempotencyKey: string;
    }) => api.commitImport(input, idempotencyKey),
    onSuccess: () => {
      // The commit lands N transactions + one batch row.
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useUndoImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => api.undoImport(batchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
