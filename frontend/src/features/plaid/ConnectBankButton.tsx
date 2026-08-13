import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, CircularProgress } from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { usePlaidLink, type PlaidLinkOnSuccess } from 'react-plaid-link';
import { useCreateLinkToken, useExchangePublicToken } from './usePlaid';

/**
 * Two-step flow driven by Plaid Link:
 *   1. Mint a short-lived `link_token` from our backend.
 *   2. Hand it to `react-plaid-link`; user completes bank auth in-modal.
 *   3. Link's onSuccess returns a `public_token` — we POST it to
 *      /api/v1/plaid/exchange, backend swaps it for an access_token and
 *      does the first sync.
 *
 * The button stays disabled while a link_token is being minted or the
 * Plaid iframe hasn't finished loading; state is entirely local.
 */
export function ConnectBankButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createToken = useCreateLinkToken();
  const exchange = useExchangePublicToken();

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken) => {
      setError(null);
      if (!publicToken) {
        setLinkToken(null);
        return;
      }
      try {
        await exchange.mutateAsync(publicToken);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to link bank');
      } finally {
        setLinkToken(null);
      }
    },
    [exchange],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => setLinkToken(null),
  });

  // Auto-open the Link modal as soon as we have a token AND the SDK reports
  // ready — otherwise the user would have to click twice.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const busy = createToken.isPending || exchange.isPending;

  const start = async () => {
    setError(null);
    try {
      const { linkToken: t } = await createToken.mutateAsync();
      setLinkToken(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start bank connection');
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={busy ? <CircularProgress size={16} /> : <AccountBalanceIcon />}
        onClick={start}
        disabled={busy}
      >
        {busy ? 'Connecting…' : 'Connect a bank'}
      </Button>
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </>
  );
}
