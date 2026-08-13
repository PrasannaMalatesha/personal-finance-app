import { useState } from 'react';
import { Alert, Button, Snackbar, Stack } from '@mui/material';
import type { RuleSuggestion } from './transactionsApi';
import { useLearnRule } from './useTransactions';

interface Props {
  suggestion: RuleSuggestion | null;
  onDismiss: () => void;
}

/**
 * Rule-learning surface. Appears after a manual recategorization when the
 * backend returns a `suggestedRule`. One click creates the rule and
 * back-applies it to the matching count reported by the server.
 */
export function RuleSuggestionSnackbar({ suggestion, onDismiss }: Props) {
  const learn = useLearnRule();
  const [dismissed, setDismissed] = useState(false);

  const open = Boolean(suggestion) && !dismissed;
  const backApplies = (suggestion?.matchingCount ?? 0) > 0;

  const handleAdd = async () => {
    if (!suggestion) return;
    try {
      await learn.mutateAsync({
        pattern: suggestion.pattern,
        categoryId: suggestion.categoryId,
        applyToExisting: backApplies,
      });
    } finally {
      setDismissed(true);
      onDismiss();
    }
  };

  const handleClose = () => {
    setDismissed(true);
    onDismiss();
  };

  if (!suggestion) return null;

  const message = backApplies
    ? `Add auto-rule for "${suggestion.pattern}" → ${suggestion.categoryName}? Applies to ${suggestion.matchingCount} other transaction${suggestion.matchingCount === 1 ? '' : 's'}.`
    : `Add auto-rule for "${suggestion.pattern}" → ${suggestion.categoryName} for future transactions?`;

  return (
    <Snackbar
      open={open}
      onClose={(_e, reason) => {
        if (reason === 'clickaway') return;
        handleClose();
      }}
      autoHideDuration={10_000}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity="info"
        onClose={handleClose}
        action={
          <Stack direction="row" spacing={1}>
            <Button
              color="inherit"
              size="small"
              onClick={handleAdd}
              disabled={learn.isPending}
            >
              {learn.isPending ? 'Adding…' : 'Add rule'}
            </Button>
          </Stack>
        }
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
