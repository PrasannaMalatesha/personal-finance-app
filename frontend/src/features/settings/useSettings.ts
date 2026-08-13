import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from './settingsApi';
import type { AuthUser } from '../auth/schemas';

const ME_KEY = ['auth', 'me'] as const;

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateProfile,
    onSuccess: (user: AuthUser) => {
      qc.setQueryData(ME_KEY, user);
      // Base-currency-driven views need a refresh.
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: api.changePassword });
}

export function useUnlinkGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.unlinkGoogle,
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null);
      qc.clear();
    },
  });
}
