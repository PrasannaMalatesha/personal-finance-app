import { useQuery } from '@tanstack/react-query';
import { listCategories } from './categoriesApi';

const KEY = ['categories'] as const;

export function useCategories() {
  return useQuery({
    queryKey: KEY,
    queryFn: listCategories,
    staleTime: 5 * 60_000,
  });
}
