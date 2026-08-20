import { useEffect, useState } from 'react';
import { InputAdornment, MenuItem, Stack, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { AccountPublic } from '../accounts/schemas';
import type { CategoryPublic } from '../categories/categoriesApi';
import type { TransactionsFilters as Filters } from './schemas';

interface Props {
  value: Filters;
  onChange: (next: Filters) => void;
  accounts: readonly AccountPublic[];
  categories: readonly CategoryPublic[];
}

const ALL = '__ALL__';
const UNCATEGORIZED = '__UNCATEGORIZED__';

export function TransactionsFilters({ value, onChange, accounts, categories }: Props) {
  const set = <K extends keyof Filters>(key: K, v: Filters[K]) => {
    const next = { ...value, [key]: v };
    if (v === undefined || v === '') delete next[key];
    onChange(next);
  };

  // Local mirror for the search input so keystrokes stay responsive; commit
  // to the query filter (which triggers a refetch) after a short pause.
  const [searchDraft, setSearchDraft] = useState(value.q ?? '');
  useEffect(() => {
    // Re-sync when the parent resets filters (e.g. "clear all").
    setSearchDraft(value.q ?? '');
  }, [value.q]);
  useEffect(() => {
    const trimmed = searchDraft.trim();
    if (trimmed === (value.q ?? '')) return;
    const t = window.setTimeout(() => set('q', trimmed || undefined), 300);
    return () => window.clearTimeout(t);
    // Only depends on searchDraft — chasing `value.q` would race the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      sx={{
        p: 2,
        border: (t) => `1px solid ${t.palette.divider}`,
        borderRadius: 2,
        backgroundColor: 'background.paper',
      }}
    >
      <TextField
        select
        label="Account"
        value={value.accountId ?? ALL}
        onChange={(e) => set('accountId', e.target.value === ALL ? undefined : e.target.value)}
        sx={{ minWidth: 180 }}
      >
        <MenuItem value={ALL}>All accounts</MenuItem>
        {accounts.map((a) => (
          <MenuItem key={a.id} value={a.id}>
            {a.name}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        label="Category"
        value={value.categoryId ?? ALL}
        onChange={(e) => {
          const v = e.target.value;
          if (v === ALL) set('categoryId', undefined);
          else if (v === UNCATEGORIZED) set('categoryId', UNCATEGORIZED);
          else set('categoryId', v);
        }}
        sx={{ minWidth: 180 }}
        // Backend doesn't yet support "categoryId is null" as a query filter,
        // so the UNCATEGORIZED sentinel is applied client-side in the list.
      >
        <MenuItem value={ALL}>All categories</MenuItem>
        <MenuItem value={UNCATEGORIZED}>Uncategorized</MenuItem>
        {categories.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        type="date"
        label="From"
        value={value.from ?? ''}
        onChange={(e) => set('from', e.target.value || undefined)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        type="date"
        label="To"
        value={value.to ?? ''}
        onChange={(e) => set('to', e.target.value || undefined)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        // type="search" gives the browser's native clear-X affordance +
        // Enter-to-submit semantics; the debounce already commits on pause,
        // so both interaction paths land on the same handler.
        type="search"
        label="Search"
        placeholder="e.g. starbucks"
        value={searchDraft}
        onChange={(e) => setSearchDraft(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="disabled" />
              </InputAdornment>
            ),
          },
        }}
        sx={{ flexGrow: 1, minWidth: 200 }}
      />
    </Stack>
  );
}

export const UNCATEGORIZED_SENTINEL = UNCATEGORIZED;
