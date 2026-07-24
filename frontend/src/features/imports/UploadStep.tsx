import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { ApiError } from '../../shared/api/client';
import { useAccounts } from '../accounts/useAccounts';
import { usePreviewImport } from './useImports';
import type { PreviewResult } from './schemas';

const MAX_BYTES = 5 * 1024 * 1024; // Backend enforces 5 MB; mirror client-side for a friendlier message.

interface Props {
  onPreview: (result: PreviewResult, ctx: { accountId: string; filename: string }) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function UploadStep({ onPreview }: Props) {
  const accounts = useAccounts();
  const preview = usePreviewImport();

  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const noAccounts = accounts.data && accounts.data.length === 0;

  const handleFile = (f: File | undefined) => {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') {
      setError('Only CSV files are supported');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`File is too large. Max size is ${MAX_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setFile(f);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
  };

  const onSubmit = async () => {
    if (!accountId) {
      setError('Pick an account');
      return;
    }
    if (!file) {
      setError('Choose a CSV file');
      return;
    }
    setError(null);
    try {
      const result = await preview.mutateAsync({ accountId, file });
      onPreview(result, { accountId, filename: file.name });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Preview failed. Please try again.');
      }
    }
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h5" component="h2">
          1. Upload CSV
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Point at the account, drop in the export, then review parsed rows on the next step.
        </Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {noAccounts && (
        <Alert severity="warning">
          Create an account first — imports are per-account.
        </Alert>
      )}

      <TextField
        select
        label="Account"
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        disabled={noAccounts || false}
        slotProps={{ inputLabel: { shrink: Boolean(accountId) } }}
        helperText="Every transaction in the file will belong to this account."
        sx={{ maxWidth: 420 }}
      >
        {(accounts.data ?? []).map((a) => (
          <MenuItem key={a.id} value={a.id}>
            {a.name}
          </MenuItem>
        ))}
      </TextField>

      <Box
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        aria-label="Choose or drop a CSV file"
        sx={{
          border: (t) => `2px dashed ${dragging ? t.palette.primary.main : t.palette.divider}`,
          backgroundColor: dragging ? 'action.hover' : 'background.paper',
          borderRadius: 3,
          p: 5,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 120ms ease',
          '&:hover': { borderColor: 'primary.main', backgroundColor: 'action.hover' },
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={onFileChange}
        />
        <Stack spacing={1} alignItems="center">
          {file ? (
            <>
              <InsertDriveFileOutlinedIcon color="primary" sx={{ fontSize: 40 }} />
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {file.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatFileSize(file.size)} · click or drop to replace
              </Typography>
            </>
          ) : (
            <>
              <CloudUploadOutlinedIcon color="action" sx={{ fontSize: 40 }} />
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                Drop a CSV file here, or click to browse
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Max {MAX_BYTES / 1024 / 1024} MB. HDFC · ICICI · SBI · Chase · BoA · Wells Fargo
                auto-detected; generic column mapper for anything else.
              </Typography>
            </>
          )}
        </Stack>
      </Box>

      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="contained"
          onClick={onSubmit}
          disabled={!accountId || !file || preview.isPending}
        >
          {preview.isPending ? 'Parsing…' : 'Continue'}
        </Button>
      </Stack>
    </Stack>
  );
}
