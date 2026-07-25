import { apiFetch } from '../../shared/api/client';
import type { RulePublic, RuleWireInput } from './schemas';

interface DataWrap<T> {
  data: T;
}

export async function listRules(): Promise<RulePublic[]> {
  const res = await apiFetch<DataWrap<RulePublic[]>>('/api/v1/rules');
  return res.data;
}

export async function createRule(
  input: RuleWireInput,
  idempotencyKey: string,
): Promise<RulePublic> {
  const res = await apiFetch<DataWrap<RulePublic>>('/api/v1/rules', {
    method: 'POST',
    json: input,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return res.data;
}

export async function updateRule(
  id: string,
  patch: Partial<RuleWireInput>,
): Promise<RulePublic> {
  const res = await apiFetch<DataWrap<RulePublic>>(`/api/v1/rules/${id}`, {
    method: 'PATCH',
    json: patch,
  });
  return res.data;
}

export async function deleteRule(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/rules/${id}`, { method: 'DELETE' });
}
