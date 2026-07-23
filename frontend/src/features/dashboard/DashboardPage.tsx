import { Stack, Typography } from '@mui/material';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../../shared/components/EmptyState';
import { useAccounts } from '../accounts/useAccounts';

export function DashboardPage() {
  const navigate = useNavigate();
  const accounts = useAccounts();
  const zeroAccounts = accounts.data && accounts.data.length === 0;

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h1">
          Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your monthly summary, spending by category, and 6-month trend land here on Day 12.
        </Typography>
      </Stack>

      {zeroAccounts ? (
        <EmptyState
          icon={<AccountBalanceWalletOutlinedIcon />}
          title="Add your first account"
          description="Create an account, then add transactions manually or import a CSV. The dashboard will fill in as you go."
          action={{ label: 'Add account', onClick: () => navigate('/accounts') }}
        />
      ) : (
        <EmptyState
          icon={<ReceiptLongOutlinedIcon />}
          title="Dashboard placeholder"
          description="Real dashboard widgets land on Day 12 per TRD §10. In the meantime, add transactions from the Transactions page."
          action={{
            label: 'Go to transactions',
            onClick: () => navigate('/transactions'),
          }}
        />
      )}
    </Stack>
  );
}
