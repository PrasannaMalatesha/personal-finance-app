import { useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
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
import { ResetPasswordSchema, type ResetPasswordInput } from './schemas';
import { resetPassword } from './authApi';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    mode: 'onBlur',
    defaultValues: { newPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      resetPassword({ token, newPassword: input.newPassword }),
    onSuccess: () => {
      // Land on /login with a query hint so the login page can show a
      // one-time success banner without needing session/route state.
      navigate('/login?reset=success', { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        setErrorMsg('This reset link is invalid or has expired. Request a new one.');
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Something went wrong. Please try again.');
      }
    },
  });

  const onSubmit = handleSubmit((input) => {
    setErrorMsg(null);
    mutation.mutate(input);
  });

  if (!token) {
    return (
      <AuthShell
        title="Missing reset token"
        subtitle="The link you followed didn't include a valid token."
        footer={
          <>
            <Link component={RouterLink} to="/forgot-password">
              Request a new reset link
            </Link>
          </>
        }
      >
        <Alert severity="error">
          Copy the full URL from your email — the token part is missing.
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Pick something you'll remember — at least 8 characters."
      footer={
        <>
          Back to{' '}
          <Link component={RouterLink} to="/login">
            log in
          </Link>
        </>
      }
    >
      <Box component="form" noValidate onSubmit={onSubmit}>
        <Stack spacing={2.5}>
          {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
          <TextField
            {...register('newPassword')}
            label="New password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus
            fullWidth
            error={Boolean(errors.newPassword)}
            helperText={errors.newPassword?.message}
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
                      {showPassword ? (
                        <VisibilityOff fontSize="small" />
                      ) : (
                        <Visibility fontSize="small" />
                      )}
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
            disabled={isSubmitting || mutation.isPending}
          >
            {mutation.isPending ? 'Setting new password…' : 'Set new password'}
          </Button>
        </Stack>
      </Box>
    </AuthShell>
  );
}
