import { useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../../shared/components/EmptyState';
import { useAuth } from '../auth/useAuth';
import { useAccounts } from '../accounts/useAccounts';
import { MonthPicker } from '../budgets/MonthPicker';
import { currentMonth } from '../budgets/schemas';
import { SummaryCard } from './SummaryCard';
import { ByCategoryPie } from './ByCategoryPie';
import { TrendLine } from './TrendLine';
import { useByCategory, useSummary, useTrend } from './useDashboard';

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currency = user?.baseCurrency ?? 'USD';
  const accounts = useAccounts();
  const [month, setMonth] = useState<string>(currentMonth);

  const summary = useSummary(month);
  const byCategory = useByCategory(month);
  const trend = useTrend(6);

  const zeroAccounts = accounts.data && accounts.data.length === 0;
  const anyError = summary.error ?? byCategory.error ?? trend.error;
  const anyPending = summary.isPending || byCategory.isPending || trend.isPending;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="h4" component="h1">
            Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This month at a glance, plus your last six months of activity.
          </Typography>
        </Stack>
        {!zeroAccounts && <MonthPicker value={month} onChange={setMonth} />}
      </Stack>

      {zeroAccounts && (
        <EmptyState
          icon={<AccountBalanceWalletOutlinedIcon />}
          title="Add your first account"
          description="Create an account, then add transactions manually or import a CSV. The dashboard will fill in as you go."
          action={{ label: 'Add account', onClick: () => navigate('/accounts') }}
        />
      )}

      {!zeroAccounts && anyError && (
        <Alert severity="error">{(anyError as Error).message}</Alert>
      )}

      {!zeroAccounts && anyPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {!zeroAccounts && summary.data && byCategory.data && trend.data && (
        <Stack spacing={2}>
          <SummaryCard summary={summary.data} currency={currency} />
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' },
            }}
          >
            <ByCategoryPie data={byCategory.data} currency={currency} />
            <TrendLine data={trend.data} currency={currency} />
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
