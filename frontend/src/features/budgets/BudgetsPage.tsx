import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import { EmptyState } from '../../shared/components/EmptyState';
import { useAuth } from '../auth/useAuth';
import { useCategories } from '../categories/useCategories';
import { BudgetCard } from './BudgetCard';
import { BudgetFormDialog } from './BudgetFormDialog';
import { MonthPicker } from './MonthPicker';
import { currentMonth, type BudgetPublic } from './schemas';
import { useBudgets, useDeleteBudget } from './useBudgets';

export function BudgetsPage() {
  const { user } = useAuth();
  const currency = user?.baseCurrency ?? 'USD';

  const [month, setMonth] = useState<string>(currentMonth);
  const budgets = useBudgets(month);
  const categories = useCategories();
  const del = useDeleteBudget(month);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetPublic | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (b: BudgetPublic) => {
    setEditing(b);
    setDialogOpen(true);
  };
  const handleDelete = (b: BudgetPublic) => {
    if (window.confirm(`Delete the "${b.categoryName}" budget for this month?`)) {
      del.mutate(b.budgetId);
    }
  };

  const noCategories = categories.data && categories.data.length === 0;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="h4" component="h1">
            Budgets
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Set a monthly cap per category and track how you&apos;re tracking against it.
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={2}>
          <MonthPicker value={month} onChange={setMonth} />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreate}
            disabled={Boolean(noCategories)}
          >
            Add budget
          </Button>
        </Stack>
      </Stack>

      {(budgets.isError || categories.isError) && (
        <Alert severity="error">
          {(budgets.error ?? categories.error)?.message}
        </Alert>
      )}

      {(budgets.isPending || categories.isPending) && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {noCategories && (
        <EmptyState
          icon={<SavingsOutlinedIcon />}
          title="No categories to budget for"
          description="Categories are seeded on signup. If you see this, add one first."
        />
      )}

      {!noCategories && budgets.data && budgets.data.length === 0 && (
        <EmptyState
          icon={<SavingsOutlinedIcon />}
          title="No budgets set for this month"
          description="Set a monthly cap for a category to see your spending against it here."
          action={{ label: 'Add budget', onClick: openCreate }}
        />
      )}

      {budgets.data && budgets.data.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
            },
          }}
        >
          {budgets.data.map((b) => (
            <BudgetCard
              key={b.budgetId}
              budget={b}
              currency={currency}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </Box>
      )}

      <BudgetFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        month={month}
        categories={categories.data ?? []}
        existing={budgets.data ?? []}
        editing={editing}
      />
    </Stack>
  );
}
