import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../auth/useAuth';
import { flags } from '../../flags';
import { BASE_CURRENCIES } from '../auth/schemas';
import { ApiError } from '../../shared/api/client';
import {
  useChangePassword,
  useDeleteAccount,
  useUnlinkGoogle,
  useUpdateProfile,
} from './useSettings';

function ProfileSection() {
  const { user } = useAuth();
  const update = useUpdateProfile();
  const [currency, setCurrency] = useState(user?.baseCurrency ?? 'USD');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const save = async () => {
    setMsg(null);
    try {
      await update.mutateAsync({ baseCurrency: currency });
      setMsg({ kind: 'ok', text: 'Profile updated' });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' });
    }
  };

  return (
    <Card variant="outlined">
      <CardHeader title="Profile" />
      <CardContent>
        <Stack spacing={2.5}>
          {msg && <Alert severity={msg.kind === 'ok' ? 'success' : 'error'}>{msg.text}</Alert>}
          <TextField
            label="Email"
            value={user?.email ?? ''}
            fullWidth
            disabled
            helperText="Contact support to change your email."
          />
          <TextField
            select
            label="Base currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as typeof currency)}
            fullWidth
            helperText="Balances and budgets display in this currency."
          >
            {BASE_CURRENCIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
          <Box>
            <Button
              variant="contained"
              onClick={save}
              disabled={update.isPending || currency === user?.baseCurrency}
            >
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function PasswordSection() {
  const { user } = useAuth();
  const change = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const isSetMode = user?.hasPassword === false;

  const submit = async () => {
    setMsg(null);
    try {
      await change.mutateAsync({
        currentPassword: isSetMode ? undefined : currentPassword,
        newPassword,
      });
      setMsg({
        kind: 'ok',
        text: isSetMode
          ? 'Password set — you can now log in with email + password.'
          : 'Password changed. Please log in again.',
      });
      setCurrentPassword('');
      setNewPassword('');
      // Server revoked the session on change; force reload so ProtectedRoute
      // sends the user to /login.
      if (!isSetMode) {
        setTimeout(() => window.location.assign('/login'), 800);
      }
    } catch (err) {
      const text =
        err instanceof ApiError && err.status === 401
          ? 'Current password is incorrect.'
          : err instanceof Error
            ? err.message
            : 'Failed';
      setMsg({ kind: 'err', text });
    }
  };

  return (
    <Card variant="outlined">
      <CardHeader
        title={isSetMode ? 'Set a password' : 'Change password'}
        subheader={
          isSetMode
            ? 'Add a password so you can sign in without Google.'
            : 'You will be signed out on other devices after changing.'
        }
      />
      <CardContent>
        <Stack spacing={2.5}>
          {msg && <Alert severity={msg.kind === 'ok' ? 'success' : 'error'}>{msg.text}</Alert>}
          {!isSetMode && (
            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              fullWidth
            />
          )}
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText="At least 8 characters."
            fullWidth
          />
          <Box>
            <Button
              variant="contained"
              onClick={submit}
              disabled={
                change.isPending ||
                newPassword.length < 8 ||
                (!isSetMode && currentPassword.length === 0)
              }
            >
              {change.isPending ? 'Saving…' : isSetMode ? 'Set password' : 'Change password'}
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function GoogleSection() {
  const { user } = useAuth();
  const unlink = useUnlinkGoogle();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  const startHref = `${apiBase.replace(/\/$/, '')}/api/v1/auth/oauth/google/start`;

  const doUnlink = async () => {
    if (!window.confirm('Unlink your Google account? You can re-link any time.')) return;
    setMsg(null);
    try {
      await unlink.mutateAsync();
      setMsg({ kind: 'ok', text: 'Google account unlinked.' });
    } catch (err) {
      const text =
        err instanceof ApiError && err.status === 400
          ? 'Set a password first — otherwise unlinking would lock you out.'
          : err instanceof Error
            ? err.message
            : 'Failed';
      setMsg({ kind: 'err', text });
    }
  };

  return (
    <Card variant="outlined">
      <CardHeader
        title="Google"
        subheader="Sign in with Google in addition to (or instead of) your password."
      />
      <CardContent>
        <Stack spacing={2}>
          {msg && <Alert severity={msg.kind === 'ok' ? 'success' : 'error'}>{msg.text}</Alert>}
          {user?.hasGoogle ? (
            <Stack direction="row" alignItems="center" spacing={2}>
              <Chip label="Linked" color="success" size="small" />
              <Button
                variant="outlined"
                color="error"
                onClick={doUnlink}
                disabled={unlink.isPending}
              >
                {unlink.isPending ? 'Unlinking…' : 'Unlink Google'}
              </Button>
            </Stack>
          ) : (
            <Box>
              <Button variant="outlined" component="a" href={startHref}>
                Link Google account
              </Button>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function DangerZoneSection() {
  const { user } = useAuth();
  const del = useDeleteAccount();
  const navigate = useNavigate();
  const [confirmEmail, setConfirmEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setMsg(null);
    try {
      await del.mutateAsync(confirmEmail.trim().toLowerCase());
      navigate('/login', { replace: true });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <Card variant="outlined" sx={{ borderColor: 'error.main' }}>
      <CardHeader
        title="Delete account"
        titleTypographyProps={{ color: 'error' }}
        subheader="Permanently removes your account, transactions, budgets, and everything else. Cannot be undone."
      />
      <CardContent>
        <Stack spacing={2}>
          {msg && <Alert severity="error">{msg}</Alert>}
          <TextField
            label={`Type your email (${user?.email}) to confirm`}
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            fullWidth
          />
          <Box>
            <Button
              variant="contained"
              color="error"
              onClick={submit}
              disabled={del.isPending || confirmEmail.trim().toLowerCase() !== user?.email}
            >
              {del.isPending ? 'Deleting…' : 'Delete my account'}
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h1">
          Settings
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Profile, password, connected accounts, and account deletion.
        </Typography>
      </Stack>

      <ProfileSection />
      <PasswordSection />
      {flags.oauth && <GoogleSection />}
      <DangerZoneSection />
    </Stack>
  );
}
