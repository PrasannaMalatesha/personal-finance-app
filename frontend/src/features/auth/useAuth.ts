import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/client';
import * as authApi from './authApi';
import type { AuthUser, LoginInput, SignupInput } from './schemas';

const ME_KEY = ['auth', 'me'] as const;

/**
 * Central source of truth for "is the user logged in?"
 * - `user` is the /me response
 * - `isPending` covers the initial fetch (before we know either way)
 * - 401 is expected when logged out — we don't retry on it and we treat it
 *   as `user: null` rather than an error, which keeps callers simple.
 */
export function useAuth() {
  const query = useQuery<AuthUser | null, ApiError>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
    retry: (_count, err) => !(err instanceof ApiError && err.status === 401),
  });

  return {
    user: query.data ?? null,
    isPending: query.isPending,
    error: query.error,
  };
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    // Wrap to enforce single-arg semantics — TanStack Query v5 also passes a
    // mutation context object as a second parameter that we don't need.
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user);
    },
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SignupInput) => authApi.signup(input),
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      // Clear the entire cache — every server-state read is stale post-logout,
      // and it's cheaper to discard than to invalidate every query key we've
      // ever used.
      queryClient.setQueryData(ME_KEY, null);
      queryClient.removeQueries();
    },
  });
}

export type { LoginInput, SignupInput };
