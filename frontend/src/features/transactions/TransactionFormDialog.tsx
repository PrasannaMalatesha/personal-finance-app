import { useEffect, useMemo, useState } from 'react';
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
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError } from '../../shared/api/client';
import { todayIso } from '../../shared/lib/format';
import type { AccountPublic } from '../accounts/schemas';
import type { CategoryPublic } from '../categories/categoriesApi';
import {
  TransactionFormSchema,
  type TransactionFormInput,
  type TransactionPublic,
} from './schemas';
import {
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from './useTransactions';

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: readonly AccountPublic[];
  categories: readonly CategoryPublic[];
  editing?: TransactionPublic | null;
  defaultAccountId?: string;
}

const UNCATEGORIZED = '__UNCATEGORIZED__';

export function TransactionFormDialog({
  open,
  onClose,
  accounts,
  categories,
  editing,
  defaultAccountId,
}: Props) {
  const mode = editing ? 'edit' : 'create';
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const del = useDeleteTransaction();
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const initialAccountId = editing?.accountId ?? defaultAccountId ?? accounts[0]?.id ?? '';

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormInput>({
    resolver: zodResolver(TransactionFormSchema),
    defaultValues: {
      accountId: initialAccountId,
      date: editing?.date ?? todayIso(),
      description: editing?.description ?? '',
      amount: editing?.amount ?? '',
      categoryId: editing?.categoryId ?? '',
    },
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
    reset({
      accountId: editing?.accountId ?? defaultAccountId ?? accounts[0]?.id ?? '',
      date: editing?.date ?? todayIso(),
      description: editing?.description ?? '',
      amount: editing?.amount ?? '',
      categoryId: editing?.categoryId ?? '',
    });
  }, [open, editing, defaultAccountId, accounts, reset]);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

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
      if (err instanceof ApiError && err.status === 404) {
        setError('Selected account or category no longer exists');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    }
  });

  const onDelete = async () => {
    if (!editing) return;
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await del.mutateAsync(editing.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <form onSubmit={onSubmit} noValidate>
        <DialogTitle>{mode === 'edit' ? 'Edit transaction' : 'Add transaction'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <Controller
              control={control}
              name="accountId"
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Account"
                  fullWidth
                  error={Boolean(errors.accountId)}
                  helperText={errors.accountId?.message}
                >
                  {accounts.map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {a.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />

            <TextField
              {...register('date')}
              type="date"
              label="Date"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              error={Boolean(errors.date)}
              helperText={errors.date?.message}
            />

            <TextField
              {...register('description')}
              label="Description"
              autoFocus={mode === 'create'}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              error={Boolean(errors.description)}
              helperText={errors.description?.message}
            />

            <TextField
              {...register('amount')}
              label="Amount"
              placeholder="-450.00"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              error={Boolean(errors.amount)}
              helperText={
                errors.amount?.message ??
                'Negative for expenses, positive for income (e.g. -450.00 or 2500).'
              }
            />

            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Category"
                  value={field.value === '' ? UNCATEGORIZED : field.value}
                  onChange={(e) =>
                    field.onChange(e.target.value === UNCATEGORIZED ? '' : e.target.value)
                  }
                  fullWidth
                >
                  <MenuItem value={UNCATEGORIZED}>
                    <Typography color="text.secondary">Uncategorized</Typography>
                  </MenuItem>
                  {sortedCategories.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
          {mode === 'edit' ? (
            <Button color="error" onClick={onDelete} disabled={del.isPending}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Stack direction="row" spacing={1}>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : mode === 'edit' ? 'Save' : 'Add'}
            </Button>
          </Stack>
        </DialogActions>
      </form>
    </Dialog>
  );
}
