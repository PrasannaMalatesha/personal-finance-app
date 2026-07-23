import { apiFetch } from '../../shared/api/client';
import type { AuthUser, LoginInput, SignupInput } from './schemas';

// Backend deliberately uses two shapes:
//   POST /auth/signup + /auth/login → { data: { user, accessToken?, … } }
//   GET  /auth/me                    → { data: user }
// See backend/tests/integration/auth.test.ts for both.
interface WrappedUserResponse {
  data: { user: AuthUser };
}
interface FlatUserResponse {
  data: AuthUser;
}

export async function signup(input: SignupInput): Promise<AuthUser> {
  const res = await apiFetch<WrappedUserResponse>('/api/v1/auth/signup', {
    method: 'POST',
    json: input,
  });
  return res.data.user;
}

export async function login(input: LoginInput): Promise<AuthUser> {
  const res = await apiFetch<WrappedUserResponse>('/api/v1/auth/login', {
    method: 'POST',
    json: input,
  });
  return res.data.user;
}

export async function logout(): Promise<void> {
  await apiFetch<void>('/api/v1/auth/logout', { method: 'POST' });
}

export async function me(): Promise<AuthUser> {
  const res = await apiFetch<FlatUserResponse>('/api/v1/auth/me');
  return res.data;
}
