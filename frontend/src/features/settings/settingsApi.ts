import { apiFetch } from '../../shared/api/client';
import type { AuthUser, BaseCurrency } from '../auth/schemas';

export async function updateProfile(input: {
  baseCurrency?: BaseCurrency;
}): Promise<AuthUser> {
  const res = await apiFetch<{ data: AuthUser }>('/api/v1/auth/me', {
    method: 'PATCH',
    json: input,
  });
  return res.data;
}

export async function changePassword(input: {
  currentPassword?: string;
  newPassword: string;
}): Promise<void> {
  await apiFetch<void>('/api/v1/auth/change-password', {
    method: 'POST',
    json: input,
  });
}

export async function unlinkGoogle(): Promise<void> {
  await apiFetch<void>('/api/v1/auth/oauth/google/link', { method: 'DELETE' });
}

export async function deleteAccount(confirmEmail: string): Promise<void> {
  await apiFetch<void>('/api/v1/auth/me', {
    method: 'DELETE',
    json: { confirmEmail },
  });
}
