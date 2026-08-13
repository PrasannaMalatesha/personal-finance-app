import { useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { AuthShell } from '../../shared/components/AuthShell';
import { ApiError } from '../../shared/api/client';
import { flags } from '../../flags';
import { LoginSchema, type LoginInput } from './schemas';
import { useLogin } from './useAuth';
import { GoogleSignInButton } from './GoogleSignInButton';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Set by ResetPasswordPage after a successful reset — one-time success
  // banner so the user knows why they're back at the login screen.
  const params = new URLSearchParams(location.search);
  const resetSuccess = params.get('reset') === 'success';
  const oauthErr = params.get('error');
  const oauthErrorMessage =
    oauthErr === 'oauth_cancelled'
      ? 'Google sign-in was cancelled.'
      : oauthErr === 'oauth_failed'
        ? "Couldn't complete Google sign-in. Please try again."
        : null;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    mode: 'onBlur',
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (input) => {
    setSubmitError(null);
    try {
      await login.mutateAsync(input);
      const from = (location.state as LocationState | null)?.from ?? '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSubmitError('Email or password is incorrect');
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Something went wrong. Please try again.');
      }
    }
  });

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your Personal Finance account"
      footer={
        <>
          Don't have an account?{' '}
          <Link component={RouterLink} to="/signup">
            Sign up
          </Link>
        </>
      }
    >
      <Box component="form" noValidate onSubmit={onSubmit}>
        <Stack spacing={2.5}>
          {resetSuccess && (
            <Alert severity="success">
              Password updated — log in with your new password.
            </Alert>
          )}
          {submitError && <Alert severity="error">{submitError}</Alert>}
          {oauthErrorMessage && <Alert severity="warning">{oauthErrorMessage}</Alert>}

          <TextField
            {...register('email')}
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            fullWidth
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
          />

          <TextField
            {...register('password')}
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            fullWidth
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((s) => !s)}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Logging in…' : 'Log in'}
          </Button>

          {flags.passwordReset && (
            <Box sx={{ textAlign: 'center' }}>
              <Link component={RouterLink} to="/forgot-password" variant="body2">
                Forgot your password?
              </Link>
            </Box>
          )}

          {flags.oauth && <GoogleSignInButton label="Continue with Google" />}
        </Stack>
      </Box>
    </AuthShell>
  );
}
