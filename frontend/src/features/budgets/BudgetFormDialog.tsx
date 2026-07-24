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
import type { CategoryPublic } from '../categories/categoriesApi';
import {
  BudgetFormSchema,
  formatMonthLabel,
  type BudgetFormInput,
  type BudgetPublic,
} from './schemas';
import { useUpsertBudget } from './useBudgets';

interface Props {
  open: boolean;
  onClose: () => void;
  month: string;
  categories: CategoryPublic[];
  /** Existing budgets in the current month — used to disable already-set categories in create mode. */
  existing: BudgetPublic[];
  editing?: BudgetPublic | null;
}

export function BudgetFormDialog({
  open,
  onClose,
  month,
  categories,
  existing,
  editing,
}: Props) {
  const mode = editing ? 'edit' : 'create';
  const upsert = useUpsertBudget(month);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BudgetFormInput>({
    resolver: zodResolver(BudgetFormSchema),
    defaultValues: { categoryId: '', amountLimit: '' },
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    reset({
      categoryId: editing?.categoryId ?? '',
      amountLimit: editing?.amountLimit ?? '',
    });
  }, [open, editing, reset]);

  const takenCategoryIds = useMemo(
    () => new Set(existing.map((b) => b.categoryId)),
    [existing],
  );

  const onSubmit = handleSubmit(async (input) => {
    setError(null);
    try {
      await upsert.mutateAsync({
        categoryId: input.categoryId,
        amountLimit: input.amountLimit,
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('That category no longer exists');
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
        <DialogTitle>
          {mode === 'edit' ? 'Edit budget' : 'Set a budget'}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {formatMonthLabel(month)}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Category"
                  fullWidth
                  disabled={mode === 'edit'}
                  error={Boolean(errors.categoryId)}
                  helperText={errors.categoryId?.message}
                >
                  {categories.length === 0 && (
                    <MenuItem value="" disabled>
                      No categories yet
                    </MenuItem>
                  )}
                  {categories.map((c) => {
                    // In create mode, block categories that already have a budget
                    // this month. The unique constraint would also catch it, but
                    // pre-empting it is clearer UX than a server error.
                    const taken =
                      mode === 'create' && takenCategoryIds.has(c.id);
                    return (
                      <MenuItem key={c.id} value={c.id} disabled={taken}>
                        {c.name}
                        {taken ? ' (already set)' : ''}
                      </MenuItem>
                    );
                  })}
                </TextField>
              )}
            />
            <TextField
              {...register('amountLimit')}
              label="Monthly limit"
              autoFocus={mode === 'edit'}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              error={Boolean(errors.amountLimit)}
              helperText={
                errors.amountLimit?.message ??
                'The amount you want to cap spending at this month.'
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
