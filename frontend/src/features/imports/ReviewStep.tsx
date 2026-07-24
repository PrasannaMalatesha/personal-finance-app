import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ApiError } from '../../shared/api/client';
import { MoneyCell } from '../../shared/components/MoneyCell';
import { formatDate } from '../../shared/lib/format';
import { useAuth } from '../auth/useAuth';
import { useCategories } from '../categories/useCategories';
import { useCommitImport } from './useImports';
import type { CommitResult, PreviewResult } from './schemas';

interface Props {
  preview: PreviewResult;
  filename: string;
  onBack: () => void;
  onCommitted: (result: CommitResult) => void;
}

const UNCATEGORIZED = '__UNCATEGORIZED__';

interface RowEditState {
  categoryId: string | null;
  skip: boolean;
}

export function ReviewStep({ preview, filename, onBack, onCommitted }: Props) {
  const { user } = useAuth();
  const currency = user?.baseCurrency ?? 'USD';
  const categories = useCategories();
  const commit = useCommitImport();
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  // Per-row state: keyed by row.index. Duplicates default to skip=true so the
  // safe path is one click ("Import"); users can un-skip individual rows.
  const [rows, setRows] = useState<Map<number, RowEditState>>(() => {
    const m = new Map<number, RowEditState>();
    for (const r of preview.rows) {
      m.set(r.index, { categoryId: r.proposedCategoryId, skip: r.isDuplicate });
    }
    return m;
  });

  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  const sortedCategories = useMemo(
    () => [...(categories.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [categories.data],
  );
  const categoryLookup = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    (categories.data ?? []).forEach((c) => map.set(c.id, { name: c.name, color: c.color }));
    return map;
  }, [categories.data]);

  const importCount = preview.rows.filter((r) => !rows.get(r.index)?.skip).length;
  const skipCount = preview.rows.length - importCount;

  const updateRow = (index: number, patch: Partial<RowEditState>) => {
    setRows((prev) => {
      const next = new Map(prev);
      const current = next.get(index) ?? { categoryId: null, skip: false };
      next.set(index, { ...current, ...patch });
      return next;
    });
  };

  const onCommit = async () => {
    setError(null);
    const edits = preview.rows.map((r) => {
      const s = rows.get(r.index) ?? { categoryId: null, skip: false };
      return {
        index: r.index,
        categoryId: s.categoryId,
        skip: s.skip,
      };
    });
    try {
      const result = await commit.mutateAsync({
        input: { previewToken: preview.previewToken, filename, rows: edits },
        idempotencyKey,
      });
      onCommitted(result);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else if (err instanceof Error) setError(err.message);
      else setError('Import failed. Please try again.');
    }
  };

  const cols = preview.detectedColumns;

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h5" component="h2">
          2. Review and import
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {preview.rows.length} rows parsed from <strong>{filename}</strong>. Toggle skip on
          duplicates, adjust categories, then import.
        </Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center">
          <Chip label={`Preset: ${cols.presetName}`} color="primary" variant="outlined" />
          <Chip label={`Date: ${cols.date}`} size="small" variant="outlined" />
          <Chip label={`Description: ${cols.description}`} size="small" variant="outlined" />
          {cols.amountKind === 'signed' && cols.amount && (
            <Chip label={`Amount: ${cols.amount}`} size="small" variant="outlined" />
          )}
          {cols.amountKind === 'debit-credit' && (
            <>
              <Chip label={`Debit: ${cols.debit}`} size="small" variant="outlined" />
              <Chip label={`Credit: ${cols.credit}`} size="small" variant="outlined" />
            </>
          )}
        </Stack>
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">Skip</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {preview.rows.map((r) => {
              const state = rows.get(r.index) ?? { categoryId: null, skip: false };
              const catId = state.categoryId ?? '';
              return (
                <TableRow
                  key={r.index}
                  sx={{
                    opacity: state.skip ? 0.5 : 1,
                    textDecoration: state.skip ? 'line-through' : 'none',
                  }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={state.skip}
                      onChange={(e) => updateRow(r.index, { skip: e.target.checked })}
                      inputProps={{ 'aria-label': `Skip row ${r.index + 1}` }}
                    />
                  </TableCell>
                  <TableCell>{formatDate(r.date)}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <span>{r.description}</span>
                      {r.isDuplicate && (
                        <Chip
                          label="Duplicate"
                          size="small"
                          color="warning"
                          variant="outlined"
                        />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ minWidth: 180 }}>
                    <Select
                      value={catId === '' ? UNCATEGORIZED : catId}
                      onChange={(e) =>
                        updateRow(r.index, {
                          categoryId:
                            e.target.value === UNCATEGORIZED ? null : (e.target.value as string),
                        })
                      }
                      size="small"
                      fullWidth
                      disabled={state.skip}
                      renderValue={(v) => {
                        if (v === UNCATEGORIZED) {
                          return <span style={{ color: 'var(--mui-palette-text-secondary)' }}>Uncategorized</span>;
                        }
                        const c = categoryLookup.get(v as string);
                        return c ? (
                          <Chip
                            label={c.name}
                            size="small"
                            sx={{
                              backgroundColor: c.color + '22',
                              color: c.color,
                              fontWeight: 500,
                            }}
                          />
                        ) : (
                          (v as string)
                        );
                      }}
                    >
                      <MenuItem value={UNCATEGORIZED}>Uncategorized</MenuItem>
                      {sortedCategories.map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell align="right">
                    <MoneyCell amount={r.amount} currency={currency} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          backgroundColor: 'background.default',
          py: 2,
          borderTop: (t) => `1px solid ${t.palette.divider}`,
        }}
      >
        <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center">
          <Typography variant="body2" color="text.secondary">
            {importCount} will import · {skipCount} skipped
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button onClick={onBack} disabled={commit.isPending}>
              Back
            </Button>
            <Button
              variant="contained"
              onClick={onCommit}
              disabled={importCount === 0 || commit.isPending}
            >
              {commit.isPending
                ? 'Importing…'
                : importCount === 0
                  ? 'Nothing to import'
                  : `Import ${importCount}`}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Stack>
  );
}
