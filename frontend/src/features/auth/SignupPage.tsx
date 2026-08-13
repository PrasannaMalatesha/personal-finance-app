import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Link,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { AuthShell } from '../../shared/components/AuthShell';
import { ApiError } from '../../shared/api/client';
import { BASE_CURRENCIES, SignupSchema, type SignupInput } from './schemas';
import { useSignup } from './useAuth';
import { GoogleSignInButton } from './GoogleSignInButton';
import { flags } from '../../flags';

export function SignupPage() {
  const navigate = useNavigate();
  const signup = useSignup();
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(SignupSchema),
    mode: 'onBlur',
    defaultValues: { email: '', password: '', baseCurrency: 'USD' },
  });

  const onSubmit = handleSubmit(async (input) => {
    setSubmitError(null);
    try {
      await signup.mutateAsync(input);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSubmitError('An account with that email already exists');
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Something went wrong. Please try again.');
      }
    }
  });

  return (
    <AuthShell
      title="Create your account"
      subtitle="Track spending, budgets, and net worth in one place"
      footer={
        <>
          Already have an account?{' '}
          <Link component={RouterLink} to="/login">
            Log in
          </Link>
        </>
      }
    >
      <Box component="form" noValidate onSubmit={onSubmit}>
        <Stack spacing={2.5}>
          {submitError && <Alert severity="error">{submitError}</Alert>}

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
            autoComplete="new-password"
            fullWidth
            error={Boolean(errors.password)}
            helperText={errors.password?.message ?? 'At least 8 characters'}
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

          <Controller
            control={control}
            name="baseCurrency"
            render={({ field }) => (
              <TextField
                {...field}
                select
                label="Base currency"
                fullWidth
                error={Boolean(errors.baseCurrency)}
                helperText={errors.baseCurrency?.message ?? 'Used for all balances and budgets'}
              >
                {BASE_CURRENCIES.map((code) => (
                  <MenuItem key={code} value={code}>
                    {code}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>

          {flags.oauth && <GoogleSignInButton label="Sign up with Google" />}
        </Stack>
      </Box>
    </AuthShell>
  );
}
