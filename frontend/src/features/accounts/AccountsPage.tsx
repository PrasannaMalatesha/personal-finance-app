import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
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
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { EmptyState } from '../../shared/components/EmptyState';
import { MoneyCell } from '../../shared/components/MoneyCell';
import { useAuth } from '../auth/useAuth';
import { useAccounts, useDeleteAccount } from './useAccounts';
import { ACCOUNT_TYPE_LABELS, type AccountPublic } from './schemas';
import { AccountFormDialog } from './AccountFormDialog';

function AccountRowActions({
  account,
  onEdit,
  onDelete,
}: {
  account: AccountPublic;
  onEdit: (a: AccountPublic) => void;
  onDelete: (a: AccountPublic) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  return (
    <>
      <IconButton
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={`More actions for ${account.name}`}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        <MenuItem
          onClick={() => {
            close();
            onEdit(account);
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            onDelete(account);
          }}
          sx={{ color: 'error.main' }}
        >
          Delete
        </MenuItem>
      </Menu>
    </>
  );
}

export function AccountsPage() {
  const { user } = useAuth();
  const currency = user?.baseCurrency ?? 'USD';
  const accounts = useAccounts();
  const del = useDeleteAccount();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccountPublic | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (a: AccountPublic) => {
    setEditing(a);
    setDialogOpen(true);
  };

  const handleDelete = (a: AccountPublic) => {
    if (window.confirm(`Delete "${a.name}"? Its transactions will be removed.`)) {
      del.mutate(a.id);
    }
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="h4" component="h1">
            Accounts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Checking, savings, and credit cards you want to track.
          </Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Add account
        </Button>
      </Stack>

      {accounts.isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {accounts.isError && (
        <Alert severity="error">Couldn&apos;t load accounts: {(accounts.error as Error).message}</Alert>
      )}

      {accounts.data && accounts.data.length === 0 && (
        <EmptyState
          icon={<AccountBalanceWalletOutlinedIcon />}
          title="No accounts yet"
          description="Add your first checking, savings, or credit card account to start tracking transactions."
          action={{ label: 'Add account', onClick: openCreate }}
        />
      )}

      {accounts.data && accounts.data.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Opening balance</TableCell>
                <TableCell align="right">Current balance</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {accounts.data.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{a.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={ACCOUNT_TYPE_LABELS[a.type]}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <MoneyCell amount={a.openingBalance} currency={currency} />
                  </TableCell>
                  <TableCell align="right">
                    <MoneyCell amount={a.currentBalance} currency={currency} />
                  </TableCell>
                  <TableCell align="right" sx={{ width: 40 }}>
                    <AccountRowActions
                      account={a}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <AccountFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
      />
    </Stack>
  );
}
