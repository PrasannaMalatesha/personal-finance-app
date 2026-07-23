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
    defaultValues: { name: '', type: 'checking', openingBalance: '0' },
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
    reset({
      name: editing?.name ?? '',
      type: editing?.type ?? 'checking',
      openingBalance: editing?.openingBalance ?? '0',
    });
  }, [open, editing, reset]);

  const onSubmit = handleSubmit(async (input) => {
    setError(null);
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: input });
      } else {
        await create.mutateAsync({ input, idempotencyKey });
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
