import { apiFetch } from '../../shared/api/client';

export interface CategoryPublic {
  id: string;
  name: string;
  color: string;
  isSystemDefault: boolean;
  parentCategoryId: string | null;
  createdAt: string;
}

export interface CategoryFormInput {
  name: string;
  color: string;
  parentCategoryId: string | null;
}

interface DataWrap<T> {
  data: T;
}

export async function listCategories(): Promise<CategoryPublic[]> {
  const res = await apiFetch<DataWrap<CategoryPublic[]>>('/api/v1/categories');
  return res.data;
}

export async function createCategory(
  input: CategoryFormInput,
  idempotencyKey: string,
): Promise<CategoryPublic> {
  const res = await apiFetch<DataWrap<CategoryPublic>>('/api/v1/categories', {
    method: 'POST',
    json: input,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return res.data;
}

export async function updateCategory(
  id: string,
  patch: Partial<CategoryFormInput>,
): Promise<CategoryPublic> {
  const res = await apiFetch<DataWrap<CategoryPublic>>(`/api/v1/categories/${id}`, {
    method: 'PATCH',
    json: patch,
  });
  return res.data;
}

export async function deleteCategory(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/categories/${id}`, { method: 'DELETE' });
}
