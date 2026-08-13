import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError } from '../../shared/api/client';
import { flags } from '../../flags';
import { useAuth } from '../auth/useAuth';
import { BASE_CURRENCIES } from '../auth/schemas';
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  AccountFormSchema,
  type AccountFormInput,
  type AccountPublic,
} from './schemas';
import { useCreateAccount, useUpdateAccount } from './useAccounts';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: AccountPublic | null;
}

/**
 * Reused for both create and edit. In create mode we generate an
 * Idempotency-Key at form mount so retrying the same submit doesn't
 * double-write (PRD §5.1, TRD §7.2).
 */
export function AccountFormDialog({ open, onClose, editing }: Props) {
  const mode = editing ? 'edit' : 'create';
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const { user } = useAuth();
  const baseCurrency = user?.baseCurrency ?? 'USD';
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormInput>({
    resolver: zodResolver(AccountFormSchema),
    defaultValues: {
      name: '',
      type: 'checking',
      openingBalance: '0',
      currency: baseCurrency,
    },
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
    reset({
      name: editing?.name ?? '',
      type: editing?.type ?? 'checking',
      openingBalance: editing?.openingBalance ?? '0',
      currency: editing?.currency ?? baseCurrency,
    });
  }, [open, editing, reset, baseCurrency]);

  const onSubmit = handleSubmit(async (input) => {
    setError(null);
    // Backend rejects unknown fields on PATCH (no currency change allowed
    // post-create); drop it for updates and when the flag is off.
    const payload: AccountFormInput = flags.multiCurrency
      ? input
      : { ...input, currency: undefined };
    try {
      if (editing) {
        // Backend rejects unknown fields on PATCH; strip currency (immutable
        // post-create) before sending.
        const patch: Omit<AccountFormInput, 'currency'> = {
          name: payload.name,
          type: payload.type,
          openingBalance: payload.openingBalance,
        };
        await update.mutateAsync({ id: editing.id, patch });
      } else {
        await create.mutateAsync({ input: payload, idempotencyKey });
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('An account with that name already exists');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    }
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <form onSubmit={onSubmit} noValidate>
        <DialogTitle>{mode === 'edit' ? 'Edit account' : 'Add account'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              {...register('name')}
              label="Name"
              autoFocus
              fullWidth
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
            />
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Type"
                  fullWidth
                  error={Boolean(errors.type)}
                  helperText={errors.type?.message}
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <TextField
              {...register('openingBalance')}
              label="Opening balance"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              error={Boolean(errors.openingBalance)}
              helperText={
                errors.openingBalance?.message ??
                'Starting balance for this account. Can be edited later.'
              }
            />
            {flags.multiCurrency && !editing && (
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Currency"
                    fullWidth
                    error={Boolean(errors.currency)}
                    helperText={
                      errors.currency?.message ??
                      "Locked once the account is created — sets this account's native currency."
                    }
                  >
                    {BASE_CURRENCIES.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : mode === 'edit' ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
