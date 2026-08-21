import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import UndoIcon from '@mui/icons-material/UndoOutlined';
import { EmptyState } from '../../shared/components/EmptyState';
import { PageLoader } from '../../shared/components/PageLoader';
import { useAccounts } from '../accounts/useAccounts';
import { useImports, useUndoImport } from './useImports';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ImportsPage() {
  const navigate = useNavigate();
  const imports = useImports();
  const accounts = useAccounts();
  const undo = useUndoImport();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const accountName = (id: string) =>
    accounts.data?.find((a) => a.id === id)?.name ?? '—';

  const rows = imports.data ?? [];
  const hasRows = rows.length > 0;

  const confirmUndo = async () => {
    if (!confirmId) return;
    await undo.mutateAsync(confirmId);
    setConfirmId(null);
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="h4" component="h1">
            Imports
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Batches of transactions brought in from CSV files. Undo removes the whole batch.
          </Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/imports/new')}
        >
          Import CSV
        </Button>
      </Stack>

      {imports.isError && (
        <Alert severity="error">{imports.error.message}</Alert>
      )}

      {imports.isPending && (
        <PageLoader />
      )}

      {imports.data && !hasRows && (
        <EmptyState
          icon={<UploadFileOutlinedIcon />}
          title="No imports yet"
          description="Import a CSV export from your bank. HDFC, ICICI, SBI, Chase, BoA, and Wells Fargo are auto-detected; anything else falls back to generic column detection."
          action={{
            label: 'Import CSV',
            onClick: () => navigate('/imports/new'),
          }}
        />
      )}

      {hasRows && (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>File</TableCell>
                <TableCell>Account</TableCell>
                <TableCell align="right">Rows</TableCell>
                <TableCell>Imported</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((b) => {
                const isUndone = Boolean(b.undoneAt);
                return (
                  <TableRow key={b.id}>
                    <TableCell sx={{ fontWeight: 500 }}>{b.filename}</TableCell>
                    <TableCell>{accountName(b.accountId)}</TableCell>
                    <TableCell align="right">{b.rowCount}</TableCell>
                    <TableCell>{formatWhen(b.importedAt)}</TableCell>
                    <TableCell>
                      {isUndone ? (
                        <Chip label="Undone" size="small" color="default" />
                      ) : (
                        <Chip label="Live" size="small" color="success" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<UndoIcon />}
                        onClick={() => setConfirmId(b.id)}
                        disabled={isUndone || undo.isPending}
                      >
                        Undo
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={confirmId !== null} onClose={() => setConfirmId(null)}>
        <DialogTitle>Undo this import?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Every transaction from this batch will be deleted. This can't be un-undone —
            you'd have to re-upload the CSV.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmId(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmUndo} disabled={undo.isPending}>
            {undo.isPending ? 'Undoing…' : 'Undo import'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
