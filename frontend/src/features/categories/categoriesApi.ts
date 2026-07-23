import { apiFetch } from '../../shared/api/client';

export interface CategoryPublic {
  id: string;
  name: string;
  color: string;
  isSystemDefault: boolean;
  createdAt: string;
}

interface ListResponse {
  data: CategoryPublic[];
}

export async function listCategories(): Promise<CategoryPublic[]> {
  const res = await apiFetch<ListResponse>('/api/v1/categories');
  return res.data;
}
