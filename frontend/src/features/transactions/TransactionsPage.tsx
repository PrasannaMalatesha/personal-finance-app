import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { EmptyState } from '../../shared/components/EmptyState';
import { MoneyCell } from '../../shared/components/MoneyCell';
import { formatDate } from '../../shared/lib/format';
import { useAuth } from '../auth/useAuth';
import { useAccounts } from '../accounts/useAccounts';
import { useCategories } from '../categories/useCategories';
import { useTransactions } from './useTransactions';
import type { TransactionPublic, TransactionsFilters as Filters } from './schemas';
import { TransactionsFilters, UNCATEGORIZED_SENTINEL } from './TransactionsFilters';
import { TransactionFormDialog } from './TransactionFormDialog';

export function TransactionsPage() {
  const { user } = useAuth();
  const currency = user?.baseCurrency ?? 'USD';
  const accounts = useAccounts();
  const categories = useCategories();

  const [filters, setFilters] = useState<Filters>({});
  // Sentinel filter is applied client-side; backend query strips it out.
  const serverFilters: Filters = useMemo(() => {
    const { categoryId, ...rest } = filters;
    if (categoryId === UNCATEGORIZED_SENTINEL) return rest;
    if (categoryId) return { ...rest, categoryId };
    return rest;
  }, [filters]);

  const txQuery = useTransactions(serverFilters);

  const allRows = useMemo(
    () => (txQuery.data ? txQuery.data.pages.flatMap((p) => p.data) : []),
    [txQuery.data],
  );

  // Apply the "Uncategorized" client-side filter when active.
  const visibleRows = useMemo(() => {
    if (filters.categoryId === UNCATEGORIZED_SENTINEL) {
      return allRows.filter((r) => r.categoryId === null);
    }
    return allRows;
  }, [allRows, filters.categoryId]);

  const categoryLookup = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    (categories.data ?? []).forEach((c) => map.set(c.id, { name: c.name, color: c.color }));
    return map;
  }, [categories.data]);
  const accountLookup = useMemo(() => {
    const map = new Map<string, string>();
    (accounts.data ?? []).forEach((a) => map.set(a.id, a.name));
    return map;
  }, [accounts.data]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionPublic | null>(null);
  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (t: TransactionPublic) => {
    setEditing(t);
    setDialogOpen(true);
  };

  const noAccounts = accounts.data && accounts.data.length === 0;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="h4" component="h1">
            Transactions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Filter, edit, and add transactions manually.
          </Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreate}
          disabled={noAccounts}
        >
          Add transaction
        </Button>
      </Stack>

      {(accounts.isError || categories.isError || txQuery.isError) && (
        <Alert severity="error">
          {(accounts.error ?? categories.error ?? txQuery.error)?.message}
        </Alert>
      )}

      {noAccounts && (
        <EmptyState
          icon={<ReceiptLongOutlinedIcon />}
          title="Add an account first"
          description="Transactions belong to an account. Create at least one account, then come back here."
          action={{
            label: 'Go to Accounts',
            onClick: () => {
              // Navigate via a plain link — no need for useNavigate here.
              (document.querySelector('a[data-nav="accounts"]') as HTMLAnchorElement | null)?.click();
            },
          }}
        />
      )}

      {!noAccounts && (
        <TransactionsFilters
          value={filters}
          onChange={setFilters}
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
        />
      )}

      {!noAccounts && txQuery.isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {!noAccounts && txQuery.data && visibleRows.length === 0 && (
        <EmptyState
          icon={<ReceiptLongOutlinedIcon />}
          title="No transactions match"
          description={
            Object.keys(filters).length === 0
              ? 'Add your first transaction manually, or use CSV import on Day 10.'
              : 'Try loosening the filters, or clear them to see everything.'
          }
          action={
            Object.keys(filters).length === 0
              ? { label: 'Add transaction', onClick: openCreate }
              : { label: 'Clear filters', onClick: () => setFilters({}) }
          }
        />
      )}

      {!noAccounts && visibleRows.length > 0 && (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Account</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleRows.map((t) => {
                  const cat = t.categoryId ? categoryLookup.get(t.categoryId) : null;
                  return (
                    <TableRow
                      key={t.id}
                      hover
                      onClick={() => openEdit(t)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>{formatDate(t.date)}</TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{t.description}</TableCell>
                      <TableCell>
                        {cat ? (
                          <Chip
                            label={cat.name}
                            size="small"
                            sx={{
                              backgroundColor: cat.color + '22',
                              color: cat.color,
                              fontWeight: 500,
                            }}
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Uncategorized
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{accountLookup.get(t.accountId) ?? '—'}</TableCell>
                      <TableCell align="right">
                        <MoneyCell amount={t.amount} currency={currency} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {txQuery.hasNextPage && (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Button
                onClick={() => txQuery.fetchNextPage()}
                disabled={txQuery.isFetchingNextPage}
              >
                {txQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </Box>
          )}
        </>
      )}

      {accounts.data && accounts.data.length > 0 && (
        <TransactionFormDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          accounts={accounts.data}
          categories={categories.data ?? []}
          editing={editing}
          defaultAccountId={filters.accountId}
        />
      )}

      {/* Hidden link the empty-state CTA clicks (kept simple to avoid another useNavigate). */}
      <RouterLink to="/accounts" data-nav="accounts" style={{ display: 'none' }}>
        accounts
      </RouterLink>
    </Stack>
  );
}
