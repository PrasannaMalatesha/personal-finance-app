import { apiFetch } from '../../shared/api/client';
import type { AuthUser, LoginInput, SignupInput } from './schemas';

interface UserResponse {
  data: {
    user: AuthUser;
  };
}

export async function signup(input: SignupInput): Promise<AuthUser> {
  const res = await apiFetch<UserResponse>('/api/v1/auth/signup', {
    method: 'POST',
    json: input,
  });
  return res.data.user;
}

export async function login(input: LoginInput): Promise<AuthUser> {
  const res = await apiFetch<UserResponse>('/api/v1/auth/login', {
    method: 'POST',
    json: input,
  });
  return res.data.user;
}

export async function logout(): Promise<void> {
  await apiFetch<void>('/api/v1/auth/logout', { method: 'POST' });
}

export async function me(): Promise<AuthUser> {
  const res = await apiFetch<UserResponse>('/api/v1/auth/me');
  return res.data.user;
}
