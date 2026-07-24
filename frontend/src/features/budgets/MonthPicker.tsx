import { IconButton, Stack, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { formatMonthLabel, shiftMonth } from './schemas';

/**
 * Prev / label / next control for a YYYY-MM value. Timezone-naive on purpose
 * (TRD §15.4) — the label is computed with UTC to avoid a day-of-month drift.
 */
export function MonthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <IconButton
        size="small"
        onClick={() => onChange(shiftMonth(value, -1))}
        aria-label="Previous month"
      >
        <ChevronLeftIcon fontSize="small" />
      </IconButton>
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: 600, minWidth: 130, textAlign: 'center' }}
      >
        {formatMonthLabel(value)}
      </Typography>
      <IconButton
        size="small"
        onClick={() => onChange(shiftMonth(value, 1))}
        aria-label="Next month"
      >
        <ChevronRightIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}
