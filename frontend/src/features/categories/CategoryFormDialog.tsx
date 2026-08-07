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
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiError } from '../../shared/api/client';
import { useCreateCategory, useUpdateCategory } from './useCategories';
import type { CategoryPublic } from './categoriesApi';

const NO_PARENT = '__none__';

// Same shape the backend Zod schema expects. Sentinel value on the wire is
// converted to null in the mutation.
const CategoryFormSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(64, 'Too long'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a #RRGGBB hex color'),
  parentCategoryId: z.string(),
});
type CategoryFormInput = z.infer<typeof CategoryFormSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  categories: CategoryPublic[];
  editing?: CategoryPublic | null;
}

export function CategoryFormDialog({ open, onClose, categories, editing }: Props) {
  const mode = editing ? 'edit' : 'create';
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormInput>({
    resolver: zodResolver(CategoryFormSchema),
    defaultValues: { name: '', color: '#94a3b8', parentCategoryId: NO_PARENT },
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
    reset({
      name: editing?.name ?? '',
      color: editing?.color ?? '#94a3b8',
      parentCategoryId: editing?.parentCategoryId ?? NO_PARENT,
    });
  }, [open, editing, reset]);

  // Only top-level (parentCategoryId === null) categories are valid parents
  // (depth-2 rule). Also exclude the category being edited — can't be its
  // own parent — and any category that itself has children, since promoting
  // it to a subcategory would create a 3-deep chain.
  const parentOptions = useMemo(() => {
    const withChildren = new Set(
      categories.filter((c) => c.parentCategoryId).map((c) => c.parentCategoryId!),
    );
    return categories
      .filter((c) => c.parentCategoryId === null)
      .filter((c) => c.id !== editing?.id)
      .filter((c) => !(editing && withChildren.has(editing.id) && c.id !== editing.id)
        ? true
        : false);
  }, [categories, editing]);

  // If the category being edited already has children, block picking a parent.
  const editingHasChildren = useMemo(() => {
    if (!editing) return false;
    return categories.some((c) => c.parentCategoryId === editing.id);
  }, [editing, categories]);

  const onSubmit = handleSubmit(async (input) => {
    setError(null);
    const parentCategoryId =
      input.parentCategoryId === NO_PARENT ? null : input.parentCategoryId;
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          patch: { name: input.name, color: input.color, parentCategoryId },
        });
      } else {
        await create.mutateAsync({
          input: { name: input.name, color: input.color, parentCategoryId },
          idempotencyKey,
        });
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('A category with that name already exists');
      } else if (err instanceof ApiError && err.status === 400) {
        setError(err.message);
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
        <DialogTitle>{mode === 'edit' ? 'Edit category' : 'Add category'}</DialogTitle>
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
            <TextField
              {...register('color')}
              label="Color"
              fullWidth
              placeholder="#4fc3f7"
              error={Boolean(errors.color)}
              helperText={errors.color?.message ?? '#RRGGBB hex'}
            />
            <Controller
              control={control}
              name="parentCategoryId"
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Parent category"
                  fullWidth
                  disabled={editingHasChildren}
                  error={Boolean(errors.parentCategoryId)}
                  helperText={
                    errors.parentCategoryId?.message ??
                    (editingHasChildren
                      ? 'This category has children — remove them before nesting it under another.'
                      : 'Leave as “Top-level” to keep it as a root category.')
                  }
                >
                  <MenuItem value={NO_PARENT}>Top-level (no parent)</MenuItem>
                  {parentOptions.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
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
