import { apiFetch } from '../../shared/api/client';
import type { AccountFormInput, AccountPublic } from './schemas';

interface ListResponse {
  data: AccountPublic[];
}

interface OneResponse {
  data: AccountPublic;
}

export async function listAccounts(): Promise<AccountPublic[]> {
  const res = await apiFetch<ListResponse>('/api/v1/accounts');
  return res.data;
}

export async function createAccount(
  input: AccountFormInput,
  idempotencyKey: string,
): Promise<AccountPublic> {
  const res = await apiFetch<OneResponse>('/api/v1/accounts', {
    method: 'POST',
    json: input,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return res.data;
}

export async function updateAccount(
  id: string,
  patch: Partial<AccountFormInput>,
): Promise<AccountPublic> {
  const res = await apiFetch<OneResponse>(`/api/v1/accounts/${id}`, {
    method: 'PATCH',
    json: patch,
  });
  return res.data;
}

export async function deleteAccount(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/accounts/${id}`, { method: 'DELETE' });
}
