import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './categoriesApi';
import type { CategoryFormInput, CategoryPublic } from './categoriesApi';

const KEY = ['categories'] as const;

export function useCategories() {
  return useQuery({
    queryKey: KEY,
    queryFn: api.listCategories,
    staleTime: 5 * 60_000,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: CategoryFormInput;
      idempotencyKey: string;
    }) => api.createCategory(input, idempotencyKey),
    onSuccess: (created: CategoryPublic) => {
      qc.setQueryData<CategoryPublic[]>(KEY, (prev) =>
        prev ? [...prev, created] : [created],
      );
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CategoryFormInput> }) =>
      api.updateCategory(id, patch),
    onSuccess: (updated: CategoryPublic) => {
      qc.setQueryData<CategoryPublic[]>(KEY, (prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      );
      // Dashboard slices depend on category names + rollup — invalidate.
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onSuccess: (_v, id) => {
      qc.setQueryData<CategoryPublic[]>(KEY, (prev) => {
        if (!prev) return prev;
        // Remove the deleted category AND clear parent_category_id on its
        // ex-children (matches the backend's ON DELETE SET NULL cascade).
        return prev
          .filter((c) => c.id !== id)
          .map((c) =>
            c.parentCategoryId === id ? { ...c, parentCategoryId: null } : c,
          );
      });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
