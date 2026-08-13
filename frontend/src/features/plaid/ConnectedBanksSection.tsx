import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { ConnectBankButton } from './ConnectBankButton';
import { usePlaidItems, useRemoveItem, useSyncItem } from './usePlaid';

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const plaidEnv = (import.meta.env.VITE_PLAID_ENV as string | undefined) ?? 'sandbox';
const envBadgeColor: Record<string, 'default' | 'info' | 'warning'> = {
  sandbox: 'default',
  development: 'info',
  production: 'warning',
};

export function ConnectedBanksSection() {
  const items = usePlaidItems();
  const sync = useSyncItem();
  const remove = useRemoveItem();

  const handleRemove = (id: string, name: string | null) => {
    const label = name ?? 'this bank';
    const ok = window.confirm(
      `Disconnect ${label}? Your imported accounts and transactions will stay, but new transactions won't sync.`,
    );
    if (ok) remove.mutate(id);
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6">Connected banks</Typography>
            <Chip
              label={plaidEnv}
              size="small"
              color={envBadgeColor[plaidEnv] ?? 'default'}
              variant="outlined"
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Import accounts and transactions automatically via Plaid.
          </Typography>
        </Stack>
        <ConnectBankButton />
      </Stack>

      {items.isError && (
        <Alert severity="error">
          Couldn&apos;t load Plaid items: {(items.error as Error).message}
        </Alert>
      )}
      {sync.isError && (
        <Alert severity="error">Sync failed: {(sync.error as Error).message}</Alert>
      )}

      {items.data && items.data.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Institution</TableCell>
                <TableCell>Connected</TableCell>
                <TableCell>Last synced</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.data.map((it) => (
                <TableRow key={it.id} hover>
                  <TableCell>
                    <Chip
                      label={it.institutionName ?? 'Unknown institution'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{formatRelative(it.createdAt)}</TableCell>
                  <TableCell>{formatRelative(it.lastSyncedAt)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
                      <Tooltip title="Sync now">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => sync.mutate(it.id)}
                            disabled={sync.isPending}
                          >
                            {sync.isPending && sync.variables === it.id ? (
                              <CircularProgress size={16} />
                            ) : (
                              <SyncIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Disconnect">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemove(it.id, it.institutionName)}
                            disabled={remove.isPending}
                          >
                            {remove.isPending && remove.variables === it.id ? (
                              <CircularProgress size={16} />
                            ) : (
                              <DeleteOutlineIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {items.data && items.data.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No banks connected yet. Use the sandbox login <code>user_good</code> /
          <code> pass_good</code> to try it out.
        </Typography>
      )}

      {sync.isSuccess && sync.data && (
        <Alert severity="success" onClose={() => sync.reset()}>
          Sync complete — {sync.data.added} added
          {sync.data.modified > 0 ? `, ${sync.data.modified} updated` : ''}
          {sync.data.removed > 0 ? `, ${sync.data.removed} removed` : ''}.
        </Alert>
      )}

      {items.isPending && (
        <Stack direction="row" justifyContent="center" py={2}>
          <CircularProgress size={20} />
        </Stack>
      )}

      <Button size="small" variant="text" href="https://plaid.com/docs/link/" target="_blank" rel="noreferrer">
        About Plaid Link
      </Button>
    </Stack>
  );
}
