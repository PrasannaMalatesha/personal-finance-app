import { apiFetch } from '../../shared/api/client';
import type { DetectResult, RecurringGroupPublic } from './schemas';

interface DataWrap<T> {
  data: T;
}

export async function listRecurring(): Promise<RecurringGroupPublic[]> {
  const res = await apiFetch<DataWrap<RecurringGroupPublic[]>>('/api/v1/recurring');
  return res.data;
}

export async function runDetection(): Promise<DetectResult> {
  const res = await apiFetch<DataWrap<DetectResult>>('/api/v1/recurring/detect', {
    method: 'POST',
  });
  return res.data;
}

export async function dismissRecurring(id: string): Promise<RecurringGroupPublic> {
  const res = await apiFetch<DataWrap<RecurringGroupPublic>>(
    `/api/v1/recurring/${id}/dismiss`,
    { method: 'POST' },
  );
  return res.data;
}

export async function deleteRecurring(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/recurring/${id}`, { method: 'DELETE' });
}
