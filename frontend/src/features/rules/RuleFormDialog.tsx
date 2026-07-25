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
import type { CategoryPublic } from '../categories/categoriesApi';
import {
  RULE_MATCH_TYPES,
  RULE_MATCH_TYPE_LABELS,
  RuleFormSchema,
  toWire,
  type RuleFormInput,
  type RulePublic,
} from './schemas';
import { useCreateRule, useUpdateRule } from './useRules';

interface Props {
  open: boolean;
  onClose: () => void;
  categories: CategoryPublic[];
  editing?: RulePublic | null;
}

/**
 * Reused for create + edit. Idempotency-Key is generated at dialog open in
 * create mode so a double-click can't double-write (PRD §5.1, TRD §7.2).
 */
export function RuleFormDialog({ open, onClose, categories, editing }: Props) {
  const mode = editing ? 'edit' : 'create';
  const create = useCreateRule();
  const update = useUpdateRule();
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RuleFormInput>({
    resolver: zodResolver(RuleFormSchema),
    defaultValues: {
      matchType: 'substring',
      matchValue: '',
      categoryId: '',
      priority: '100',
    },
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
    reset({
      matchType: editing?.matchType ?? 'substring',
      matchValue: editing?.matchValue ?? '',
      categoryId: editing?.categoryId ?? '',
      priority: String(editing?.priority ?? 100),
    });
  }, [open, editing, reset]);

  const onSubmit = handleSubmit(async (input) => {
    setError(null);
    const wire = toWire(input);
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: wire });
      } else {
        await create.mutateAsync({ input: wire, idempotencyKey });
      }
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
        <DialogTitle>{mode === 'edit' ? 'Edit rule' : 'Add rule'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Controller
              control={control}
              name="matchType"
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="When description"
                  fullWidth
                  error={Boolean(errors.matchType)}
                  helperText={errors.matchType?.message}
                >
                  {RULE_MATCH_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>
                      {RULE_MATCH_TYPE_LABELS[t]}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <TextField
              {...register('matchValue')}
              label="Match value"
              autoFocus
              fullWidth
              placeholder="STARBUCKS"
              error={Boolean(errors.matchValue)}
              helperText={
                errors.matchValue?.message ??
                'Compared case-insensitively against the transaction description.'
              }
            />
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Set category to"
                  fullWidth
                  error={Boolean(errors.categoryId)}
                  helperText={errors.categoryId?.message}
                >
                  {categories.length === 0 && (
                    <MenuItem value="" disabled>
                      No categories yet
                    </MenuItem>
                  )}
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <TextField
              {...register('priority')}
              label="Priority"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              error={Boolean(errors.priority)}
              helperText={
                errors.priority?.message ??
                'Lower numbers run first. Default 100 puts your rule above the seeded defaults.'
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
